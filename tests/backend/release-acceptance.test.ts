import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { sha256 } from '../../tooling/scripts/rep-release/build-proof.mts';
import { createEnvironmentSecrets } from '../../infra/environments/secrets.mts';
import { environmentSourceRoot } from '../../infra/environments/private-path.mts';
import {
  requiredScenarios,
  validateAcceptance,
  verifyEvidence,
} from '../../tooling/scripts/rep-release/acceptance.mts';
import { repReleaseConfig } from '../../tooling/scripts/rep-release/release-config.mts';

const revision = 'a'.repeat(40);
const now = Date.parse('2026-11-18T10:00:00Z');
function fixture() {
  return {
    schemaVersion: 1,
    environment: 'staging',
    sourceRevision: revision,
    testedAt: '2026-11-18T09:00:00Z',
    reviewer: 'QA fixture',
    productionPromotionApproved: true,
    staging: {
      projectId: 'staging-project',
      environmentId: 'staging-environment',
      gateway: 'https://stage.elvorance.dev',
      issuer: 'https://identity.elvorance.dev/realms/elvorance-staging',
      databaseIsolation: 'passed',
      realmIsolation: 'passed',
    },
    checks: Object.fromEntries(
      [
        'backendPostgres',
        'oidc',
        'databaseIsolation',
        'nativeBuilds',
        'architecture',
        'businessFlows',
        'securityReview',
        'loadTest',
        'backupRestore',
      ].map((key) => [key, 'passed']),
    ),
    serviceImages: Object.fromEntries(
      [
        'api-gateway',
        'identity',
        'crm',
        'sales',
        'delivery',
        'billing',
        'tracking',
        'communications',
        'postgres',
        'rabbitmq',
        'keycloak',
        'edge',
      ].map((name) => [name, `ghcr.io/fixture/${name}@sha256:${'a'.repeat(64)}`]),
    ),
    devices: ['android', 'ios'].map((platform) => ({
      platform,
      physical: true,
      model: 'test fixture only',
      osVersion: '1',
      appId: 'com.elvorance.rep.staging',
      sourceRevision: revision,
      signedArtifactSha256: 'b'.repeat(64),
      scenarios: Object.fromEntries(requiredScenarios.map((key) => [key, 'passed'])),
      evidence: [
        {
          path: `artifacts/${platform === 'android' ? 'app.aab' : 'app.ipa'}`,
          sha256: 'b'.repeat(64),
        },
        { path: 'fixture-report.json', sha256: 'c'.repeat(64) },
      ],
    })),
    evidence: [{ path: 'fixture-backend.json', sha256: 'd'.repeat(64) }],
  };
}

async function writeTestEvidence(directory: string) {
  const input = fixture();
  for (const reference of [
    ...input.evidence,
    ...input.devices.flatMap((device) => device.evidence),
  ]) {
    // Synthetic bytes exercise digest verification only, never physical acceptance.
    const bytes = `isolated automated test fixture: ${reference.path}`;
    reference.sha256 = sha256(bytes);
    await mkdir(dirname(resolve(directory, reference.path)), { recursive: true });
    await writeFile(resolve(directory, reference.path), bytes);
  }
  for (const device of input.devices) device.signedArtifactSha256 = device.evidence[0]!.sha256;
  return input;
}
test('production gate rejects simulator, unfinished scenario, stale source and missing review', () => {
  assert.equal(validateAcceptance(fixture(), revision, now).sourceRevision, revision);
  const simulation = fixture();
  simulation.devices[0]!.physical = false;
  assert.throws(() => validateAcceptance(simulation, revision, now), /physical android/);
  const pending = fixture();
  pending.devices[1]!.scenarios['logout-clears-vault'] = 'pending';
  assert.throws(() => validateAcceptance(pending, revision, now), /logout-clears-vault/);
  assert.throws(() => validateAcceptance(fixture(), 'b'.repeat(40), now), /source differs/);
  const unapproved = fixture();
  unapproved.productionPromotionApproved = false;
  assert.throws(() => validateAcceptance(unapproved, revision, now), /QA approval/);
  assert.throws(() => validateAcceptance(fixture(), revision, now + 8 * 86_400_000), /seven days/);
});

test('promotion requires tested infrastructure images, all device results and packaged artifact linkage', () => {
  for (const name of ['postgres', 'rabbitmq', 'keycloak', 'edge']) {
    const report = fixture();
    delete report.serviceImages[name];
    assert.throws(() => validateAcceptance(report, revision, now), new RegExp(name));
  }
  const withoutPackage = fixture();
  withoutPackage.devices[0]!.evidence.shift();
  assert.throws(() => validateAcceptance(withoutPackage, revision, now), /signed .aab/);
  const mismatchedPackage = fixture();
  mismatchedPackage.devices[1]!.evidence[0]!.sha256 = 'e'.repeat(64);
  assert.throws(() => validateAcceptance(mismatchedPackage, revision, now), /signed .ipa/);
  const failedExtraDevice = fixture();
  failedExtraDevice.devices.push({ ...failedExtraDevice.devices[0]!, physical: false });
  assert.throws(() => validateAcceptance(failedExtraDevice, revision, now), /physical android/);
});

test('acceptance verifies packaged bytes and prevents evidence path escapes', async () => {
  const base = await mkdtemp(resolve(tmpdir(), 'elvorance-acceptance-'));
  const directory = resolve(base, 'evidence');
  await mkdir(resolve(directory, 'artifacts'), { recursive: true });
  try {
    const input = await writeTestEvidence(directory);
    const report = validateAcceptance(input, revision, now);
    await verifyEvidence(report, directory);
    await writeFile(resolve(directory, 'artifacts/app.aab'), 'changed test fixture');
    await assert.rejects(() => verifyEvidence(report, directory), /digest differs/);
    await writeFile(
      resolve(directory, 'artifacts/app.aab'),
      'isolated automated test fixture: artifacts/app.aab',
    );
    const outside = resolve(base, 'outside-report.json');
    await writeFile(outside, 'isolated automated test fixture: fixture-backend.json');
    report.evidence[0]!.path = '../outside-report.json';
    await assert.rejects(() => verifyEvidence(report, directory), /escapes/);
    if (process.platform !== 'win32') {
      report.evidence[0]!.path = 'fixture-backend.json';
      await rm(resolve(directory, 'fixture-backend.json'));
      await symlink(outside, resolve(directory, 'fixture-backend.json'));
      await assert.rejects(() => verifyEvidence(report, directory), /escapes/);
    }
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test(
  'production renderer fails closed without evidence, with untested images or reused staging hosts',
  {
    skip:
      process.platform === 'win32'
        ? 'Compose secret generation requires Linux/WSL with POSIX permissions.'
        : false,
  },
  async () => {
    const base = await realpath(await mkdtemp(resolve(tmpdir(), 'elvorance-render-gate-')));
    const directory = resolve(base, 'evidence');
    try {
      const report = await writeTestEvidence(directory);
      report.testedAt = new Date(Date.now() - 1000).toISOString();
      const acceptance = resolve(directory, 'acceptance.json');
      await writeFile(acceptance, JSON.stringify(report));
      const secretsDirectory = resolve(base, 'production-secrets');
      await createEnvironmentSecrets(secretsDirectory, 'production');
      const spec = {
        environment: 'production',
        sourceRevision: revision,
        gatewayOrigin: 'https://api.elvorance.dev',
        issuer: 'https://production-identity.elvorance.dev/realms/elvorance-production',
        secretsDirectory,
        images: report.serviceImages,
      };
      const specFile = resolve(base, 'spec.json');
      const output = resolve(base, 'compose.json');
      const run = (evidence?: string) =>
        spawnSync(
          process.execPath,
          [
            resolve(environmentSourceRoot, 'infra/environments/render.mts'),
            specFile,
            output,
            ...(evidence ? [evidence] : []),
          ],
          { encoding: 'utf8', cwd: environmentSourceRoot },
        );
      await writeFile(specFile, JSON.stringify(spec));
      const missing = run();
      assert.notEqual(missing.status, 0);
      assert.match(missing.stderr, /requires verified Staging acceptance/);
      await writeFile(
        specFile,
        JSON.stringify({
          ...spec,
          images: {
            ...spec.images,
            keycloak: `quay.io/keycloak/keycloak@sha256:${'f'.repeat(64)}`,
          },
        }),
      );
      const image = run(acceptance);
      assert.notEqual(image.status, 0);
      assert.match(image.stderr, /image differs.*keycloak/);
      await writeFile(
        specFile,
        JSON.stringify({ ...spec, gatewayOrigin: new URL(report.staging.issuer).origin }),
      );
      const host = run(acceptance);
      assert.notEqual(host.status, 0);
      assert.match(host.stderr, /separate endpoints/);
      assert.equal(
        existsSync(output),
        false,
        'failed acceptance must not create deployment output',
      );
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  },
);
test('mobile release configuration fails closed on demo defaults and cross-environment identity', () => {
  assert.throws(() => repReleaseConfig({}), /APP_ENV/);
  const env = {
    APP_ENV: 'staging',
    REP_API_BASE_URL: 'https://stage.elvorance.dev',
    REP_OIDC_ISSUER: 'https://identity.elvorance.dev/realms/elvorance-staging',
    REP_OIDC_CLIENT_ID: 'elvorance-rep-staging',
  };
  assert.equal(repReleaseConfig(env).auth.redirectUri, 'com.elvorance.rep.staging:/oauth2redirect');
  assert.throws(
    () =>
      repReleaseConfig({
        ...env,
        REP_OIDC_ISSUER: env.REP_OIDC_ISSUER.replace('-staging', '-production'),
      }),
    /realm/,
  );
  assert.throws(
    () => repReleaseConfig({ ...env, REP_PRODUCTION_API_BASE_URL: env.REP_API_BASE_URL }),
    /share a gateway/,
  );
  assert.throws(
    () => repReleaseConfig({ ...env, REP_API_BASE_URL: 'https://example.com' }),
    /real HTTPS/,
  );
});

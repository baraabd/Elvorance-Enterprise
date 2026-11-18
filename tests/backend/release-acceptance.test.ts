import test from 'node:test';
import assert from 'node:assert/strict';
import {
  requiredScenarios,
  validateAcceptance,
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
      evidence: [{ path: 'fixture-report.json', sha256: 'c'.repeat(64) }],
    })),
    evidence: [{ path: 'fixture-backend.json', sha256: 'd'.repeat(64) }],
  };
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

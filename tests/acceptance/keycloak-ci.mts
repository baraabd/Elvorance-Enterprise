import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, chmod, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { request } from 'node:https';

assert.equal(process.env.CI, 'true');
assert.equal(process.env.ELVORANCE_DISPOSABLE_ACCEPTANCE, '1');
const run = process.env.GITHUB_RUN_ID ?? '';
const attempt = process.env.GITHUB_RUN_ATTEMPT ?? '';
assert.match(run, /^\d+$/);
assert.match(attempt, /^\d+$/);
const name = `elvorance-identity-acceptance-${run}-${attempt}`;
const temporary = await mkdtemp(join(tmpdir(), name + '-'));
const cert = join(temporary, 'tls.crt');
const key = join(temporary, 'tls.key');
const envFile = join(temporary, 'container.env');
const tokenFile = join(temporary, 'admin-token');
const base = 'https://127.0.0.1:28443';
const password = randomBytes(32).toString('base64url');
const output = resolve(process.env.ELVORANCE_ACCEPTANCE_REPORT_DIR ?? 'dist/acceptance/evidence');
await mkdir(output, { recursive: true });
let created = false;
try {
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
    ],
    { stdio: 'pipe', timeout: 10000 },
  );
  // Disposable self-signed CI key; bind-mount only these files, not the secret directory.
  await chmod(key, 0o644);
  await writeFile(
    envFile,
    `KC_BOOTSTRAP_ADMIN_USERNAME=acceptance-admin\nKC_BOOTSTRAP_ADMIN_PASSWORD=${password}\n`,
    { mode: 0o600 },
  );
  execFileSync(
    'docker',
    [
      'run',
      '-d',
      '--name',
      name,
      '--cpus',
      '2',
      '--memory',
      '1536m',
      '-p',
      '127.0.0.1:28443:8443',
      '--env-file',
      envFile,
      '-v',
      `${cert}:/tmp/tls.crt:ro`,
      '-v',
      `${key}:/tmp/tls.key:ro`,
      'quay.io/keycloak/keycloak:26.8.2',
      'start-dev',
      '--http-enabled=false',
      '--https-certificate-file=/tmp/tls.crt',
      '--https-certificate-key-file=/tmp/tls.key',
      `--hostname=${base}`,
    ],
    { stdio: 'pipe', timeout: 120000 },
  );
  created = true;
  const ca = await readFile(cert);
  async function localRequest(
    path: string,
    body?: string,
  ): Promise<{ status: number; text: string }> {
    const target = new URL(path, base);
    assert.equal(target.origin, base);
    return new Promise((resolve, reject) => {
      const req = request(
        target,
        {
          ca,
          method: body ? 'POST' : 'GET',
          timeout: 5000,
          headers: body ? { 'content-type': 'application/x-www-form-urlencoded' } : {},
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (data: Buffer) => chunks.push(data));
          response.on('end', () =>
            resolve({
              status: response.statusCode ?? 0,
              text: Buffer.concat(chunks).toString('utf8'),
            }),
          );
        },
      );
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Local fixture timeout')));
      req.end(body);
    });
  }
  let ready = false;
  for (let n = 0; n < 90; n++) {
    try {
      if ((await localRequest('/realms/master/.well-known/openid-configuration')).status === 200) {
        ready = true;
        break;
      }
    } catch {
      /* Startup can temporarily refuse connections. */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.ok(ready, 'Disposable Keycloak did not become ready');
  const response = await localRequest(
    '/realms/master/protocol/openid-connect/token',
    new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: 'acceptance-admin',
      password,
    }).toString(),
  );
  assert.equal(response.status, 200, 'Local fixture administrator login failed');
  const access = (JSON.parse(response.text) as { access_token?: string }).access_token;
  assert.ok(access);
  await writeFile(tokenFile, access, { mode: 0o600 });
  const result = spawnSync(process.execPath, ['tooling/scripts/test-local-identity.mts'], {
    stdio: 'inherit',
    timeout: 150000,
    env: {
      ...process.env,
      NODE_EXTRA_CA_CERTS: cert,
      LOCAL_KEYCLOAK_BASE_URL: base,
      ELVORANCE_IDENTITY_LOCAL_TEST: '1',
      KEYCLOAK_ADMIN_TOKEN_FILE: tokenFile,
      ELVORANCE_IDENTITY_TEST_REPORT: join(output, 'oidc-ci.json'),
    },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'Real Keycloak synthetic-account code/PKCE journey failed');
  const image = execFileSync('docker', ['inspect', '--format', '{{.Image}}', name], {
    encoding: 'utf8',
  }).trim();
  const proof = {
    scope:
      'Real Keycloak server, synthetic disposable CI account; NOT a company account, hosted staging or physical device',
    image,
    sourceSha: process.env.GITHUB_SHA,
    fixtureDeleted: false,
  };
  execFileSync('docker', ['rm', '-f', name], { stdio: 'pipe', timeout: 30000 });
  created = false;
  proof.fixtureDeleted = true;
  await writeFile(join(output, 'oidc-ci-provenance.json'), JSON.stringify(proof, null, 2) + '\n');
} finally {
  if (created) execFileSync('docker', ['rm', '-f', name], { stdio: 'pipe', timeout: 30000 });
  await rm(temporary, { recursive: true, force: true });
}

/** Disposable loopback fixture ONLY. Never accepts hosted/prod endpoints or external credentials. */
import { randomBytes } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { mkdtemp, readFile, writeFile, chmod, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const image = 'quay.io/keycloak/keycloak:26.8.2';
const runId = process.env.GITHUB_RUN_ID ?? String(process.pid),
  attempt = process.env.GITHUB_RUN_ATTEMPT ?? '0';
if (!/^\d+$/.test(runId) || !/^\d+$/.test(attempt))
  throw new Error('Invalid isolated fixture identity');
const name = `elvorance-s01-identity-${runId}-${attempt}`,
  base = 'https://127.0.0.1:18443';
const uid = process.getuid?.();
if (uid === undefined || uid <= 0)
  throw new Error('Disposable identity verification requires a non-root POSIX runner.');
const directory = await mkdtemp(resolve(tmpdir(), 'elvorance-s01-identity-'));
const certificate = resolve(directory, 'localhost.crt'),
  key = resolve(directory, 'localhost.key'),
  tokenFile = resolve(directory, 'admin-token');
let created = false;
const password = randomBytes(32).toString('base64url');
function command(executable: string, args: string[], env: NodeJS.ProcessEnv = process.env): string {
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    env,
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(
      `Disposable identity fixture command ${executable} failed (${result.status ?? 'unexecuted'}).`,
    );
  return result.stdout.trim();
}
async function localRequest(
  path: string,
  body?: string,
): Promise<{ status: number; body: string }> {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..'))
    throw new Error('Invalid local fixture path');
  const ca = await readFile(certificate);
  return new Promise((resolveResponse, reject) => {
    const request = httpsRequest(
      base + path,
      {
        ca,
        method: body ? 'POST' : 'GET',
        headers: body ? { 'content-type': 'application/x-www-form-urlencoded' } : {},
        timeout: 5000,
      },
      (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          text += chunk;
          if (text.length > 1_000_000) request.destroy(new Error('Oversized local response'));
        });
        response.on('end', () => resolveResponse({ status: response.statusCode ?? 0, body: text }));
      },
    );
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('Local fixture timeout')));
    if (body) request.write(body);
    request.end();
  });
}
try {
  command('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-sha256',
    '-nodes',
    '-keyout',
    key,
    '-out',
    certificate,
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost,IP:127.0.0.1',
    '-addext',
    'basicConstraints=critical,CA:TRUE',
  ]);
  await chmod(key, 0o600);
  // Match the private bind-mount owner without root or DAC-override capabilities.
  // The official image grants its application directories write access to group 0.
  command(
    'docker',
    [
      'run',
      '--detach',
      '--name',
      name,
      '--user',
      `${uid}:0`,
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--publish',
      '127.0.0.1:18443:8443',
      '--mount',
      `type=bind,src=${directory},dst=/fixture,readonly`,
      '--env',
      'KC_BOOTSTRAP_ADMIN_USERNAME',
      '--env',
      'KC_BOOTSTRAP_ADMIN_PASSWORD',
      image,
      'start-dev',
      '--http-enabled=false',
      '--https-certificate-file=/fixture/localhost.crt',
      '--https-certificate-key-file=/fixture/localhost.key',
      `--hostname=${base}`,
      '--hostname-strict=true',
    ],
    {
      ...process.env,
      KC_BOOTSTRAP_ADMIN_USERNAME: 's01-fixture-admin',
      KC_BOOTSTRAP_ADMIN_PASSWORD: password,
    },
  );
  created = true;
  let ready = false;
  for (let count = 0; count < 90; count++) {
    if (command('docker', ['inspect', '--format', '{{.State.Status}}', name]) !== 'running')
      throw new Error('Disposable identity container exited before TLS readiness');
    try {
      if ((await localRequest('/realms/master/.well-known/openid-configuration')).status === 200) {
        ready = true;
        break;
      }
    } catch {
      /* Readiness failures are expected only while the local container starts. */
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2000));
  }
  if (!ready) throw new Error('Loopback TLS identity fixture never became ready');
  const response = await localRequest(
    '/realms/master/protocol/openid-connect/token',
    new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: 's01-fixture-admin',
      password,
    }).toString(),
  );
  const parsed = JSON.parse(response.body) as { access_token?: unknown };
  if (response.status !== 200 || typeof parsed.access_token !== 'string')
    throw new Error('Disposable fixture administration authentication failed');
  await writeFile(tokenFile, parsed.access_token, { mode: 0o600 });
  const result = spawnSync(process.execPath, ['tooling/scripts/test-local-identity.mts'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      ELVORANCE_IDENTITY_LOCAL_TEST: '1',
      LOCAL_KEYCLOAK_BASE_URL: base,
      KEYCLOAK_ADMIN_TOKEN_FILE: tokenFile,
      NODE_EXTRA_CA_CERTS: certificate,
    },
    timeout: 180_000,
  });
  if (result.status !== 0) throw new Error('Existing real Keycloak integration suite did not pass');
  await mkdir('dist', { recursive: true });
  const images = command('docker', [
    'image',
    'inspect',
    image,
    '--format',
    '{{json .RepoDigests}}',
  ]);
  await writeFile(
    'dist/identity-fixture-images.json',
    JSON.stringify(
      {
        image,
        digests: JSON.parse(images) as unknown,
        fixture: 'disposable-loopback-tls',
        hostedStaging: false,
      },
      null,
      2,
    ) + '\n',
  );
} catch (error) {
  if (created) {
    const diagnostic = spawnSync('docker', ['logs', '--tail', '80', name], {
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: 128 * 1024,
    });
    // Do not inspect environment variables or emit credential material.
    const text = (diagnostic.stdout + diagnostic.stderr).replaceAll(password, '[redacted]');
    process.stderr.write(text);
  }
  throw error;
} finally {
  if (created) {
    const cleanup = spawnSync('docker', ['rm', '--force', name], {
      stdio: 'ignore',
      timeout: 30_000,
    });
    if (cleanup.status !== 0) process.exitCode = 1;
  }
  await rm(directory, { recursive: true, force: true });
}

// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** Optional real database verifier. No production URL is used and no password is printed.
 * Install embedded-postgres separately, or set ELVORANCE_EMBEDDED_POSTGRES_MODULE to its JS entry point.
 * Standard CI can instead run npm test with ELVORANCE_TEST_POSTGRES_URL pointing at a disposable admin database.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const moduleId = process.env.ELVORANCE_EMBEDDED_POSTGRES_MODULE ?? 'embedded-postgres';
const { default: EmbeddedPostgres } = await import(moduleId);
const directory = await mkdtemp(join(tmpdir(), 'elvorance-postgres-test-'));
const probe = createServer();
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const password = randomBytes(32).toString('hex');
const startupLogs = [];
const database = new EmbeddedPostgres({
  databaseDir: join(directory, 'db'),
  user: 'postgres',
  password,
  port,
  persistent: false,
  authMethod: 'scram-sha-256',
  postgresFlags: ['-h', '127.0.0.1', '-c', 'unix_socket_directories='],
  onLog: (message) => startupLogs.push(String(message)),
  onError: (message) => startupLogs.push(String(message)),
});
let started = false;
let failed = false;
let phase = 'initialise';
try {
  await database.initialise();
  phase = 'start';
  await database.start();
  started = true;
  phase = 'build';
  const outfile = join(directory, 'postgres.test.mjs');
  await build({
    entryPoints: [resolve(root, 'tests/backend/postgres.test.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    external: ['pg-native'],
    banner: {
      js: "import { createRequire as __elvoranceCreateRequire } from 'node:module'; const require = __elvoranceCreateRequire(import.meta.url);",
    },
  });
  phase = 'test';
  const child = spawn(process.execPath, ['--test', outfile], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      ELVORANCE_TEST_POSTGRES_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`,
    },
  });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
} catch (error) {
  failed = true;
  const detail = String(
    (error instanceof Error ? error.message : error) ?? startupLogs.slice(-5).join(' '),
  )
    .replaceAll(password, '[REDACTED]')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[REDACTED_URL]')
    .slice(0, 1200);
  process.stderr.write(`PostgreSQL integration verifier failed during ${phase}: ${detail}\n`);
  process.exitCode = 1;
} finally {
  if (started) await database.stop();
  await rm(directory, { recursive: true, force: true });
  if (failed) process.exitCode = 1;
}

// Preserve the test exit status when the optional embedded server registers an exit hook.
process.exit(Number(process.exitCode ?? 0));

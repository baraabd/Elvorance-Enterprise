import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const storage = process.env.ELVORANCE_ADMIN_E2E_STORAGE;
if (storage !== 'memory' && storage !== 'postgres')
  throw new Error(
    'Choose ELVORANCE_ADMIN_E2E_STORAGE=postgres for persistence acceptance, or memory for explicitly limited local testing.',
  );
if (process.env.CI && (storage !== 'postgres' || process.env.ELVORANCE_ADMIN_E2E_DRIVER === 'dom'))
  throw new Error('CI browser acceptance must use PostgreSQL, without a memory fallback.');
const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, 'dist/admin-e2e');
await mkdir(output, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['tests/admin/e2e.ts'],
  outfile: resolve(output, 'e2e.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['pg-native', 'esbuild'],
  banner: {
    js: "import {createRequire as __elvCreateRequire} from 'node:module';const require=__elvCreateRequire(import.meta.url);",
  },
});
const result = spawnSync(
  process.execPath,
  ['--test', '--test-reporter=tap', resolve(output, 'e2e.mjs')],
  { cwd: root, env: process.env, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
);
const log = (result.stdout ?? '') + (result.stderr ?? '');
process.stdout.write(log);
await writeFile(resolve(output, 'browser.tap'), log);
await writeFile(
  resolve(output, 'execution.json'),
  JSON.stringify(
    {
      storage,
      driver: process.env.ELVORANCE_ADMIN_E2E_DRIVER === 'dom' ? 'dom-only' : 'chromium',
      exitCode: result.status,
      source: process.env.GITHUB_SHA ?? 'local-unpublished',
      node: process.version,
      executedAt: new Date().toISOString(),
      limitations: [
        'Synthetic test identities and fixtures, not company accounts.',
        'No hosted OIDC login, RabbitMQ, native device or production deployment is exercised by this browser suite.',
      ],
    },
    null,
    2,
  ) + '\n',
);
process.exit(result.status ?? 1);

import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

if (process.env.ELVORANCE_IDENTITY_LOCAL_TEST !== '1') {
  throw new Error('Local identity integration requires ELVORANCE_IDENTITY_LOCAL_TEST=1.');
}
const outfile = resolve('dist/tests/identity/local-keycloak-smoke.mjs');
await build({
  entryPoints: ['tests/identity/local-keycloak-smoke.mts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['jsdom'],
});
const result = spawnSync(process.execPath, [outfile], {
  stdio: 'inherit',
  env: process.env,
  timeout: 120_000,
});
process.exitCode = result.status ?? 1;

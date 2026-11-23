import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const modes = {
  authorization: 'tests/backend/authorization-matrix.test.ts',
  'postgres-recovery': 'tests/acceptance/postgres-recovery.mts',
} as const;
const mode = process.argv[2];
if (!mode || !Object.hasOwn(modes, mode)) throw new Error('Use authorization or postgres-recovery');
const outfile = resolve('dist/acceptance', mode + '.mjs');
await build({
  entryPoints: [modes[mode as keyof typeof modes]],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['pg-native'],
  banner: {
    js: 'import {createRequire} from "node:module"; const require=createRequire(import.meta.url);',
  },
});
const result = spawnSync(
  process.execPath,
  [...(mode === 'authorization' ? ['--test'] : []), outfile],
  { stdio: 'inherit', timeout: 180000 },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

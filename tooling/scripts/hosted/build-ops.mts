import { build } from 'esbuild';
await build({
  entryPoints: ['infra/railway/staging/entry.mts'],
  outfile: 'dist/staging-ops.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['pg-native', 'jsdom'],
  banner: {
    js: 'import {createRequire} from "node:module"; const require=createRequire(import.meta.url);',
  },
});

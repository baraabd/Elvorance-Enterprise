import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, serviceNames } from './workspace.mjs';

for (const name of serviceNames) {
  await mkdir(resolve(root, `dist/services/${name}`), { recursive: true });
  await build({
    entryPoints: [resolve(root, `services/${name}/src/main.ts`)],
    outfile: resolve(root, `dist/services/${name}/index.mjs`),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    external: ['pg-native'],
    banner: {
      js: "import { createRequire as __atlasCreateRequire } from 'node:module'; const require = __atlasCreateRequire(import.meta.url);",
    },
    sourcemap: true,
    legalComments: 'none',
  });
  console.log(`Built independent service: ${name}`);
}

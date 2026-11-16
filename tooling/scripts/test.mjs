import { readdir, mkdir } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { root, apps } from './workspace.mjs';
import { assertAppBuild } from './app-build-proof.mjs';

// Tests consume real build output. Fail with one actionable error instead of
// reporting three misleading ENOENT failures after an interrupted build.
for (const app of apps) await assertAppBuild(app.folder);

async function walk(dir) {
  const found = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'android', 'ios', 'baseline'].includes(item.name)) continue;
    const file = resolve(dir, item.name);
    if (item.isDirectory()) found.push(...(await walk(file)));
    else if (/\.test\.(mjs|cjs|ts|js)$/.test(item.name)) found.push(file);
  }
  return found;
}
const files = [
  ...(await walk(resolve(root, 'tests'))),
  ...(await walk(resolve(root, 'packages'))),
].sort();
if (!files.length) throw new Error('No test files found.');
const runnable = [];
for (const file of files) {
  if (!file.endsWith('.ts')) {
    runnable.push(file);
    continue;
  }
  const outfile = resolve(root, 'dist/tests', relative(root, file).replace(/\.ts$/, '.mjs'));
  await mkdir(dirname(outfile), { recursive: true });
  await build({
    entryPoints: [file],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    external: ['pg-native'],
    banner: {
      js: "import { createRequire as __atlasCreateRequire } from 'node:module'; const require = __atlasCreateRequire(import.meta.url);",
    },
  });
  runnable.push(outfile);
}
const result = spawnSync(process.execPath, ['--test', ...runnable], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);

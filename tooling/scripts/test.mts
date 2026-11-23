// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import { readdir, mkdir } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { root, apps } from './workspace.mts';
import { assertAppBuild } from './app-build-proof.mts';

// Tests consume real build output. Fail with one actionable error instead of
// reporting three misleading ENOENT failures after an interrupted build.
for (const app of apps) await assertAppBuild(app.folder);

async function walk(dir) {
  const found = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'android', 'ios', 'baseline'].includes(item.name)) continue;
    const file = resolve(dir, item.name);
    if (item.isDirectory()) found.push(...(await walk(file)));
    else if (/\.test\.(mts|cts|ts|tsx)$/.test(item.name)) found.push(file);
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
  if (file.endsWith('.mts')) {
    runnable.push(file);
    continue;
  }
  const isCjs = file.endsWith('.cts');
  const outfile = resolve(
    root,
    'dist/tests',
    relative(root, file).replace(/\.(ts|mts|cts)$/, isCjs ? '.cjs' : '.mjs'),
  );
  await mkdir(dirname(outfile), { recursive: true });
  await build({
    entryPoints: [file],
    outfile,
    bundle: true,
    platform: 'node',
    format: isCjs ? 'cjs' : 'esm',
    target: 'node24',
    external: ['pg-native', ...(isCjs ? ['esbuild', 'jsdom'] : [])],
    banner: {
      js: isCjs
        ? ''
        : "import { createRequire as __elvoranceCreateRequire } from 'node:module'; const require = __elvoranceCreateRequire(import.meta.url);",
    },
  });
  runnable.push(outfile);
}
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...runnable], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);

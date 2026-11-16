// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import { build } from 'esbuild';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, apps } from './workspace.mts';

const output = resolve(root, 'dist/test-adapters');
await mkdir(resolve(output, 'src/shared'), { recursive: true });
await mkdir(resolve(output, 'src/apps'), { recursive: true });
await mkdir(resolve(root, 'dist/evidence/regression'), { recursive: true });
const bundle = async (source, file) =>
  build({
    stdin: { contents: source, resolveDir: root, sourcefile: 'current-workspace-adapter.js' },
    outfile: resolve(output, file),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: false,
  });
await bundle(
  "import { icons } from '@elvorance/design-system/icons'; window.ElvoranceIcons = icons;",
  'src/shared/icons.js',
);
await bundle(
  "import { createDemoData } from '@elvorance/demo-data'; window.ElvoranceSeed = createDemoData;",
  'src/shared/seed.js',
);
await bundle(
  "import { installRuntime } from '@elvorance/app-runtime'; installRuntime();",
  'src/shared/core.js',
);
await bundle(
  "import { installSiteTracking } from '@elvorance/app-runtime/tracking'; installSiteTracking();",
  'src/shared/tracking.js',
);
for (const app of apps)
  await bundle(
    `import { registerApp } from './apps/${app.folder}/src/app.ts'; registerApp(window.Elvorance);`,
    `src/apps/${app.id}.js`,
  );
await copyFile(
  resolve(root, 'packages/design-system/src/styles.css'),
  resolve(output, 'src/shared/styles.css'),
);
const suites = [
  'rep-flows',
  'client-flows',
  'admin-flows',
  'rep-journey',
  'client-lifecycle',
  'workflow-audit',
  'tracking-client',
];
const summary = [];
for (const suite of suites) {
  const result = spawnSync(process.execPath, [resolve(root, `tests/regression/${suite}.cts`)], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 12 * 1024 * 1024,
  });
  await writeFile(
    resolve(root, `dist/evidence/regression/${suite}.log`),
    (result.stdout || '') + '\n' + (result.stderr || ''),
  );
  summary.push({ suite, status: result.status === 0 ? 'passed' : 'failed' });
  console.log(`${result.status === 0 ? 'PASS' : 'FAIL'} current modular frontend: ${suite}`);
  if (result.status !== 0) console.error((result.stderr || result.stdout || '').slice(-6000));
}
await writeFile(
  resolve(root, 'dist/evidence/regression/summary.json'),
  JSON.stringify(
    {
      method:
        'Original behavioral scenarios run against bundles freshly generated from current ES modules',
      scope:
        'JSDOM and synthetic local state; excludes physical devices, native layout, live GPS and server execution',
      results: summary,
    },
    null,
    2,
  ),
);
if (summary.some((row) => row.status === 'failed')) process.exitCode = 1;

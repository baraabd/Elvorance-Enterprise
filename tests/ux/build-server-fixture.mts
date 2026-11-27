import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(process.argv[2] ?? '.');
const output = resolve(process.argv[3] ?? 'dist/ux-server');
const before = process.argv.includes('--before');
await mkdir(output, { recursive: true });
let source = await readFile(new URL('./server-entry.ts', import.meta.url), 'utf8');
if (before)
  source = source.replace(
    "import { installEnterpriseUx } from '../../packages/ui/src/enterprise-ux.ts';",
    'const installEnterpriseUx = (_root: HTMLElement, _options: unknown) => () => {};',
  );
const packages = [
  'api-client',
  'ui',
  'design-system',
  'contracts',
  'mobile-platform',
  'mobile-auth',
  'questionnaire',
];
const aliases: Record<string, string> = {};
for (const name of packages) {
  const manifest = JSON.parse(
    await readFile(resolve(root, 'packages', name, 'package.json'), 'utf8'),
  ) as { exports: Record<string, string | { default: string }> };
  for (const [key, value] of Object.entries(manifest.exports))
    aliases[`@elvorance/${name}${key === '.' ? '' : key.slice(1)}`] = resolve(
      root,
      'packages',
      name,
      typeof value === 'string' ? value : value.default,
    );
}
await mkdir(resolve(root, 'tests/ux'), { recursive: true });
const bundle = await build({
  stdin: { contents: source, resolveDir: resolve(root, 'tests/ux'), loader: 'ts' },
  absWorkingDir: root,
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  alias: aliases,
});
const outputFile = bundle.outputFiles[0];
if (!outputFile) throw new Error('Server fixture bundle was not emitted.');
await writeFile(resolve(output, 'fixture.js'), outputFile.text);
for (const [name, files] of Object.entries({
  rep: [
    'apps/rep-mobile/src/server/styles.css',
    'packages/design-system/src/arabic-accessibility.css',
  ],
  ...Object.fromEntries(
    ['admin-web', 'client-mobile', 'rep-mobile'].map((app) => [
      app,
      [
        'packages/design-system/src/styles.css',
        'packages/design-system/src/polish.css',
        'packages/design-system/src/tracking.css',
        `apps/${app}/src/styles.css`,
        'packages/design-system/src/arabic-accessibility.css',
      ],
    ]),
  ),
})) {
  const css = (
    await Promise.all(
      [...files, ...(before ? [] : ['packages/design-system/src/enterprise.css'])].map((file) =>
        readFile(resolve(root, file), 'utf8'),
      ),
    )
  )
    .join('\n')
    .replace(/^@font-face\{font-family:ElvoranceArabic;.*$/gm, '');
  await writeFile(resolve(output, `${name}.css`), css);
}

import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { apps, root } from './workspace.mjs';
import { copyContent } from './copy-content.mjs';
import { invalidateAppBuilds, recordAppBuild, completeAppBuilds } from './app-build-proof.mjs';

await invalidateAppBuilds();
const buildRecords = [];

const read = (path) => readFile(resolve(root, path), 'utf8');
// The deliverable does not redistribute embedded font binaries.
// Consumers may add their own licensed fonts; system Arabic fallbacks work without them.
const systemFontCss = (css) => css.replace(/^@font-face\{font-family:AtlasArabic;.*$/gm, '');
const commonCss = (
  await Promise.all(
    ['styles', 'polish', 'tracking'].map((name) => read(`packages/design-system/src/${name}.css`)),
  )
).join('\n');
await mkdir(resolve(root, 'dist'), { recursive: true });
for (const app of apps) {
  const output = resolve(root, `apps/${app.folder}/dist`);
  await mkdir(resolve(output, 'assets'), { recursive: true });
  const result = await build({
    absWorkingDir: root,
    entryPoints: [resolve(root, `apps/${app.folder}/src/main.js`)],
    outfile: resolve(output, 'assets/app.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    globalName: 'AtlasBundle',
    target: ['es2022'],
    legalComments: 'none',
    sourcemap: true,
    metafile: true,
  });
  const css = systemFontCss(commonCss + '\n' + (await read(`apps/${app.folder}/src/styles.css`)));
  await writeFile(resolve(output, 'assets/app.css'), css);
  const html = await read(`apps/${app.folder}/index.html`);
  await writeFile(resolve(output, 'index.html'), html);
  await copyContent(
    resolve(root, `apps/${app.folder}/config.example.js`),
    resolve(output, 'config.js'),
  );
  await copyContent(output, resolve(root, `dist/${app.folder}`));
  // Portable review copies. Native projects and ordinary deployments use external assets above.
  const js = (await readFile(resolve(output, 'assets/app.js'), 'utf8'))
    .replace(/<\/script/gi, '<\\/script')
    .replace(/\/\/# sourceMappingURL=.*$/m, '');
  const config = await read(`apps/${app.folder}/config.example.js`);
  const portable = html
    .replace(/<link\b[^>]*href="\.\/assets\/app\.css"[^>]*>/, () => `<style>${css}</style>`)
    .replace(
      /<script\b[^>]*src="\.\/config\.js"[^>]*>\s*<\/script>/,
      () => `<script>${config}</script>`,
    )
    .replace(/^[ \t]*<script\b[^>]*src="\.\/assets\/app\.js"[^>]*>\s*<\/script>\r?\n?/m, '')
    .replace('</body>', () => `<script>${js}</script></body>`);
  if (/\b(?:src|href)="\.\/(?:assets|config\.js)/.test(portable)) {
    throw new Error(`Portable ${app.id} still references external build assets.`);
  }
  await writeFile(resolve(root, `dist/${app.id}.html`), portable);
  buildRecords.push(
    await recordAppBuild(app.folder, [
      ...Object.keys(result.metafile.inputs),
      `apps/${app.folder}/index.html`,
      `apps/${app.folder}/config.example.js`,
      `apps/${app.folder}/src/styles.css`,
      ...['styles', 'polish', 'tracking'].map((name) => `packages/design-system/src/${name}.css`),
    ]),
  );
  console.log(`Built ${app.folder}: independent bundle and portable ${app.id}.html`);
}
const launcherCss = systemFontCss(commonCss);
await writeFile(
  resolve(root, 'dist/index.html'),
  (await read('tooling/launcher.html')).replace('/* ATLAS_SHARED_CSS */', launcherCss),
);
await copyContent(resolve(root, 'README.md'), resolve(root, 'dist/README.md'));
await copyContent(resolve(root, 'docs'), resolve(root, 'dist/docs'));
await completeAppBuilds(buildRecords);

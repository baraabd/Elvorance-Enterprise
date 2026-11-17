import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root = new URL('.', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
const css = await readFile(new URL('src/style.css', root), 'utf8');
const domain = await readFile(new URL('src/domain.mts', root), 'utf8');
const app = await readFile(new URL('src/app.mts', root), 'utf8');
const cleanApp = app.replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"]\.\/domain\.mts['"];\r?\n/m, '');
if (cleanApp === app) throw new Error('Expected an import from domain.mts');
const scriptTag = '<script type="module" src="./src/app.mts"></script>';
if (!html.includes(scriptTag)) throw new Error('Expected the TypeScript template entrypoint');
const bundled = html
  .replace('<link rel="stylesheet" href="./src/style.css" />', `<style>\n${css}\n</style>`)
  .replace(
    scriptTag,
    `<script type="module">\n${domain.replace(/^export /gm, '')}\n${cleanApp}\n</script>`,
  );
await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/Elvorance-Instant-Close-2027.html', root), bundled, 'utf8');
console.log('Created standalone HTML', bundled.length, 'chars');

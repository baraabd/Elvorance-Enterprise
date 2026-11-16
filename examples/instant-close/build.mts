// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('.',import.meta.url);
const html=await readFile(new URL('index.html',root),'utf8');
const css=await readFile(new URL('src/style.css',root),'utf8');
const domain=await readFile(new URL('src/domain.mjs',root),'utf8');
const app=await readFile(new URL('src/app.mjs',root),'utf8');
const bundled=html
 .replace('<link rel="stylesheet" href="./src/style.css" />',`<style>\n${css}\n</style>`)
 .replace('<script type="module" src="./src/app.mts"></script>',`<script type="module">\n${domain.replace(/^export /gm,'')}\n${app.replace(/^import \{[^\n]+\} from '\.\/domain\.mjs';\n/m,'')}\n</script>`);
await mkdir(new URL('dist/',root),{recursive:true});
await writeFile(new URL('dist/Elvorance-Instant-Close-2027.html',root),bundled,'utf8');
console.log('Created standalone HTML',bundled.length,'chars');

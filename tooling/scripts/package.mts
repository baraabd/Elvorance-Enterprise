// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { zipSync } from 'fflate';
import { root } from './workspace.mts';

const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const files = {};
const ignored = new Set([
  'node_modules',
  '.git',
  '.elvorance-backups',
  '.gradle',
  '.idea',
  'Pods',
  'DerivedData',
  'build',
  'coverage',
  'xcuserdata',
]);
async function visit(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (
      ignored.has(entry.name) ||
      entry.name === '.env' ||
      entry.name === 'local.properties' ||
      entry.name.endsWith('.log')
    )
      continue;
    const file = resolve(dir, entry.name);
    const path = relative(root, file).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      if (entry.name === 'dist' || path.endsWith('/public') || path.includes('capacitor-cordova-'))
        continue;
      await visit(file);
    } else if (entry.isFile()) {
      if (/\.env\./.test(entry.name) && entry.name !== '.env.example') continue;
      const mode = (await stat(file)).mode;
      const executable = Boolean(mode & 0o111) || path.endsWith('/gradlew') || path.endsWith('.sh');
      files[`Elvorance-Enterprise/${path}`] = [
        new Uint8Array(await readFile(file)),
        { os: 3, attrs: ((executable ? 0o100755 : 0o100644) << 16) >>> 0 },
      ];
    }
  }
}
await visit(root);
// Review builds are included so the deliverable can be inspected before installation.
for (const name of ['rep.html', 'client.html', 'admin.html', 'index.html']) {
  files[`Elvorance-Enterprise/preview/${name}`] = new Uint8Array(
    await readFile(resolve(root, 'dist', name)),
  );
}
await mkdir(resolve(root, 'dist'), { recursive: true });
const zip = zipSync(files, { level: 6 });
await writeFile(resolve(root, `dist/Elvorance-Enterprise-${version}.zip`), zip);
console.log(
  `Packaged ${Object.keys(files).length} files (${(zip.byteLength / 1024 / 1024).toFixed(1)} MiB). Dependencies, secrets, build caches and signing material excluded.`,
);

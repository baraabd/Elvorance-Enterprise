import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const roots = ['apps', 'services', 'packages', 'infra', 'tooling', 'tests', 'docs', 'examples', 'prototype'];
const excluded = new Set(['node_modules', 'dist', 'android', 'ios', '.git']);
const codeExtensions = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/i;
const oldSourceExtensions = /\.(?:js|mjs|cjs)$/i;
const markdownExtension = /\.md$/i;
const oldBrand = /AtlasCRM|Atlas CRM|@atlas\/|^#.*أطلس/im;

async function walk(path: string): Promise<string[]> {
  const found: string[] = [];
  for (const item of await readdir(resolve(root, path), { withFileTypes: true })) {
    if (excluded.has(item.name)) continue;
    const relative = path + '/' + item.name;
    if (item.isDirectory()) found.push(...(await walk(relative)));
    else if (item.isFile()) found.push(relative);
  }
  return found;
}

const allFiles = (await Promise.all(roots.map((directory) => walk(directory)))).flat();
const sourceFiles = allFiles.filter((file) => codeExtensions.test(file));
const markdownFiles = allFiles.filter((file) => markdownExtension.test(file));
const suppressions: string[] = [];
const legacyBrand: string[] = [];
const previewDependencies: string[] = [];
const legacySource = sourceFiles.filter((file) => oldSourceExtensions.test(file));

for (const file of [...sourceFiles, ...markdownFiles]) {
  const content = await readFile(resolve(root, file), 'utf8');
  if (codeExtensions.test(file)) {
    if (content.includes('@ts-nocheck')) suppressions.push(file);
    if (/createDemoData|createDemoRepository|dataMode\s*[:!=]{1,3}\s*['"]demo|local-demo/.test(content))
      previewDependencies.push(file);
  }
  if (markdownExtension.test(file) && oldBrand.test(content)) legacyBrand.push(file);
}

const output = {
  sourceFiles: sourceFiles.length,
  legacyJavaScriptFiles: legacySource,
  filesWithDisabledTypeChecking: suppressions,
  documentsWithOldBrand: legacyBrand,
  sourceFilesReferringToDemo: previewDependencies,
  acceptanceComplete:
    !legacySource.length &&
    !suppressions.length &&
    !legacyBrand.length &&
    !previewDependencies.length,
};
console.log(JSON.stringify(output, null, 2));
if (process.argv.includes('--strict') && !output.acceptanceComplete) {
  console.error('Migration acceptance failed: remaining source, branding, typing or demo dependencies.');
  process.exitCode = 1;
} else if (!output.acceptanceComplete) {
  console.warn('Migration audit reports remaining work. This is NOT proof of complete API integration.');
}

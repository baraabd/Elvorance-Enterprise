import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const output = dirname(fileURLToPath(import.meta.url));
const root = resolve(output, '../../..');
const excluded = new Set(['node_modules', 'dist', 'android', 'ios', 'build', 'public']);
async function walk(folder) {
  const files = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.isSymbolicLink()) continue;
    const path = resolve(folder, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (/\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/.test(path) && !/\.d\.ts$|\.test\./.test(path))
      files.push(path);
  }
  return files.sort();
}
const records = [];
for (const folder of ['apps', 'packages', 'services']) {
  for (const path of await walk(resolve(root, folder))) {
    const text = await readFile(path, 'utf8');
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const relativePath = relative(root, path).replaceAll('\\', '/');
    function visit(node) {
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isConstructorDeclaration(node) ||
        ts.isGetAccessor(node) ||
        ts.isSetAccessor(node)
      ) {
        const label =
          node.name ??
          (ts.isVariableDeclaration(node.parent) || ts.isPropertyAssignment(node.parent)
            ? node.parent.name
            : undefined);
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        const endLine = source.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
        const isDemo = /\/features\/|packages\/(app-runtime|demo-data)\//.test(relativePath);
        records.push([
          relativePath,
          label?.getText(source) ?? '<anonymous>',
          ts.SyntaxKind[node.kind],
          line,
          endLine,
          createHash('sha256').update(node.getText(source)).digest('hex'),
          isDemo
            ? 'غير مرتبط بواجهة server؛ وظيفة محلية'
            : 'جزئي؛ قبول الوظيفة غير مثبت بمجرد الجرد',
          'AST enumeration, not individual manual review or executed coverage',
        ]);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
const escape = (value) => '"' + String(value).replaceAll('"', '""') + '"';
const csv =
  [
    [
      'source',
      'name',
      'syntaxKind',
      'line',
      'endLine',
      'sha256',
      'classification',
      'evidenceScope',
    ],
    ...records,
  ]
    .map((row) => row.map(escape).join(','))
    .join('\n') + '\n';
await writeFile(resolve(output, 'function-symbols.csv'), '\uFEFF' + csv);
console.log(
  JSON.stringify({
    functionSymbols: records.length,
    scope: 'apps/packages/services JS/TS; native/generated/declarations/test files excluded',
  }),
);

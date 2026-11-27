/** Source inventory, not a semantic-equivalence or functional-acceptance claim. */
import ts from 'typescript';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
interface FunctionRecord {
  path: string;
  name: string;
  line: number;
  bodyLength: number;
  hash: string;
}
const root = resolve(process.argv[2] ?? '.');
const output = resolve(process.argv[3] ?? 'dist/component-inventory.json');
const files: string[] = [];
async function walk(path: string): Promise<void> {
  for (const entry of await readdir(resolve(root, path), { withFileTypes: true })) {
    if (entry.isDirectory()) await walk(path + '/' + entry.name);
    else if (entry.isFile() && /\.ts$/.test(entry.name)) files.push(path + '/' + entry.name);
  }
}
for (const path of [
  'packages/ui/src',
  'apps/admin-web/src',
  'apps/client-mobile/src',
  'apps/rep-mobile/src',
])
  await walk(path);
const functions: FunctionRecord[] = [];
for (const path of files) {
  const text = await readFile(resolve(root, path), 'utf8');
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      const body = node.body.getText(source).replace(/\s+/g, ' ');
      functions.push({
        path,
        name: node.name.text,
        line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        bodyLength: body.length,
        hash: createHash('sha256').update(body).digest('hex'),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
const groups = new Map<string, FunctionRecord[]>();
for (const item of functions.filter((item) => item.bodyLength >= 80)) {
  const group = groups.get(item.hash) ?? [];
  group.push(item);
  groups.set(item.hash, group);
}
const duplicates = [...groups.values()].filter(
  (group) => new Set(group.map((row) => row.path)).size > 1,
);
const cssFiles = [
  'packages/design-system/src/styles.css',
  'packages/design-system/src/polish.css',
  'packages/design-system/src/tracking.css',
  'packages/design-system/src/arabic-accessibility.css',
  'apps/admin-web/src/styles.css',
  'apps/client-mobile/src/styles.css',
  'apps/rep-mobile/src/styles.css',
  'apps/rep-mobile/src/server/styles.css',
];
const stylesheets = [];
for (const path of cssFiles) {
  const text = await readFile(resolve(root, path), 'utf8');
  stylesheets.push({
    path,
    bytes: Buffer.byteLength(text),
    customPropertyNames: [...new Set(text.match(/--[\w-]+(?=\s*:)/g) ?? [])].sort(),
    literalColors: [...new Set(text.match(/#[a-f\d]{3,8}\b/gi) ?? [])].sort(),
    physicalDirectionalDeclarationCount: [
      ...text.matchAll(
        /(?:^|[;{])\s*(?:margin|padding|border)-(?:left|right)\s*:|(?:^|[;{])\s*(?:left|right)\s*:/gm,
      ),
    ].length,
  });
}
await writeFile(
  output,
  JSON.stringify(
    {
      scope:
        'Source only: function declarations with bodies >=80 normalized characters; CSS lexical properties are not semantic equivalence. Arrow functions and nested CSS equivalence require manual review.',
      filesScanned: files.length,
      functionsScanned: functions.length,
      sharedUiFunctions: functions.filter((item) => item.path.startsWith('packages/ui/')),
      exactDuplicateFunctionGroups: duplicates,
      stylesheets,
    },
    null,
    2,
  ) + '\n',
);

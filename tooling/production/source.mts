import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import ts from 'typescript';

export const roots = [
  'apps',
  'services',
  'packages',
  'infra',
  'tooling',
  'tests',
  'examples',
  'prototype',
  '.github',
];
const excluded = new Set([
  'node_modules',
  'dist',
  '.git',
  'build',
  'Pods',
  '.gradle',
  'DerivedData',
  'public',
  'capacitor-cordova-android-plugins',
  'capacitor-cordova-ios-plugins',
]);
export const codePattern = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/;
export const sha256 = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');
export const slash = (value: string): string => value.replaceAll('\\', '/');
export async function walk(root: string, folder: string): Promise<string[]> {
  const entries = await readdir(resolve(root, folder), { withFileTypes: true });
  const output: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (excluded.has(entry.name) || entry.isSymbolicLink()) continue;
    const path = slash(`${folder}/${entry.name}`);
    if (entry.isDirectory()) output.push(...(await walk(root, path)));
    else if (entry.isFile()) output.push(path);
  }
  return output;
}
export function visit(node: ts.Node, callback: (node: ts.Node) => void): void {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}
export function literal(node: ts.Node | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const part = (value: ts.Expression): string =>
      ts.isStringLiteralLike(value) ||
      ts.isTemplateExpression(value) ||
      ts.isBinaryExpression(value)
        ? (literal(value) ?? '${' + value.getText() + '}')
        : '${' + value.getText() + '}';
    return part(node.left) + part(node.right);
  }
  if (ts.isTemplateExpression(node))
    return (
      node.head.text +
      node.templateSpans
        .map((span) => '${' + span.expression.getText() + '}' + span.literal.text)
        .join('')
    );
  if (ts.isIdentifier(node)) return node.text;
  return null;
}
export function unwrap(node: ts.Expression): ts.Expression {
  while (
    ts.isAsExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isSatisfiesExpression(node)
  )
    node = node.expression;
  return node;
}
export function strings(node: ts.Node): string[] {
  const output: string[] = [];
  visit(node, (child) => {
    if (ts.isStringLiteralLike(child)) output.push(child.text);
  });
  return [...new Set(output)].sort();
}
export interface Source {
  path: string;
  text: string;
  ast: ts.SourceFile;
  digest: string;
}
export interface Workspace {
  root: string;
  files: string[];
  sources: Map<string, Source>;
  checker: ts.TypeChecker;
}
export async function workspace(root: string): Promise<Workspace> {
  const rooted = (await Promise.all(roots.map((folder) => walk(root, folder)))).flat();
  const rootFiles = (await readdir(root, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isFile() &&
        /^(?:package(?:-lock)?\.json|tsconfig.*\.json|\.gitattributes|\.npmrc|\.prettier.*)$/.test(
          entry.name,
        ),
    )
    .map((entry) => entry.name);
  const inputs = [
    'docs/production/inventory-dispositions.json',
    'docs/production/full-ci-contract.json',
  ];
  for (const path of inputs) {
    try {
      await readFile(resolve(root, path));
      rootFiles.push(path);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
  const files = [...rooted, ...rootFiles]
    .filter((path) => !path.startsWith('.github/workflows/s01-bootstrap'))
    .sort();
  const paths = files.filter((path) => codePattern.test(path));
  const program = ts.createProgram(
    paths.map((path) => resolve(root, path)),
    {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      allowJs: true,
      noEmit: true,
      skipLibCheck: true,
      allowImportingTsExtensions: true,
    },
  );
  const sources = new Map<string, Source>();
  for (const path of paths) {
    const text = await readFile(resolve(root, path), 'utf8');
    const ast = program.getSourceFile(resolve(root, path));
    if (!ast) throw new Error(`Parser did not load ${path}`);
    sources.set(path, { path, text, ast, digest: sha256(text) });
  }
  return { root, files, sources, checker: program.getTypeChecker() };
}
export interface Location {
  path: string;
  line: number;
  endLine: number;
  fingerprint: string;
}
export function location(source: Source, node: ts.Node): Location {
  return {
    path: source.path,
    line: source.ast.getLineAndCharacterOfPosition(node.getStart(source.ast)).line + 1,
    endLine: source.ast.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
    fingerprint: sha256(node.getText(source.ast).replace(/\s+/g, ' ')),
  };
}
export function sourceFor(ws: Workspace, node: ts.Node): Source | undefined {
  return ws.sources.get(slash(relative(ws.root, node.getSourceFile().fileName)));
}
/** Follow source declarations, not names guessed from a route or an audit document. */
export function closure(ws: Workspace, start: ts.Node): ts.Node[] {
  const output: ts.Node[] = [];
  const seen = new Set<ts.Node>();
  const queue: Array<{ node: ts.Node; depth: number }> = [{ node: start, depth: 0 }];
  while (queue.length) {
    const next = queue.shift();
    if (!next || seen.has(next.node)) continue;
    seen.add(next.node);
    output.push(next.node);
    if (next.depth >= 6) continue;
    visit(next.node, (node) => {
      if (
        !ts.isCallExpression(node) &&
        !ts.isPropertyAssignment(node) &&
        !ts.isShorthandPropertyAssignment(node)
      )
        return;
      const expression = ts.isCallExpression(node)
        ? node.expression
        : ts.isPropertyAssignment(node)
          ? node.initializer
          : node.name;
      let symbol = ts.isShorthandPropertyAssignment(node)
        ? ws.checker.getShorthandAssignmentValueSymbol(node)
        : ws.checker.getSymbolAtLocation(expression);
      if (symbol && symbol.flags & ts.SymbolFlags.Alias)
        symbol = ws.checker.getAliasedSymbol(symbol);
      for (const original of symbol?.declarations ?? []) {
        let declaration: ts.Node = original;
        const source = sourceFor(ws, declaration);
        if (!source || source.path.startsWith('tests/') || source.path.startsWith('tooling/'))
          continue;
        if (ts.isVariableDeclaration(declaration) && declaration.initializer)
          declaration = unwrap(declaration.initializer);
        if (ts.isFunctionLike(declaration) || ts.isPropertyAssignment(declaration))
          queue.push({ node: declaration, depth: next.depth + 1 });
      }
    });
  }
  return output;
}

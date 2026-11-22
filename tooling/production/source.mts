import { digest } from './values.mts';
export { digest, json } from './values.mts';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import ts from 'typescript';

export const roots = [
  'apps',
  'packages',
  'services',
  'infra',
  'tooling',
  'tests',
  'examples',
  'prototype',
];
const ignored = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  'Pods',
  'DerivedData',
  '.gradle',
  'public',
]);
export const read = (root: string, path: string): string =>
  readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n');
export function files(root: string, paths = roots): string[] {
  const result: string[] = [];
  function walk(path: string): void {
    if (!existsSync(resolve(root, path))) return;
    for (const entry of readdirSync(resolve(root, path), { withFileTypes: true })) {
      if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
      const name = `${path}/${entry.name}`;
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile()) result.push(name);
    }
  }
  paths.forEach(walk);
  return result.sort();
}
export const isCode = (path: string): boolean => /\.(?:[mc]?ts|tsx|[mc]?js|jsx)$/.test(path);
export const isProduction = (path: string): boolean =>
  /^(apps|packages|services)\//.test(path) &&
  !/(^|\/)(test|tests|android|ios)\//.test(path) &&
  !/\.test\./.test(path);
export function parse(path: string, text: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}
export function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}
export function unwrap(node: ts.Expression): ts.Expression {
  return ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node)
    ? unwrap(node.expression)
    : node;
}
export function name(node: ts.Node | undefined): string | null {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node))
    return node.text;
  return null;
}
export function property(node: ts.ObjectLiteralExpression, key: string): ts.Expression | undefined {
  const value = node.properties.find((item) => 'name' in item && name(item.name) === key);
  if (value && ts.isPropertyAssignment(value)) return unwrap(value.initializer);
  if (value && ts.isShorthandPropertyAssignment(value)) return value.name;
  return undefined;
}
export function scope(node: ts.Node): string {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if ((ts.isFunctionDeclaration(parent) || ts.isMethodDeclaration(parent)) && parent.name)
      return name(parent.name) ?? 'computed';
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  }
  return 'module';
}
export interface Location {
  path: string;
  line: number;
  column: number;
  symbol: string;
  sha256: string;
}
export function location(file: ts.SourceFile, node: ts.Node): Location {
  const pos = file.getLineAndCharacterOfPosition(node.getStart(file));
  return {
    path: file.fileName.replaceAll('\\', '/'),
    line: pos.line + 1,
    column: pos.character + 1,
    symbol: scope(node),
    sha256: digest(node.getText(file)),
  };
}
export function resolveLocal(root: string, from: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const path = relative(root, resolve(root, from, '..', specifier)).replaceAll('\\', '/');
  return existsSync(resolve(root, path)) ? path : null;
}

import ts from 'typescript';
import { dirname, posix, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { location, name, parse, property, read, unwrap, walk, type Location } from './source.mts';

export interface Effect {
  kind: 'endpoint' | 'storage' | 'event' | 'authorization' | 'unresolved';
  value: string;
  source: Location;
}
interface Module {
  source: ts.SourceFile;
  symbols: Map<string, ts.Node>;
  imports: Map<string, { path: string; symbol: string }>;
}
/** Conservative static reachability. Results are source evidence, never execution or authorization proofs. */
export class SourceGraph {
  private modules = new Map<string, Module>();
  private root: string;
  constructor(root: string) {
    this.root = root;
  }
  private resolveImport(from: string, specifier: string): string | null {
    if (specifier.startsWith('.'))
      return posix.normalize(posix.join(posix.dirname(from), specifier));
    if (!specifier.startsWith('@elvorance/')) return null;
    const [workspace, ...tail] = specifier.slice('@elvorance/'.length).split('/');
    if (!workspace) return null;
    const manifest = `packages/${workspace}/package.json`;
    if (!existsSync(resolve(this.root, manifest))) return null;
    const data = JSON.parse(read(this.root, manifest)) as {
      exports?: string | Record<string, string | { default?: string; import?: string }>;
      main?: string;
    };
    const key = tail.length ? `./${tail.join('/')}` : '.';
    const entry = typeof data.exports === 'string' ? data.exports : data.exports?.[key];
    const target = typeof entry === 'string' ? entry : (entry?.import ?? entry?.default);
    return target ? posix.normalize(posix.join(dirname(manifest), target)) : null;
  }
  private module(path: string): Module {
    const cached = this.modules.get(path);
    if (cached) return cached;
    const source = parse(path, read(this.root, path));
    const value: Module = { source, symbols: new Map(), imports: new Map() };
    this.modules.set(path, value);
    // Only module-level declarations. Locals are traversed in their containing function.
    for (const node of source.statements) {
      if (ts.isFunctionDeclaration(node) && node.name) value.symbols.set(node.name.text, node);
      if (ts.isVariableStatement(node))
        for (const declaration of node.declarationList.declarations)
          if (ts.isIdentifier(declaration.name) && declaration.initializer)
            value.symbols.set(declaration.name.text, unwrap(declaration.initializer));
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const target = this.resolveImport(path, node.moduleSpecifier.text);
        const bindings = node.importClause?.namedBindings;
        if (target && bindings && ts.isNamedImports(bindings))
          for (const item of bindings.elements)
            value.imports.set(item.name.text, {
              path: target,
              symbol: item.propertyName?.text ?? item.name.text,
            });
      }
    }
    return value;
  }
  effects(path: string, line: number, column: number): Effect[] {
    const mod = this.module(path);
    let start: ts.Node = mod.source;
    const offset = mod.source.getPositionOfLineAndCharacter(line - 1, column - 1);
    walk(mod.source, (node) => {
      if (node.getStart(mod.source) === offset && node.end <= start.end) start = node;
    });
    // Prefer complete route/action member/call rather than its first identifier token.
    while (
      start.parent &&
      start.parent.getStart(mod.source) === offset &&
      !ts.isSourceFile(start.parent)
    )
      start = start.parent;
    const effects: Effect[] = [];
    const visited = new Set<string>();
    const inspect = (file: string, node: ts.Node): void => {
      const module = this.module(file);
      const key = `${file}:${node.pos}:${node.end}`;
      if (visited.has(key)) return;
      visited.add(key);
      const add = (kind: Effect['kind'], value: string, at: ts.Node): void => {
        effects.push({ kind, value, source: location(module.source, at) });
      };
      const follow = (symbol: string): void => {
        const local = module.symbols.get(symbol);
        if (local) inspect(file, local);
        const imported = module.imports.get(symbol);
        if (imported && existsSync(resolve(this.root, imported.path))) {
          const destination = this.module(imported.path).symbols.get(imported.symbol);
          if (destination) inspect(imported.path, destination);
        }
      };
      walk(node, (current) => {
        if (
          ts.isPropertyAssignment(current) &&
          ['render', 'view'].includes(name(current.name) ?? '') &&
          ts.isIdentifier(current.initializer)
        )
          follow(current.initializer.text);
        if (ts.isPropertyAssignment(current) && ts.isIdentifier(current.initializer))
          follow(current.initializer.text);
        if (!ts.isCallExpression(current)) return;
        const expression = current.expression;
        const method = ts.isIdentifier(expression)
          ? expression.text
          : ts.isPropertyAccessExpression(expression)
            ? expression.name.text
            : '';
        const receiver = ts.isPropertyAccessExpression(expression)
          ? expression.expression.getText(module.source)
          : '';
        const args = current.arguments;
        const stringArg = (index: number): string | null => {
          const argument = args[index];
          if (!argument) return null;
          if (ts.isStringLiteralLike(argument)) return argument.text;
          if (ts.isTemplateExpression(argument)) return argument.getText(module.source);
          return null;
        };
        if (ts.isIdentifier(expression)) follow(expression.text);
        for (const arg of args) if (ts.isIdentifier(arg)) follow(arg.text);
        if (/api|http|fetch|client/i.test(receiver) || method === 'fetch') {
          const endpoint = [...args]
            .map((_, i) => stringArg(i))
            .find((arg) => arg?.includes('/v1/'));
          if (endpoint) add('endpoint', endpoint, current);
          else if (['list', 'mutate', 'get', 'post', 'patch', 'put', 'fetch'].includes(method)) {
            const resource = stringArg(0);
            if (method === 'list' && resource) {
              const api = this.module('apps/rep-mobile/src/server/api.ts');
              const map = api.symbols.get('resourcePaths');
              const destination =
                map && ts.isObjectLiteralExpression(map) ? property(map, resource) : undefined;
              if (destination && ts.isStringLiteralLike(destination))
                add('endpoint', destination.text, current);
              else add('unresolved', `${receiver}.${method}:${resource}`, current);
            } else add('unresolved', current.getText(module.source).slice(0, 200), current);
          }
        }
        if (
          /^(tx|repository)$/.test(receiver) &&
          ['get', 'list', 'page', 'insert', 'update', 'delete', 'put', 'upsert'].includes(method)
        )
          add(
            'storage',
            `${method}:${stringArg(0) ?? args[0]?.getText(module.source) ?? 'unknown'}`,
            current,
          );
        if (receiver === 'tx' && method === 'emit')
          add('event', stringArg(0) ?? 'dynamic', current);
        if (
          /authorize|requireRole|requireActor|actorScopes|customerView|customerContext|assert.*Scope|assert.*Owner|assert.*Role/i.test(
            method,
          )
        )
          add('authorization', current.getText(module.source).slice(0, 250), current);
        if (
          /localStorage|sessionStorage|Store|store/.test(receiver) &&
          ['getItem', 'setItem', 'removeItem', 'save', 'update', 'mutate', 'reset'].includes(method)
        )
          add('storage', current.getText(module.source).slice(0, 200), current);
      });
    };
    inspect(path, start);
    return [
      ...new Map(
        effects.map((effect) => [
          `${effect.kind}:${effect.source.path}:${effect.source.line}:${effect.value}`,
          effect,
        ]),
      ).values(),
    ].sort((a, b) =>
      `${a.kind}:${a.source.path}:${a.source.line}:${a.value}`.localeCompare(
        `${b.kind}:${b.source.path}:${b.source.line}:${b.value}`,
        'en',
      ),
    );
  }
}

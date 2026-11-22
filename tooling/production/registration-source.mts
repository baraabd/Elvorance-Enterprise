import ts from 'typescript';
import { literal, sourceFor, unwrap, type Source, type Workspace } from './source.mts';

/** Bind compiler symbols, not identifier text, so nested scopes cannot borrow a loop value. */
export type Bindings = ReadonlyMap<ts.Symbol, ts.Expression>;
export interface RegisteredSource {
  source: Source;
  node: ts.CallExpression;
  bindings: Bindings;
  method: string;
  path: string;
}
function symbol(ws: Workspace, node: ts.Node): ts.Symbol | undefined {
  const found = ws.checker.getSymbolAtLocation(node);
  return found && found.flags & ts.SymbolFlags.Alias ? ws.checker.getAliasedSymbol(found) : found;
}
function constantInitializer(node: ts.Node | undefined): ts.Expression | undefined {
  return node &&
    ts.isVariableDeclaration(node) &&
    ts.isVariableDeclarationList(node.parent) &&
    (node.parent.flags & ts.NodeFlags.Const) !== 0
    ? node.initializer
    : undefined;
}
/** A bounded, side-effect-free literal resolver. Unknown calls are NEVER evaluated. */
export function resolveSourceValue(
  ws: Workspace,
  input: ts.Node,
  bindings: Bindings = new Map(),
  seen: ReadonlySet<ts.Node> = new Set(),
): ts.Node | undefined {
  if (seen.size >= 40 || seen.has(input)) return undefined;
  const visited = new Set(seen).add(input);
  const next = (node: ts.Node) => resolveSourceValue(ws, node, bindings, visited);
  if (
    ts.isAsExpression(input) ||
    ts.isParenthesizedExpression(input) ||
    ts.isSatisfiesExpression(input)
  )
    return next(input.expression);
  if (ts.isIdentifier(input)) {
    const found = symbol(ws, input);
    const bound = found ? bindings.get(found) : undefined;
    if (bound) return next(bound);
    // Only source-owned declarations may supply a value; no node_modules/runtime guesses.
    const declaration = found?.valueDeclaration ?? found?.declarations?.[0];
    if (!declaration || !sourceFor(ws, declaration)) return undefined;
    if (ts.isVariableDeclaration(declaration) && declaration.initializer)
      return ts.isVariableDeclarationList(declaration.parent) &&
        (declaration.parent.flags & ts.NodeFlags.Const) !== 0
        ? next(declaration.initializer)
        : undefined;
    if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration))
      return declaration;
    if (ts.isPropertyAssignment(declaration)) return next(declaration.initializer);
    if (ts.isShorthandPropertyAssignment(declaration)) {
      const value = ws.checker.getShorthandAssignmentValueSymbol(declaration)?.valueDeclaration;
      const initializer = constantInitializer(value);
      return initializer ? next(initializer) : undefined;
    }
    return undefined;
  }
  if (ts.isPropertyAccessExpression(input) || ts.isElementAccessExpression(input)) {
    const object = next(input.expression);
    const key = ts.isPropertyAccessExpression(input)
      ? input.name.text
      : sourceString(ws, input.argumentExpression, bindings);
    if (!object || !ts.isObjectLiteralExpression(object) || key === undefined) return undefined;
    // Computed names/spreads can override any earlier property. Keep these unresolved.
    if (
      object.properties.some(
        (row) => ts.isSpreadAssignment(row) || (row.name && ts.isComputedPropertyName(row.name)),
      )
    )
      return undefined;
    const candidates = object.properties.filter((row) => row.name && literal(row.name) === key);
    if (candidates.length !== 1) return undefined;
    const property = candidates[0];
    if (property && ts.isPropertyAssignment(property)) return next(property.initializer);
    if (property && ts.isShorthandPropertyAssignment(property)) {
      const value = ws.checker.getShorthandAssignmentValueSymbol(property)?.valueDeclaration;
      const initializer = constantInitializer(value);
      return initializer ? next(initializer) : undefined;
    }
    return property && ts.isMethodDeclaration(property) ? property : undefined;
  }
  return input;
}
export function sourceString(
  ws: Workspace,
  node: ts.Node | undefined,
  bindings: Bindings = new Map(),
  depth = 0,
): string | undefined {
  if (!node || depth > 40) return undefined;
  const value = resolveSourceValue(ws, node, bindings);
  if (!value) return undefined;
  if (ts.isStringLiteralLike(value) || ts.isNumericLiteral(value)) return value.text;
  if (ts.isTemplateExpression(value)) {
    let output = value.head.text;
    for (const span of value.templateSpans) {
      const part = sourceString(ws, span.expression, bindings, depth + 1);
      if (part === undefined) return undefined;
      output += part + span.literal.text;
    }
    return output;
  }
  if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const leftValue = resolveSourceValue(ws, value.left, bindings);
    const rightValue = resolveSourceValue(ws, value.right, bindings);
    if (
      leftValue &&
      rightValue &&
      ts.isNumericLiteral(leftValue) &&
      ts.isNumericLiteral(rightValue)
    )
      return undefined;
    const left = sourceString(ws, value.left, bindings, depth + 1);
    const right = sourceString(ws, value.right, bindings, depth + 1);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  return undefined;
}
export function sourceArray(
  ws: Workspace,
  node: ts.Node,
  bindings: Bindings = new Map(),
  seen = new Set<ts.Node>(),
): ts.Expression[] | undefined {
  if (seen.has(node) || seen.size > 40) return undefined;
  const visited = new Set(seen).add(node);
  const value = resolveSourceValue(ws, node, bindings);
  if (!value || !ts.isArrayLiteralExpression(value)) return undefined;
  const output: ts.Expression[] = [];
  for (const item of value.elements) {
    if (ts.isSpreadElement(item)) {
      const spread = sourceArray(ws, item.expression, bindings, visited);
      if (!spread) return undefined;
      output.push(...spread);
    } else output.push(item);
    if (output.length > 256) return undefined;
  }
  return output;
}
/** Expand only finite source literals; retain a blocker for runtime-dependent registrations. */
export function registeredSources(ws: Workspace, owner: string): RegisteredSource[] {
  const result: RegisteredSource[] = [];
  for (const source of ws.sources.values()) {
    if (
      !source.path.startsWith(`services/${owner}/`) &&
      !source.path.startsWith('packages/service-kit/')
    )
      continue;
    function walk(node: ts.Node, bindings: Bindings): void {
      if (ts.isForOfStatement(node) && ts.isVariableDeclarationList(node.initializer)) {
        const declaration = node.initializer.declarations[0];
        const key = declaration ? ws.checker.getSymbolAtLocation(declaration.name) : undefined;
        const values = sourceArray(ws, node.expression, bindings);
        if (key && values && values.length <= 256) {
          for (const value of values) walk(node.statement, new Map(bindings).set(key, value));
          return;
        }
      }
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText() === 'app'
      ) {
        const member = node.expression.name.text.toUpperCase();
        if (['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'].includes(member)) {
          const path = sourceString(ws, node.arguments[0], bindings);
          if (path !== undefined) result.push({ source, node, bindings, method: member, path });
        } else if (member === 'ROUTE' && node.arguments[0]) {
          const object = resolveSourceValue(ws, node.arguments[0], bindings);
          if (object && ts.isObjectLiteralExpression(object)) {
            if (
              object.properties.some(
                (field) =>
                  ts.isSpreadAssignment(field) ||
                  (field.name && ts.isComputedPropertyName(field.name)),
              )
            )
              return;
            const property = (name: string): ts.Expression | undefined => {
              const candidates = object.properties.filter(
                (p) => p.name && literal(p.name) === name,
              );
              const field = candidates.length === 1 ? candidates[0] : undefined;
              return field && ts.isPropertyAssignment(field) ? field.initializer : undefined;
            };
            const path = sourceString(ws, property('url'), bindings);
            const method = property('method');
            const methods = method ? (sourceArray(ws, method, bindings) ?? [method]) : [];
            for (const expression of methods) {
              const name = sourceString(ws, expression, bindings)?.toUpperCase();
              if (name && path !== undefined)
                result.push({ source, node, bindings, method: name, path });
            }
          }
        }
      }
      ts.forEachChild(node, (child) => walk(child, bindings));
    }
    walk(source.ast, new Map());
  }
  return result;
}
/** Return the actual role-selected section literals rather than every same-name object. */
export function liveSectionSources(ws: Workspace, role: string): ts.ObjectLiteralExpression[] {
  const source = ws.sources.get('packages/api-client/src/live-workspace.ts');
  const fn = source?.ast.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'sectionsForRole',
  );
  if (!fn || !ts.isFunctionDeclaration(fn) || !fn.body) return [];
  const parameter = fn.parameters[0];
  const key = parameter ? ws.checker.getSymbolAtLocation(parameter.name) : undefined;
  if (!key) return [];
  const bindings: Bindings = new Map([[key, ts.factory.createStringLiteral(role)]]);
  function returns(statements: readonly ts.Statement[]): ts.Expression | undefined {
    for (const statement of statements) {
      if (ts.isReturnStatement(statement)) return statement.expression;
      if (ts.isIfStatement(statement)) {
        const condition = unwrap(statement.expression);
        if (
          !ts.isBinaryExpression(condition) ||
          condition.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken
        )
          return undefined;
        const left = sourceString(ws, condition.left, bindings),
          right = sourceString(ws, condition.right, bindings);
        if (left === undefined || right === undefined) return undefined;
        const selected = left === right ? statement.thenStatement : statement.elseStatement;
        if (selected) {
          const value = returns(ts.isBlock(selected) ? selected.statements : [selected]);
          if (value) return value;
        }
      }
    }
    return undefined;
  }
  const expression = returns(fn.body.statements);
  const array = expression ? sourceArray(ws, expression, bindings) : undefined;
  if (!array) return [];
  const resolved = array.map((value) => resolveSourceValue(ws, value, bindings));
  if (resolved.some((value) => !value || !ts.isObjectLiteralExpression(value))) return [];
  return resolved.filter(
    (value): value is ts.ObjectLiteralExpression => !!value && ts.isObjectLiteralExpression(value),
  );
}

/** Carry the finite loop binding into its handler, including domain.create/update delegates. */
export function boundClosure(ws: Workspace, start: ts.Node, bindings: Bindings): ts.Node[] {
  const output: ts.Node[] = [],
    seen = new Set<ts.Node>();
  const queue: Array<{ node: ts.Node; depth: number }> = [{ node: start, depth: 0 }];
  while (queue.length) {
    const item = queue.shift();
    if (!item || seen.has(item.node)) continue;
    seen.add(item.node);
    output.push(item.node);
    if (item.depth >= 6) continue;
    const walk = (node: ts.Node): void => {
      if (ts.isCallExpression(node) || ts.isPropertyAssignment(node)) {
        const expression = ts.isCallExpression(node) ? node.expression : node.initializer;
        const declaration = resolveSourceValue(ws, expression, bindings);
        const source = declaration ? sourceFor(ws, declaration) : undefined;
        if (
          declaration &&
          source &&
          !source.path.startsWith('tests/') &&
          !source.path.startsWith('tooling/') &&
          ts.isFunctionLike(declaration)
        )
          queue.push({ node: declaration, depth: item.depth + 1 });
      }
      ts.forEachChild(node, walk);
    };
    walk(item.node);
  }
  return output;
}

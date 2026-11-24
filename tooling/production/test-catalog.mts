import ts from 'typescript';
import { literal, location, sha256, sourceFor, visit, type Workspace } from './source.mts';
import type { TestLink } from './model.mts';
export interface DiscoveredTest extends TestLink {
  text: string;
  references: string[];
  literalValues: string[];
}
export function testCatalog(ws: Workspace): DiscoveredTest[] {
  const result: DiscoveredTest[] = [];
  for (const source of ws.sources.values()) {
    if (!/(?:^tests\/|\/test\/|\/tests\/)/.test(source.path)) continue;
    const adminE2E = source.path === 'tests/admin/e2e.ts';
    const scope = adminE2E
      ? 'e2e'
      : /contracts?/.test(source.path)
        ? 'contract'
        : /runtime\//.test(source.path)
          ? 'e2e'
          : /(?:integration|regression|backend|identity)\//.test(source.path)
            ? 'integration'
            : 'unit';
    const environment = adminE2E
      ? 'chromium-http-postgres-required-in-CI; explicit-DOM-memory-diagnostic-locally'
      : /runtime\//.test(source.path)
        ? 'synthetic-real-http-postgres-rabbitmq'
        : /postgres/.test(source.path)
          ? 'postgres'
          : /identity\/local-keycloak/.test(source.path)
            ? 'local-keycloak'
            : /(?:integration|regression|design-parity|ui\/test)/.test(source.path)
              ? 'jsdom-or-injected-api-not-browser-e2e'
              : 'node';
    const found: Array<{ title: string; node: ts.Node }> = [];
    visit(source.ast, (node) => {
      if (!ts.isCallExpression(node)) return;
      const call = node.expression.getText(source.ast);
      if (
        /^(?:(?:test|it|describe|t\.test)(?:\.(?:only|skip|todo))?|check|scenario|passed)$/.test(
          call,
        )
      ) {
        const title = literal(node.arguments[0]);
        if (title !== null) found.push({ title, node });
      }
    });
    if (
      found.length === 0 &&
      /(?:\.test\.|tests\/regression\/[^/]+\.cts|local-keycloak-smoke\.mts)/.test(source.path)
    )
      found.push({ title: 'script-suite', node: source.ast });
    const ordinals = new Map<string, number>();
    for (const row of found) {
      const base = `T:${source.path}:${sha256(row.title).slice(0, 12)}`;
      const ordinal = (ordinals.get(base) ?? 0) + 1;
      ordinals.set(base, ordinal);
      const references = new Set<string>();
      const literalValues = new Set<string>();
      visit(row.node, (node) => {
        if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
          const value = literal(node);
          if (value) literalValues.add(value);
        }
        if (!ts.isCallExpression(node)) return;
        let symbol = ws.checker.getSymbolAtLocation(node.expression);
        if (symbol && symbol.flags & ts.SymbolFlags.Alias)
          symbol = ws.checker.getAliasedSymbol(symbol);
        for (const declaration of symbol?.declarations ?? []) {
          const referenced = sourceFor(ws, declaration);
          if (referenced && !/(?:^tests\/|\/tests?\/)/.test(referenced.path))
            references.add(referenced.path);
        }
      });
      result.push({
        references: [...references].sort(),
        literalValues: [...literalValues].sort(),
        id: `${base}:${ordinal}`,
        path: source.path,
        line: location(source, row.node).line,
        title: row.title,
        scope,
        environment,
        text: row.node.getText(source.ast),
      });
    }
  }
  return result.sort((a, b) => a.id.localeCompare(b.id, 'en'));
}

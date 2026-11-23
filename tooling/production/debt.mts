import ts from 'typescript';
import { sha256, visit, type Workspace } from './source.mts';
export interface DebtItem {
  id: string;
  path: string;
  kind: string;
  line: number;
  fingerprint: string;
}
export interface Debt {
  schemaVersion: 1;
  sourceFiles: number;
  items: DebtItem[];
  counts: Record<string, number>;
}
export function measureDebt(ws: Workspace): Debt {
  const items: DebtItem[] = [];
  for (const source of ws.sources.values()) {
    const ordinals = new Map<string, number>();
    const add = (kind: string, pos: number, text: string): void => {
      const fingerprint = sha256(text.replace(/\s+/g, ' '));
      const key = `${source.path}:${kind}:${fingerprint}`;
      const ordinal = (ordinals.get(key) ?? 0) + 1;
      ordinals.set(key, ordinal);
      items.push({
        id: `${key}:${ordinal}`,
        path: source.path,
        kind,
        line: source.ast.getLineAndCharacterOfPosition(pos).line + 1,
        fingerprint,
      });
    };
    const scanner = ts.createScanner(
      ts.ScriptTarget.Latest,
      false,
      ts.LanguageVariant.Standard,
      source.text,
    );
    for (
      let token = scanner.scan();
      token !== ts.SyntaxKind.EndOfFileToken;
      token = scanner.scan()
    ) {
      if (
        token !== ts.SyntaxKind.SingleLineCommentTrivia &&
        token !== ts.SyntaxKind.MultiLineCommentTrivia
      )
        continue;
      const comment = scanner.getTokenText();
      for (const match of comment.matchAll(
        /@ts-(nocheck|ignore|expect-error)|eslint-disable(?:-next-line|-line)?/g,
      ))
        add(match[0], scanner.getTokenPos(), comment);
    }
    visit(source.ast, (node) => {
      if (node.kind === ts.SyntaxKind.AnyKeyword)
        add('explicit-any', node.getStart(source.ast), node.parent.getText(source.ast));
      if (ts.isNonNullExpression(node))
        add('non-null-assertion', node.getStart(source.ast), node.getText(source.ast));
    });
  }
  items.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const counts: Record<string, number> = {};
  for (const item of items) counts[item.kind] = (counts[item.kind] ?? 0) + 1;
  return { schemaVersion: 1, sourceFiles: ws.sources.size, items, counts };
}
export function debtRegressions(baseline: Debt, current: Debt): DebtItem[] {
  const accepted = new Set(baseline.items.map((item) => item.id));
  return current.items.filter((item) => !accepted.has(item.id));
}

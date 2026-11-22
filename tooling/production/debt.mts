import ts from 'typescript';
import { resolve } from 'node:path';
import { digest, files, isCode, location, parse, read, walk, type Location } from './source.mts';

export interface DebtItem {
  id: string;
  kind: string;
  source: Location;
  text: string;
}
export interface Debt {
  schemaVersion: 1;
  measurement: 'static-source-not-runtime-coverage';
  totals: Record<string, number>;
  items: DebtItem[];
}
export function measureDebt(root: string): Debt {
  const items: DebtItem[] = [];
  const config = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile);
  if (config.error)
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const included = new Set(parsed.fileNames.map((path) => resolve(path)));
  for (const path of files(root).filter(isCode)) {
    if (/\/(android|ios)\//.test(path)) continue;
    const text = read(root, path);
    const source = parse(path, text);
    const counts = new Map<string, number>();
    const add = (kind: string, at: Location, value: string): void => {
      const key = `${kind}:${path}:${value}`;
      const nth = (counts.get(key) ?? 0) + 1;
      counts.set(key, nth);
      items.push({
        id: `${kind}.${digest(key).slice(0, 20)}.${nth}`,
        kind,
        source: at,
        text: value.slice(0, 180),
      });
    };
    // Read comment trivia at parser-derived boundaries. A standalone scanner loses
    // template/regular-expression context and can mistake fixture text for comments.
    const comments = new Map<number, ts.CommentRange>();
    walk(source, (node) => {
      if (ts.isJsxText(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) return;
      for (const range of [
        ...(ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []),
        ...(ts.getTrailingCommentRanges(text, node.end) ?? []),
      ])
        comments.set(range.pos, range);
    });
    for (const range of [...comments.values()].sort((a, b) => a.pos - b.pos)) {
      const comment = text.slice(range.pos, range.end);
      for (const match of comment.matchAll(
        /@ts-(nocheck|ignore|expect-error)\b|eslint-disable[^\n]*/g,
      )) {
        const pos = source.getLineAndCharacterOfPosition(range.pos + match.index);
        add(
          match[1] ? `ts-${match[1]}` : 'eslint-disable',
          {
            path,
            line: pos.line + 1,
            column: pos.character + 1,
            symbol: 'comment',
            sha256: digest(comment),
          },
          match[0],
        );
      }
    }
    walk(source, (node) => {
      if (node.kind === ts.SyntaxKind.AnyKeyword)
        add('explicit-any', location(source, node), node.parent.getText(source));
      if (
        ts.isCallExpression(node) &&
        /\b(?:test|it|describe)\.(?:skip|todo|only)$/.test(node.expression.getText(source))
      )
        add('test-disposition', location(source, node), node.expression.getText(source));
    });
    if (
      /^(apps|packages|services|tooling|infra)\//.test(path) &&
      !included.has(resolve(root, path))
    )
      add(
        'outside-tsconfig',
        { path, line: 1, column: 1, symbol: 'module', sha256: digest(text) },
        path,
      );
  }
  const totals: Record<string, number> = {};
  for (const item of items) totals[item.kind] = (totals[item.kind] ?? 0) + 1;
  return {
    schemaVersion: 1,
    measurement: 'static-source-not-runtime-coverage',
    totals,
    items: items.sort((a, b) => a.id.localeCompare(b.id, 'en')),
  };
}
export function debtRegressions(baseline: Debt, current: Debt): string[] {
  const old = new Set(baseline.items.map((item) => item.id));
  return current.items
    .filter((item) => !old.has(item.id))
    .map((item) => `${item.kind}: ${item.source.path}:${item.source.line}`);
}

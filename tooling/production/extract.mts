import ts from 'typescript';
import {
  digest,
  location,
  name,
  parse,
  property,
  scope,
  unwrap,
  walk,
  type Location,
} from './source.mts';

export interface Surface {
  id: string;
  kind: 'route' | 'action' | 'http' | 'control' | 'form' | 'listener' | 'failure' | 'job' | 'event';
  app: string;
  mode: 'demo' | 'server' | 'shared' | 'backend';
  name: string;
  source: Location;
  expression: string;
  handler: string | null;
  method: string | null;
  path: string | null;
  tags: string[];
}
export interface Extracted {
  items: Surface[];
  diagnostics: string[];
}
const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
const controls = new Set([
  'action',
  'go',
  'filter',
  'input',
  'select',
  'textarea',
  'button',
  'editorButton',
  'commandForm',
  'editForm',
  'form',
  'addField',
  'fieldControl',
  'search',
  'download',
  'exportCSV',
  'printDocument',
]);
const formCalls = new Set(['commandForm', 'editForm', 'form', 'addField', 'fieldControl']);
const tags = (text: string): string[] =>
  [
    ['search', /search|بحث/i],
    ['filter', /filter|تصفية|فلتر/i],
    ['export', /export|download|csv|print|تصدير|طباعة/i],
    ['dashboard', /dashboard|metric|analytics|home/i],
    ['permission', /permission|consent|authorize|roles|صلاحية/i],
    [
      'account',
      /account|profile|signIn|signOut|login|logout|refreshToken|membership|deleteAccount/i,
    ],
    ['configuration', /configuration|settings|questionnaire|catalog/i],
    ['failure', /error|retry|offline|denied|empty|abort|conflict|timeout|invalid/i],
  ].flatMap(([label, pattern]) => ((pattern as RegExp).test(text) ? [label as string] : []));
function context(path: string): { app: string; mode: Surface['mode'] } {
  const parts = path.split('/');
  if (parts[0] === 'services') return { app: parts[1]!, mode: 'backend' };
  if (parts[0] === 'apps')
    return { app: parts[1]!, mode: /\/server(?:\/|-)|\/main\.ts/.test(path) ? 'server' : 'demo' };
  return { app: parts[1] ?? 'shared', mode: 'shared' };
}
/** A source census, not proof of business completion. Unsupported dynamic registrations are explicit. */
export function extract(path: string, text: string): Extracted {
  const source = parse(path, text);
  const items: Surface[] = [];
  const diagnostics: string[] = [];
  const ctx = context(path);
  const occurrences = new Map<string, number>();
  const functions = new Map<string, ts.Node>();
  walk(source, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)
      functions.set(node.name.text, unwrap(node.initializer));
  });
  function add(
    kind: Surface['kind'],
    label: string,
    node: ts.Node,
    extra: Partial<Surface> = {},
  ): void {
    const key = `${ctx.app}:${ctx.mode}:${kind}:${path}:${scope(node)}:${label}`;
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    items.push({
      id: `${ctx.app}.${ctx.mode}.${kind}.${digest(key).slice(0, 16)}.${occurrence}`,
      kind,
      ...ctx,
      name: label,
      source: location(source, node),
      expression: node.getText(source).slice(0, 600),
      handler: null,
      method: null,
      path: null,
      tags: tags(`${path} ${label} ${node.getText(source)}`),
      ...extra,
    });
  }
  function registration(
    node: ts.ObjectLiteralExpression,
    kind: 'route' | 'action',
    mode?: Surface['mode'],
  ): void {
    for (const member of node.properties) {
      if (ts.isSpreadAssignment(member)) {
        const value = functions.get(member.expression.getText(source));
        if (value && ts.isObjectLiteralExpression(value)) registration(value, kind, mode);
        else
          diagnostics.push(
            `${path}:${location(source, member).line}: unresolved ${kind} spread ${member.getText(source)}`,
          );
        continue;
      }
      const label = name(member.name);
      if (!label) {
        diagnostics.push(`${path}:${location(source, member).line}: computed ${kind} registration`);
        continue;
      }
      let handler: string | null = null;
      if (ts.isPropertyAssignment(member)) {
        const value = unwrap(member.initializer);
        handler =
          kind === 'route' && ts.isObjectLiteralExpression(value)
            ? ((property(value, 'render') ?? property(value, 'view'))?.getText(source) ?? null)
            : value.getText(source);
      } else if (ts.isMethodDeclaration(member) || ts.isShorthandPropertyAssignment(member))
        handler = label;
      add(kind, label, member, { handler, ...(mode ? { mode } : {}) });
    }
  }
  walk(source, (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ['routes', 'actions'].includes(name(node.name) ?? '') &&
      !path.includes('/server/')
    ) {
      const value = unwrap(node.initializer);
      const kind = name(node.name) === 'routes' ? 'route' : 'action';
      if (ts.isObjectLiteralExpression(value)) registration(value, kind);
      // App composition is independently checked against actual runtime registrations.
      else if (!/\/src\/app\.ts$/.test(path))
        diagnostics.push(`${path}:${location(source, node).line}: dynamic ${kind} map`);
    }
    if (ts.isVariableDeclaration(node) && name(node.name) === 'pages' && node.initializer) {
      const value = unwrap(node.initializer);
      if (ts.isObjectLiteralExpression(value) && path.endsWith('/server/workspace.ts'))
        registration(value, 'route', 'server');
    }
    // Shared runtime handlers are not feature.actions; include the actual global dispatch table.
    if (
      ts.isVariableDeclaration(node) &&
      ['coreActions', 'globalActions', 'commonActions', 'builtins'].includes(
        name(node.name) ?? '',
      ) &&
      node.initializer
    ) {
      const value = unwrap(node.initializer);
      if (ts.isObjectLiteralExpression(value)) registration(value, 'action');
    }
    if (ts.isVariableDeclaration(node) && name(node.name) === 'subscriptions' && node.initializer) {
      const value = unwrap(node.initializer);
      if (ts.isArrayLiteralExpression(value))
        for (const event of value.elements)
          add('event', name(event) ?? event.getText(source), event, {
            handler: 'handleEvent',
            tags: ['subscription', 'background'],
          });
      else diagnostics.push(`${path}:${location(source, node).line}: dynamic event subscriptions`);
    }
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      const method = ts.isPropertyAccessExpression(expr)
        ? expr.name.text
        : (name(expr) ?? expr.getText(source));
      const receiver = ts.isPropertyAccessExpression(expr) ? expr.expression.getText(source) : '';
      const first = node.arguments[0];
      const literal = name(first);
      if (httpMethods.has(method) && /^(app|server|router)$/.test(receiver)) {
        if (literal)
          add('http', `${method.toUpperCase()} ${literal}`, node, {
            method: method.toUpperCase(),
            path: literal,
            handler: node.arguments.at(-1)?.getText(source).slice(0, 200) ?? null,
          });
        else if (first && ts.isTemplateExpression(first))
          add('http', `${method.toUpperCase()} ${first.getText(source)}`, node, {
            method: method.toUpperCase(),
            path: first.getText(source),
            tags: ['dynamic-registration'],
            handler: node.arguments.at(-1)?.getText(source).slice(0, 200) ?? null,
          });
        else
          diagnostics.push(
            `${path}:${location(source, node).line}: unresolved HTTP ${method} registration`,
          );
      } else if (method === 'route' && /^(app|server|router)$/.test(receiver)) {
        if (first && ts.isObjectLiteralExpression(first)) {
          const url = property(first, 'url');
          const verb = property(first, 'method');
          const methods =
            verb && ts.isArrayLiteralExpression(verb) ? verb.elements.map(name) : [name(verb)];
          if (name(url) && methods.every(Boolean))
            for (const verb of methods)
              add('http', `${verb!} ${name(url)!}`, node, { method: verb!, path: name(url) });
          else if (url && ts.isTemplateExpression(url) && methods.every(Boolean))
            for (const verb of methods)
              add('http', `${verb!} ${url.getText(source)}`, node, {
                method: verb!,
                path: url.getText(source),
                tags: ['dynamic-registration'],
              });
          else
            diagnostics.push(
              `${path}:${location(source, node).line}: unresolved HTTP route registration`,
            );
        }
      }
      if (controls.has(method) && !/^(tx|repository|app|server|router|http|api)$/.test(receiver)) {
        const label = literal ?? `${method}(${first?.getText(source).slice(0, 90) ?? ''})`;
        add(formCalls.has(method) ? 'form' : 'control', `${method}:${label}`, node, {
          handler:
            node.arguments
              .find((arg) => ts.isArrowFunction(arg) || ts.isFunctionExpression(arg))
              ?.getText(source)
              .slice(0, 200) ?? null,
        });
      }
      if (method === 'addEventListener')
        add('listener', literal ?? first?.getText(source) ?? 'dynamic', node, {
          handler: node.arguments[1]?.getText(source).slice(0, 200) ?? null,
        });
      if (
        ['setInterval', 'setTimeout', 'startEventRuntime', 'consume', 'schedule', 'cron'].includes(
          method,
        )
      )
        add('job', method, node, {
          tags: ['background', ...(ctx.mode === 'backend' ? ['service-worker'] : ['timer'])],
        });
      if (method === 'emit' && receiver === 'tx')
        add('event', literal ?? first?.getText(source) ?? 'dynamic', node, {
          tags: ['publication', 'transactional-outbox'],
        });
      if (['errorMessage', 'empty', 'missing', 'notFound', 'setErrorHandler'].includes(method))
        add('failure', method, node);
    }
    if (ts.isCatchClause(node)) add('failure', `catch:${scope(node)}`, node);
    // Literal segments in template expressions are visited exactly once, preserving dynamic controls as symbolic IDs.
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      const value = node.text;
      const pattern =
        /\bdata-(action|submit|change|input|go|live-form|live-action)\s*=\s*["']([^"']*)["']/g;
      for (const match of value.matchAll(pattern))
        add(
          ['submit', 'live-form'].includes(match[1] ?? '') ? 'form' : 'control',
          `data-${match[1]}:${match[2]}`,
          node,
          { handler: match[2] ?? null },
        );
      if (/<form\b/.test(value)) add('form', `html-form:${scope(node)}`, node);
    }
  });
  return { items, diagnostics };
}

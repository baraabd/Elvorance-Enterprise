import ts from 'typescript';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  closure,
  literal,
  location,
  sha256,
  sourceFor,
  strings,
  unwrap,
  visit,
  type Source,
  type Workspace,
} from './source.mts';
import { testCatalog, type DiscoveredTest } from './test-catalog.mts';
import { applyDispositions } from './dispositions.mts';
import { applySemanticBindings } from './semantic-bindings.mts';
import type { Endpoint, Feature, Inventory, Kind, RuntimeRegistration } from './model.mts';
import {
  registeredSources,
  liveSectionSources,
  sourceString,
  boundClosure,
  type Bindings,
  type RegisteredSource,
} from './registration-source.mts';

interface Observation {
  kind: Kind;
  key: string;
  source: Source;
  node: ts.Node;
  apps?: string[];
  mode?: string;
  registration?: RuntimeRegistration;
  unresolved?: string[];
  bindings?: Bindings;
}
const appFolders: Record<string, string> = {
  'admin-web': 'admin',
  'client-mobile': 'client',
  'rep-mobile': 'rep',
};
const servicePattern = /^services\/([^/]+)\//;
const apiMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
const unique = (values: string[]): string[] => [...new Set(values)].sort();
function appsFor(path: string): string[] {
  const folder = /^apps\/([^/]+)\//.exec(path)?.[1];
  if (folder) return [appFolders[folder] ?? folder];
  if (
    /packages\/(?:api-client|mobile-auth|contracts|app-runtime|ui|questionnaire|mobile-platform)\//.test(
      path,
    )
  )
    return ['admin', 'client', 'rep'];
  return [];
}
function modeFor(path: string): string {
  if (servicePattern.test(path) || path.startsWith('infra/')) return 'backend';
  if (path.includes('/server/') || /packages\/(?:api-client|mobile-auth)\//.test(path))
    return 'server';
  if (
    /apps\/[^/]+\/src\/(?:features\/|app\.ts|context\.ts)/.test(path) ||
    /packages\/(?:app-runtime|local-demo-adapter)\//.test(path)
  )
    return 'demo';
  return 'shared';
}
function domainFor(text: string): string | null {
  if (/quote|contract|opportunit|visit|task|route.plan|discount|approval/i.test(text))
    return 'sales';
  if (/customer|region|territor|discovery|catalog|question|configuration/i.test(text)) return 'crm';
  if (/invoice|payment|billing|finance/i.test(text)) return 'billing';
  if (/project|delivery|milestone/i.test(text)) return 'delivery';
  if (/message|ticket|support|notification|conversation/i.test(text)) return 'communications';
  if (/tracking|location|gps|consent/i.test(text)) return 'tracking';
  if (/profile|account|membership|login|logout|password|auth|session|team/i.test(text))
    return 'identity';
  return null;
}
function categories(text: string): string[] {
  return Object.entries({
    dashboards: /dashboard|home|metric|analytics|report/i,
    permissions: /permission|role|scope|owner|authorize/i,
    'account-lifecycle': /login|logout|signIn|signOut|refresh|session|password|account|profile/i,
    configuration: /config|setting|catalog|questionnaire|environment/i,
    'failure-states': /error|fail|catch|offline|abort|retry|empty|denied|conflict/i,
    'search-filter': /search|filter|query|sort|pagination/i,
    exports: /export|download|csv|print/i,
  })
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name);
}
function endpoints(
  nodes: ts.Node[],
  owner: string | null,
  resources: ReadonlyMap<string, string> = new Map(),
): Endpoint[] {
  const found = new Map<string, Endpoint>();
  for (const node of nodes)
    visit(node, (child) => {
      if (!ts.isCallExpression(child)) return;
      const call = child.expression.getText();
      const member = call.split('.').at(-1)?.toLowerCase() ?? '';
      const candidates = child.arguments
        .map((arg) => literal(arg))
        .filter((arg): arg is string => arg !== null && /^\/?(?:v1\/|https?:\/\/)/.test(arg));
      const resource = literal(child.arguments[0]);
      if (
        (member === 'list' || member === 'page') &&
        /\.api\.|^api\./.test(call) &&
        resource &&
        resources.has(resource)
      )
        candidates.push(resources.get(resource) ?? '');
      if ((member === 'editform' || member === 'actionform') && child.arguments[1]) {
        const resourceName = literal(child.arguments[1]);
        const path = resourceName ? resources.get(resourceName) : undefined;
        if (path)
          candidates.push(
            path +
              (member === 'actionform'
                ? '/:id/' + (literal(child.arguments[3]) ?? '${action}')
                : literal(child.arguments[4]) === 'undefined' || !child.arguments[4]
                  ? ''
                  : '/:id'),
          );
      }
      if (!candidates.length) return;
      let method = apiMethods.has(member) ? member.toUpperCase() : 'DYNAMIC';
      if (member === 'command') method = 'POST';
      if (member === 'list' || member === 'page' || member === 'collection') method = 'GET';
      if (member === 'editform')
        method =
          literal(child.arguments[4]) === 'undefined' || !child.arguments[4] ? 'POST' : 'PATCH';
      if (member === 'actionform') method = 'POST';
      if (member === 'send' || member === 'request' || member === 'fetch' || member === 'mutate') {
        const explicit = child.arguments
          .map((arg) => literal(arg))
          .find((arg) => arg !== null && /^(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS)$/.test(arg));
        if (explicit) method = explicit;
        else if (member === 'fetch') method = 'DYNAMIC';
      }
      if (
        !apiMethods.has(member) &&
        !/^(send|request|fetch|page|collection|list|command|mutate|editform|actionform)$/.test(
          member,
        )
      )
        return;
      for (const path of candidates) {
        const service = /^\/v1\/([^/]+)/.exec(path)?.[1];
        const resolved = [
          'identity',
          'crm',
          'sales',
          'billing',
          'delivery',
          'communications',
          'tracking',
        ].includes(service ?? '')
          ? (service ?? null)
          : owner;
        const endpoint: Endpoint = {
          method,
          path,
          service: resolved,
          resolution: path.includes('${') || method === 'DYNAMIC' ? 'dynamic' : 'literal',
        };
        found.set(JSON.stringify(endpoint), endpoint);
      }
    });
  return [...found.values()].sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'),
  );
}
function sourceEvidence(ws: Workspace, nodes: ts.Node[], pattern: RegExp): string[] {
  return unique(
    nodes.flatMap((node) => {
      if (!pattern.test(node.getText())) return [];
      const source = sourceFor(ws, node);
      if (!source) return [];
      const place = location(source, node);
      return [`${place.path}:${place.line}-${place.endLine}`];
    }),
  );
}
function linkedTests(
  tests: DiscoveredTest[],
  observation: Observation,
  _nodes: ts.Node[],
  eps: Endpoint[],
): string[] {
  const normalize = (value: string): string =>
    value.replace(/\$\{[^}]+\}|\{[^}]+\}|:[a-zA-Z][a-zA-Z0-9_]*/g, '{parameter}');
  const role = observation.registration?.owner;
  const registeredKey = observation.registration?.key;
  return tests
    .filter((test) => {
      if (test.references.includes(observation.source.path)) return true;
      // Quality-tooling fixtures deliberately quote real endpoints to test the mapper.
      // Those literals are not product-behavior tests or new workflow coverage candidates.
      if (test.path.startsWith('tests/production/')) return false;
      return (
        eps.some(
          (ep) =>
            ep.path.startsWith('/v1/') &&
            test.literalValues.some((value) => normalize(value) === normalize(ep.path)),
        ) ||
        (observation.registration?.mode === 'demo' &&
          registeredKey &&
          test.literalValues.includes(registeredKey) &&
          (test.path.includes(role ?? '__none__') || test.path.includes('workflow-audit')))
      );
    })
    .map((test) => test.id);
}
function feature(
  ws: Workspace,
  row: Observation,
  tests: DiscoveredTest[],
  ordinal: number,
  resources: ReadonlyMap<string, string>,
): Feature {
  const mode = row.mode ?? modeFor(row.source.path);
  const owningService =
    row.registration?.kind === 'api-route'
      ? row.registration.owner
      : (servicePattern.exec(row.source.path)?.[1] ?? null);
  const nodes = ts.isSourceFile(row.node)
    ? []
    : row.bindings
      ? boundClosure(ws, row.node, row.bindings)
      : closure(ws, row.node);
  const text = nodes.map((node) => node.getText()).join('\n');
  const literals = unique(nodes.flatMap(strings));
  let eps = endpoints(nodes, owningService, resources);
  if (row.registration?.kind === 'api-route') {
    const { method, path, owner } = row.registration;
    if (!method || !path) throw new Error('API registration without method/path');
    eps = [{ method, path, service: owner, resolution: 'literal' }];
    if (owner !== 'api-gateway' && path.startsWith('/v1/'))
      eps.push({
        method,
        path: path.replace('/v1/', `/v1/${owner}/`),
        service: owner,
        resolution: 'literal',
      });
  }
  const registeredId = row.registration
    ? `${row.registration.kind}:${row.registration.owner}:${row.registration.mode}:${row.registration.key}`
    : null;
  const place = location(row.source, row.node);
  const id =
    registeredId ?? `${row.kind}:${row.source.path}:${sha256(row.key).slice(0, 12)}:${ordinal}`;
  const related = linkedTests(tests, row, nodes, eps);
  // Matching code references are traceability candidates, NEVER executed coverage.
  const scoped = (scope: string): string[] =>
    tests
      .filter((test) => related.includes(test.id) && test.scope === scope)
      .map((test) => test.id);
  const controls = unique(
    text.match(
      /\b(?:requireRole|requireOwner|actorScopes|authorizeOwned|authorizeQuoteAssignment|assertWritable|requireConsent|authenticate|verifyJwt|verifyIdToken|validateClaims|currentAssignments)\b/g,
    ) ?? [],
  );
  const roles = controls.includes('requireRole')
    ? literals.filter((value) =>
        ['rep', 'client', 'admin', 'finance', 'delivery', 'support', 'service'].includes(value),
      )
    : [];
  const events = literals.filter((value) => /^[a-z]+\.[a-z_.]+\.v\d+$/.test(value));
  const tables: string[] = [];
  for (const node of nodes)
    visit(node, (child) => {
      if (
        !ts.isCallExpression(child) ||
        !/\b(?:tx|transaction)\.(?:get|list|insert|update|delete|page|find)/.test(
          child.expression.getText(),
        )
      )
        return;
      const table =
        sourceString(ws, child.arguments[0], row.bindings) ?? literal(child.arguments[0]);
      if (table) tables.push(table);
    });
  const unresolved = [...(row.unresolved ?? [])];
  if (
    (row.kind === 'route' ||
      row.kind === 'action' ||
      row.kind === 'form' ||
      row.kind === 'handler') &&
    mode !== 'demo' &&
    !eps.length
  )
    unresolved.push(
      'No literal endpoint resolved; inspect shared/dynamic dispatch before claiming backend completion.',
    );
  if (!related.length)
    unresolved.push(
      'No source-reference test mapping discovered; required tests remain planned, not executed.',
    );
  if (eps.some((ep) => ep.resolution === 'dynamic'))
    unresolved.push('Dynamic URL/method requires runtime contract validation.');
  const presentationOnly =
    row.kind === 'handler' && row.key.startsWith('navigation:data-go:')
      ? {
          reason:
            'Declarative data-go navigation changes the selected client view; it does not itself perform a business mutation. Target views and their actions are separate inventory entries.',
          reviewedSourceFingerprint: place.fingerprint,
        }
      : null;
  const targetService =
    owningService ??
    eps.find((ep) => ep.service)?.service ??
    domainFor(`${row.key} ${row.source.path}`);
  return {
    id,
    key: row.key,
    kind: row.kind,
    apps: row.apps ?? appsFor(row.source.path),
    mode,
    source: place,
    owningService,
    targetService,
    endpoints: eps,
    authorization: {
      status:
        mode === 'demo'
          ? 'NOT_SERVER_AUTHORIZED'
          : owningService && row.registration?.path?.startsWith('/v1/')
            ? 'AUTHENTICATED_SERVICE_MIDDLEWARE_REQUIRES_POLICY_REVIEW'
            : controls.length
              ? 'SOURCE_CONTROLS_OBSERVED_NOT_RUNTIME_PROOF'
              : 'UNRESOLVED_OR_NOT_APPLICABLE',
      controls,
      roles,
      evidence: sourceEvidence(ws, nodes, /requireRole|authorize|principal|consent|actorScopes/),
    },
    persistenceEvent: {
      status:
        mode === 'demo'
          ? 'LOCAL_DEMO_STATE_NOT_BUSINESS_PERSISTENCE'
          : tables.length || events.length
            ? 'SOURCE_REFERENCES_NOT_PERSISTENCE_PROOF'
            : 'UNRESOLVED_OR_NO_WRITE',
      tables: unique(tables),
      events,
      evidence: sourceEvidence(
        ws,
        nodes,
        /repository\.transaction|\btx\.|\.emit\(|\.publish\(|localStorage|\.commit\(/,
      ),
    },
    currentStatus:
      mode === 'demo'
        ? 'DEMO_ONLY'
        : unresolved.length
          ? 'IMPLEMENTATION_OBSERVED_REVIEW_BLOCKED'
          : 'IMPLEMENTATION_OBSERVED_UNVERIFIED',
    targetSprint:
      row.kind === 'configuration'
        ? 'S02'
        : targetService === 'identity'
          ? 'S02'
          : targetService === 'crm'
            ? 'S03'
            : targetService === 'sales'
              ? 'S04'
              : targetService === 'delivery'
                ? 'S05'
                : targetService === 'billing'
                  ? 'S06'
                  : targetService === 'communications'
                    ? 'S07'
                    : targetService === 'tracking'
                      ? 'S08'
                      : row.kind === 'background-job'
                        ? 'S09'
                        : 'S10',
    categories: categories(`${row.key} ${row.source.path}`),
    tests: {
      contract: scoped('contract'),
      integration: scoped('integration'),
      e2e: scoped('e2e'),
      related,
      verification: 'STATIC_REFERENCE_CANDIDATES_ONLY; not asserted coverage or current execution',
    },
    requiredTests: ['contract', 'integration', 'e2e'].map((scope) => ({
      id: `PLANNED:${scope}:${id}`,
      scope,
      implementationStatus: 'REVIEW_REQUIRED_NOT_EXECUTED',
    })),
    presentationOnly,
    unresolved: unique(unresolved),
  };
}
function syntaxObservations(ws: Workspace, resources: ReadonlyMap<string, string>): Observation[] {
  const result: Observation[] = [];
  for (const source of ws.sources.values()) {
    if (
      !/^(?:apps|services|packages|infra)\//.test(source.path) ||
      /(?:\/test\/|\/tests\/|\.test\.|\.d\.ts$)/.test(source.path)
    )
      continue;
    const add = (kind: Kind, key: string, node: ts.Node): void => {
      result.push({ kind, key, source, node });
    };
    visit(source.ast, (node) => {
      if (ts.isCallExpression(node)) {
        const name = node.expression.getText(source.ast);
        const member = name.split('.').at(-1) ?? '';
        if (
          member === 'addEventListener' ||
          /^on[A-Z]/.test(member) ||
          /^(?:button|editorButton|action|commandForm|editForm|actionForm)$/.test(member)
        )
          add(
            /^(?:commandForm|editForm|actionForm)$/.test(member) ? 'form' : 'handler',
            `${name}:${literal(node.arguments[0]) ?? 'callback'}`,
            node,
          );
        if (
          /^(?:setInterval|setTimeout|startEventRuntime|consume|subscribe|schedule|cron|requestAnimationFrame)$/.test(
            member,
          )
        )
          add('background-job', name, node);
        if (
          /^(?:requireRole|requireOwner|actorScopes|authorizeOwned|assertWritable|requestPermissions|checkPermissions|requireConsent)$/.test(
            member,
          )
        )
          add('permission', `${name}:${strings(node).join('|')}`, node);
        if (/^(?:filter|search|sort|pageOptions|page|pagination|setSearchParams)$/.test(member))
          add('search-filter', name, node);
        if (/export|download|print|csv/i.test(member)) add('export', name, node);
        if (
          /^(?:signIn|signOut|login|logout|refresh|refreshSession|deleteAccount|register|resetPassword|restore|rotate|revoke)$/.test(
            member,
          )
        )
          add('account-lifecycle', name, node);
        if (
          endpoints([node], servicePattern.exec(source.path)?.[1] ?? null, resources).length &&
          !/\bapp\.(?:get|post|put|patch|delete|head|options)$/.test(name)
        )
          add('api-call', `${name}:${node.arguments.map(literal).filter(Boolean).join('|')}`, node);
      }
      if (ts.isThrowStatement(node) || ts.isCatchClause(node))
        add(
          'failure-state',
          `${ts.isThrowStatement(node) ? 'throw' : 'catch'}:${sha256(node.getText()).slice(0, 12)}`,
          node,
        );
      if (
        ts.isIfStatement(node) &&
        /offline|online|aborted|permission|denied|conflict|\.length\s*===?\s*0|!.*\.length|401|403|409|429|503/.test(
          node.expression.getText(),
        )
      )
        add('failure-state', `condition:${node.expression.getText()}`, node);
      if (
        (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
        /^(?:process|import\.meta)\.env(?:\.|\[)/.test(node.getText())
      )
        add('configuration', node.getText(), node);
      if (
        ts.isStringLiteralLike(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
      ) {
        const text = node.text;
        for (const match of text.matchAll(
          /\b(data-(?:submit|action|go|live-form)|type|name)\s*=\s*["']([^"']*)["']/g,
        )) {
          const attribute = match[1],
            value = match[2];
          if (!attribute || !value) continue;
          if (attribute === 'data-submit' || attribute === 'data-live-form')
            add('form', `${attribute}:${value}`, node);
          else if (attribute === 'data-action') add('handler', `${attribute}:${value}`, node);
          else if (attribute === 'data-go') add('handler', `navigation:data-go:${value}`, node);
          else if (/search|filter|query|sort/i.test(value))
            add('search-filter', `${attribute}:${value}`, node);
        }
        for (const match of text.matchAll(/<form\b([^>]*)/g))
          add('form', `html-form:${match[1]?.trim() ?? ''}`, node);
      }
    });
  }
  return result;
}
function resolveRegistration(
  ws: Workspace,
  registration: RuntimeRegistration,
  backend: ReadonlyMap<string, RegisteredSource[]>,
  live: ReadonlyMap<string, ts.ObjectLiteralExpression[]>,
): Observation {
  const matches: Array<{ source: Source; node: ts.Node; bindings?: Bindings }> = [];
  if (registration.mode === 'backend') {
    const records = backend.get(registration.owner) ?? [];
    const exact = records.filter(
      (row) => row.path === registration.path && row.method === registration.method,
    );
    const compatible = exact.length
      ? exact
      : registration.automatic
        ? records.filter((row) => row.path === registration.path && row.method === 'GET')
        : [];
    const owned = compatible.filter((row) =>
      row.source.path.startsWith(`services/${registration.owner}/`),
    );
    matches.push(...(owned.length ? owned : compatible));
  }
  if (registration.mode === 'server' && registration.owner !== 'rep') {
    for (const node of live.get(registration.owner) ?? []) {
      const id = node.properties.find(
        (p) => ts.isPropertyAssignment(p) && literal(p.name) === 'id',
      );
      const source = sourceFor(ws, node);
      if (
        source &&
        id &&
        ts.isPropertyAssignment(id) &&
        literal(id.initializer) === registration.key
      )
        matches.push({ source, node });
    }
  }
  for (const source of ws.sources.values()) {
    if (
      registration.mode === 'backend' ||
      (registration.mode === 'server' && registration.owner !== 'rep')
    )
      continue;
    if (
      registration.mode === 'demo' &&
      !source.path.startsWith(
        `apps/${Object.entries(appFolders).find(([, v]) => v === registration.owner)?.[0]}/src/`,
      )
    )
      continue;
    if (
      registration.mode === 'backend' &&
      !source.path.startsWith(`services/${registration.owner}/`) &&
      !source.path.startsWith('packages/service-kit/')
    )
      continue;
    if (
      registration.mode === 'server' &&
      !source.path.includes('apps/rep-mobile/src/server/workspace.ts')
    )
      continue;
    visit(source.ast, (node) => {
      if (
        registration.mode === 'demo' &&
        (ts.isPropertyAssignment(node) ||
          ts.isShorthandPropertyAssignment(node) ||
          ts.isMethodDeclaration(node)) &&
        literal(node.name) === registration.key
      ) {
        const object = node.parent;
        const parent = object.parent;
        if (
          ts.isObjectLiteralExpression(object) &&
          ts.isPropertyAssignment(parent) &&
          literal(parent.name) === (registration.kind === 'route' ? 'routes' : 'actions')
        )
          matches.push({ source, node });
      }
      if (registration.mode === 'server' && ts.isObjectLiteralExpression(node)) {
        const id = node.properties.find(
          (p) => ts.isPropertyAssignment(p) && literal(p.name) === 'id',
        );
        if (id && ts.isPropertyAssignment(id) && literal(id.initializer) === registration.key)
          matches.push({ source, node });
        if (
          registration.owner === 'rep' &&
          ts.isPropertyAssignment(node.parent) &&
          literal(node.parent.name) === registration.key
        )
          matches.push({ source, node: node.parent });
      }
    });
  }
  let matched = matches[0];
  const unresolved: string[] = [];
  if (!matched) {
    const fallbackPath =
      registration.mode === 'backend'
        ? `services/${registration.owner}/src/app.ts`
        : registration.mode === 'server'
          ? 'packages/api-client/src/live-workspace.ts'
          : `apps/${Object.entries(appFolders).find(([, v]) => v === registration.owner)?.[0]}/src/app.ts`;
    const source = ws.sources.get(fallbackPath);
    if (!source) throw new Error(`Cannot locate ${JSON.stringify(registration)}`);
    matched = { source, node: source.ast };
    unresolved.push(
      'Runtime registration exists but declaration is shared/dynamic; source file is a review anchor, not resolved handler.',
    );
  }
  if (matches.length > 1)
    unresolved.push(
      'Multiple compatible source declarations; inspect conditional/shared registrations.',
    );
  return {
    kind: registration.kind,
    key: registration.key,
    source: matched.source,
    node: matched.node,
    ...(matched.bindings ? { bindings: matched.bindings } : {}),
    registration,
    mode: registration.mode,
    apps: registration.kind === 'api-route' ? [] : [registration.owner],
    unresolved,
  };
}
export async function discover(ws: Workspace, runtime: RuntimeRegistration[]): Promise<Inventory> {
  const registrations = [...runtime];
  // Rep navigation is a private literal registry; parse the actual declaration rather than a historical route list.
  const rep = ws.sources.get('apps/rep-mobile/src/server/workspace.ts');
  if (rep)
    visit(rep.ast, (node) => {
      if (!ts.isVariableDeclaration(node) || literal(node.name) !== 'pages' || !node.initializer)
        return;
      const value = unwrap(node.initializer);
      if (!ts.isObjectLiteralExpression(value))
        throw new Error(
          'Rep pages registry changed shape; update discovery before accepting drift.',
        );
      for (const property of value.properties) {
        if (!ts.isPropertyAssignment(property) || !literal(property.name))
          throw new Error('Unresolved rep page registry entry');
        registrations.push({
          owner: 'rep',
          mode: 'server',
          kind: 'route',
          key: literal(property.name) ?? '',
        });
      }
    });
  registrations.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
  const resources = new Map<string, string>();
  const api = ws.sources.get('apps/rep-mobile/src/server/api.ts');
  if (api)
    visit(api.ast, (node) => {
      if (
        !ts.isVariableDeclaration(node) ||
        literal(node.name) !== 'resourcePaths' ||
        !node.initializer
      )
        return;
      const value = unwrap(node.initializer);
      if (!ts.isObjectLiteralExpression(value))
        throw new Error('resourcePaths must be a discoverable literal registry');
      for (const property of value.properties) {
        if (!ts.isPropertyAssignment(property)) throw new Error('Unknown resourcePaths spread');
        const key = literal(property.name),
          path = literal(property.initializer);
        if (!key || !path?.startsWith('/v1/')) throw new Error('Invalid resourcePaths mapping');
        resources.set(key, path);
      }
    });
  const tests = testCatalog(ws);
  const backend = new Map(
    [...new Set(registrations.filter((row) => row.mode === 'backend').map((row) => row.owner))].map(
      (owner) => [owner, registeredSources(ws, owner)],
    ),
  );
  const live = new Map(['admin', 'client'].map((role) => [role, liveSectionSources(ws, role)]));
  const observations = [
    ...registrations.map((registration) => resolveRegistration(ws, registration, backend, live)),
    ...syntaxObservations(ws, resources),
  ];
  const ordinals = new Map<string, number>();
  const features: Feature[] = [];
  for (const row of observations) {
    const base = `${row.kind}:${row.source.path}:${row.key}`;
    const ordinal = (ordinals.get(base) ?? 0) + 1;
    ordinals.set(base, ordinal);
    features.push(feature(ws, row, tests, ordinal, resources));
  }
  for (const path of ws.files.filter(
    (path) =>
      /^apps\/[^/]+\/(?:android|ios)\//.test(path) &&
      /\.(?:java|swift)$/.test(path) &&
      !/(?:androidTest|\/test\/|Tests\/)/.test(path),
  )) {
    const text = await readFile(resolve(ws.root, path), 'utf8');
    const id = `native-adapter:${path}`;
    const nativeApp = appsFor(path)[0];
    const rootFeature = features.find(
      (item) =>
        nativeApp &&
        item.apps.includes(nativeApp) &&
        item.kind === 'route' &&
        item.mode === 'server',
    );
    if (!rootFeature) throw new Error('Native adapter found without representative application');
    features.push({
      ...rootFeature,
      id,
      key: path,
      kind: 'native-adapter',
      apps: nativeApp ? [nativeApp] : [],
      mode: 'native',
      source: { path, line: 1, endLine: text.split('\n').length, fingerprint: sha256(text) },
      owningService: null,
      targetService: 'identity',
      endpoints: [],
      authorization: {
        status: 'NATIVE_SOURCE_REVIEW_REQUIRED',
        controls: [],
        roles: [],
        evidence: [path],
      },
      persistenceEvent: {
        status: 'PLATFORM_STORAGE_REVIEW_REQUIRED',
        tables: [],
        events: [],
        evidence: [path],
      },
      currentStatus: 'IMPLEMENTATION_OBSERVED_UNVERIFIED',
      targetSprint: 'S08',
      categories: ['account-lifecycle', 'permissions'],
      tests: {
        contract: [],
        integration: [],
        e2e: [],
        related: [],
        verification: 'Native test reports must be linked separately; no coverage inferred.',
      },
      requiredTests: ['contract', 'integration', 'e2e'].map((scope) => ({
        id: `PLANNED:${scope}:${id}`,
        scope,
        implementationStatus: 'REVIEW_REQUIRED_NOT_EXECUTED',
      })),
      presentationOnly: null,
      unresolved: [
        'Native source is inventoried per adapter; method-level platform/security review remains required.',
      ],
    });
  }
  await applyDispositions(ws, features);
  await applySemanticBindings(ws, features);
  features.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const sourceFiles = await Promise.all(
    ws.files
      .filter(
        (path) =>
          /(?:\.(?:ts|tsx|mts|cts|js|mjs|cjs|java|swift|json|ya?ml|sql|gradle|plist|xml|sh|html|css|properties|xcconfig|pbxproj)|(?:^|\/)(?:Dockerfile|gradlew|\.gitattributes|\.npmrc|CODEOWNERS))$/.test(
            path,
          ) && !/(?:artifacts\/|results\.json)/.test(path),
      )
      .map(async (path) => ({
        path,
        sha256: ws.sources.get(path)?.digest ?? sha256(await readFile(resolve(ws.root, path))),
      })),
  );
  sourceFiles.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const totals: Record<string, number> = {
    features: features.length,
    sourceFiles: sourceFiles.length,
    runtimeRegistrations: registrations.length,
    testCatalogEntries: tests.length,
    unmappedWorkflows: features.filter(
      (row) =>
        ['route', 'action', 'form', 'background-job'].includes(row.kind) &&
        !row.tests.related.length,
    ).length,
    unresolvedFeatures: features.filter((row) => row.unresolved.length).length,
  };
  for (const row of features) totals[`kind:${row.kind}`] = (totals[`kind:${row.kind}`] ?? 0) + 1;
  return {
    schemaVersion: 1,
    methodology:
      'Actual demo registries and Fastify onRoute probes + actual live sections + AST rep pages + AST handlers/forms/API calls/jobs/failure/config/permission scans. Source fingerprints bind every observation; no historical count used as a ceiling.',
    sourceDigest: sha256(JSON.stringify(sourceFiles)),
    sourceFiles,
    runtimeRegistrations: registrations,
    features,
    tests: tests.map(
      ({ text: _text, references: _references, literalValues: _literalValues, ...test }) => test,
    ),
    totals,
    limitations: [
      'Runtime probes execute registration only in disposable fixtures. They do not execute a business journey or establish production authorization/persistence.',
      'Finite source loops are expanded without execution; registered wildcard/parameter paths are known route patterns, not concrete request URLs. Dynamic strings, delegated handlers and indirect calls are explicitly unresolved where static analysis cannot establish a binding. Unresolved findings are blockers to exhaustive semantic acceptance, not silently excluded features.',
      'Test links are source-reference candidates, not executed coverage. Planned IDs are not implemented tests. Real browser E2E and physical-device evidence are separate.',
      'Owning service is actual source ownership; targetService on frontend records is a proposed domain allocation, not proof that its backend endpoint exists.',
      'Authorization/persistence closure is bounded to six source call levels and may include shared helpers. Record-level RBAC/tenant/ownership tests must validate each operation.',
      'Native adapters are inventoried per file. Dynamic native runtime behavior and provider/OS permissions require platform acceptance.',
    ],
  };
}

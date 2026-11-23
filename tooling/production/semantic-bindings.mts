import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sha256, type Workspace } from './source.mts';
import type { Endpoint, Feature, SourceTrace } from './model.mts';

export const semanticReasons = [
  'No literal endpoint resolved; inspect shared/dynamic dispatch before claiming backend completion.',
  'Dynamic URL/method requires runtime contract validation.',
  'Native source is inventoried per adapter; method-level platform/security review remains required.',
] as const;
const categories = new Set([
  'parameterized-http',
  'finite-dispatch',
  'view-read',
  'form-submit',
  'callback-adapter',
  'local-form-state',
  'local-draft',
  'auth-host',
  'navigation-delegate',
  'resource-lifecycle',
  'infrastructure-callback',
  'native-adapter',
  'platform-scaffold',
  'presentation',
]);
export interface Binding {
  featureId: string;
  sourceFingerprint: string;
  sourceFileSha256: string;
  category: string;
  rationale: string;
  resolves: string[];
  backendRouteIds: string[];
  delegateFeatureIds: string[];
  evidencePaths: string[];
  nativeMembers: Array<{ signature: string; line: number; sha256: string }>;
}
export interface BindingDocument {
  schemaVersion: 1;
  scope: string;
  evidenceFiles: Record<string, string>;
  bindings: Binding[];
}
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
export function parseBindings(value: unknown): BindingDocument {
  const doc = object(value),
    evidence = object(doc?.evidenceFiles);
  if (
    doc?.schemaVersion !== 1 ||
    typeof doc.scope !== 'string' ||
    !evidence ||
    !Object.values(evidence).every(
      (hash) => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash),
    ) ||
    !Array.isArray(doc.bindings)
  )
    throw new Error('Invalid semantic binding document');
  const bindings: Binding[] = [];
  for (const input of doc.bindings) {
    const row = object(input);
    if (
      !row ||
      typeof row.featureId !== 'string' ||
      typeof row.sourceFingerprint !== 'string' ||
      typeof row.sourceFileSha256 !== 'string' ||
      typeof row.category !== 'string' ||
      typeof row.rationale !== 'string' ||
      !strings(row.resolves) ||
      !strings(row.backendRouteIds) ||
      !strings(row.delegateFeatureIds) ||
      !strings(row.evidencePaths) ||
      !Array.isArray(row.nativeMembers)
    )
      throw new Error('Invalid semantic binding row');
    const members: Binding['nativeMembers'] = [];
    for (const inputMember of row.nativeMembers) {
      const member = object(inputMember);
      if (
        !member ||
        typeof member.signature !== 'string' ||
        typeof member.line !== 'number' ||
        !Number.isInteger(member.line) ||
        member.line < 1 ||
        typeof member.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(member.sha256)
      )
        throw new Error('Invalid native declaration anchor');
      members.push({ signature: member.signature, line: member.line, sha256: member.sha256 });
    }
    bindings.push({
      featureId: row.featureId,
      sourceFingerprint: row.sourceFingerprint,
      sourceFileSha256: row.sourceFileSha256,
      category: row.category,
      rationale: row.rationale,
      resolves: row.resolves,
      backendRouteIds: row.backendRouteIds,
      delegateFeatureIds: row.delegateFeatureIds,
      evidencePaths: row.evidencePaths,
      nativeMembers: members,
    });
  }
  return {
    schemaVersion: 1,
    scope: doc.scope,
    evidenceFiles: Object.fromEntries(
      Object.entries(evidence).map(([path, hash]) => [path, String(hash)]),
    ),
    bindings,
  };
}
/** Resolve only the two reviewed URL constructors, not arbitrary JavaScript expressions. */
function dynamicOperations(endpoint: Endpoint): Array<{ method: string; path: string }> {
  if (
    endpoint.method === 'DYNAMIC' &&
    endpoint.path === "/v1/sales/quotes${existing && !copy ? '/' + idPath(existing.id) : ''}"
  )
    return [
      { method: 'POST', path: '/v1/sales/quotes' },
      { method: 'PATCH', path: '/v1/sales/quotes/:id' },
    ];
  const path = endpoint.path.replace(/\$\{(?:idPath|idSegment)\([^{}\r\n]*\)\}/g, ':id');
  if (
    path === endpoint.path ||
    path.includes('${') ||
    !/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(endpoint.method)
  )
    throw new Error('Unsupported dynamic HTTP expression: ' + endpoint.path);
  return [{ method: endpoint.method, path }];
}
function dynamicBindings(row: Feature, routes: Feature[]): SourceTrace['dynamicEndpointBindings'] {
  return row.endpoints
    .filter((endpoint) => endpoint.resolution === 'dynamic')
    .map((original) => {
      const routeIds = dynamicOperations(original).map((operation) => {
        const matches = routes.filter((route) =>
          route.endpoints.some(
            (endpoint) => endpoint.method === operation.method && endpoint.path === operation.path,
          ),
        );
        if (matches.length !== 1)
          throw new Error(
            'Dynamic branch lacks one exact registered operation: ' +
              operation.method +
              ' ' +
              operation.path,
          );
        const match = matches[0];
        if (!match) throw new Error('Missing registered operation');
        return match.id;
      });
      return { original: structuredClone(original), routeIds };
    });
}
/** Inventory declaration starts/exports, not method bodies or native security acceptance. */
export function nativeDeclarations(path: string, text: string): Binding['nativeMembers'] {
  const name =
    path
      .split('/')
      .at(-1)
      ?.replace(/\.java$/, '') ?? '';
  const members: Binding['nativeMembers'] = [];
  for (const [index, line] of text.split('\n').entries()) {
    const signature = line.trim();
    let declaration = false;
    if (path.endsWith('.swift')) {
      declaration =
        /^(?:(?:@objc|public|private|fileprivate|internal|override|static|final|class)\s+)*(?:func\s+\w+|init)\s*\(/.test(
          signature,
        ) ||
        signature.startsWith('CAPPluginMethod(name:') ||
        /^(?:private\s+)?var\s+\w+\s*:\s*\w+\s*\{/.test(signature);
    } else if (path.endsWith('.java')) {
      declaration =
        /^(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:public|private|protected|static|final|synchronized|abstract|default)\s+)*(?:[\w.$]+(?:<[^;={}]+>)?(?:\[\])?\s+)[A-Za-z]\w*\s*\([^;{}=]*\)\s*(?:throws [\w, ]+)?\s*(?:\{|;)/.test(
          signature,
        ) && !/^(?:if|for|while|switch|catch|try|return|throw|new|case|break)\b/.test(signature);
      if (
        /^[A-Za-z]\w*$/.test(name) &&
        new RegExp('^(?:(?:public|private|protected)\\s+)?' + name + '\\s*\\(').test(signature)
      )
        declaration = true;
    }
    if (declaration) members.push({ signature, line: index + 1, sha256: sha256(signature) });
  }
  return members;
}
/** These source-bound decisions cannot approve tests, external providers or a production release. */
export function bindSemantics(
  document: BindingDocument,
  features: Feature[],
  sources: ReadonlyMap<string, string>,
): void {
  const byId = new Map(features.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const plans: Array<{
    row: Feature;
    binding: Binding;
    routes: Feature[];
    dynamic: SourceTrace['dynamicEndpointBindings'];
  }> = [];
  for (const [path, expected] of Object.entries(document.evidenceFiles)) {
    const text = sources.get(path);
    if (text === undefined || sha256(text) !== expected)
      throw new Error('Semantic evidence needs source re-review: ' + path);
  }
  for (const binding of document.bindings) {
    const row = byId.get(binding.featureId);
    if (
      !row ||
      seen.has(binding.featureId) ||
      !categories.has(binding.category) ||
      binding.rationale.trim().length < 30 ||
      !binding.resolves.length ||
      new Set(binding.resolves).size !== binding.resolves.length ||
      !binding.resolves.every(
        (reason) =>
          semanticReasons.some((allowed) => reason === allowed) && row.unresolved.includes(reason),
      )
    )
      throw new Error('Unknown, duplicate or overbroad semantic binding: ' + binding.featureId);
    seen.add(binding.featureId);
    if (
      row.kind === 'api-route' ||
      row.source.fingerprint !== binding.sourceFingerprint ||
      document.evidenceFiles[row.source.path] !== binding.sourceFileSha256 ||
      !binding.evidencePaths.includes(row.source.path) ||
      binding.evidencePaths.some((path) => !Object.hasOwn(document.evidenceFiles, path))
    )
      throw new Error('Unbound semantic source: ' + row.id);
    const routes = binding.backendRouteIds.map((id) => {
      const route = byId.get(id);
      if (
        !route ||
        route.kind !== 'api-route' ||
        route.owningService === 'api-gateway' ||
        !route.owningService ||
        !binding.evidencePaths.includes(route.source.path)
      )
        throw new Error('Unbound backend policy reference: ' + id);
      return route;
    });
    if (
      new Set(binding.backendRouteIds).size !== binding.backendRouteIds.length ||
      new Set(binding.delegateFeatureIds).size !== binding.delegateFeatureIds.length ||
      binding.delegateFeatureIds.some((id) => id === row.id || !byId.has(id))
    )
      throw new Error('Invalid semantic delegate: ' + row.id);
    if (
      (binding.category === 'parameterized-http' ||
        binding.category === 'form-submit' ||
        binding.category === 'view-read') &&
      !routes.length
    )
      throw new Error('HTTP trace without registered operations: ' + row.id);
    if (binding.resolves.includes(semanticReasons[1]) && !routes.length)
      throw new Error('Dynamic HTTP trace requires registered operations: ' + row.id);
    if (
      binding.category === 'presentation' &&
      (routes.length ||
        row.endpoints.length ||
        row.kind !== 'handler' ||
        /search|filter|export|account|permission/.test(row.kind))
    )
      throw new Error('Business operation cannot be presentation-only: ' + row.id);
    const text = sources.get(row.source.path) ?? '';
    for (const member of binding.nativeMembers) {
      const line = text.split('\n')[member.line - 1];
      if (
        line === undefined ||
        sha256(line.trim()) !== member.sha256 ||
        line.trim() !== member.signature
      )
        throw new Error('Native declaration changed: ' + row.id);
    }
    if (
      binding.resolves.includes(semanticReasons[2]) &&
      (!['native-adapter', 'platform-scaffold'].includes(binding.category) ||
        row.kind !== 'native-adapter')
    )
      throw new Error('Native policy needs a native source classification: ' + row.id);
    if (
      binding.resolves.includes(semanticReasons[2]) &&
      JSON.stringify(binding.nativeMembers) !==
        JSON.stringify(nativeDeclarations(row.source.path, text))
    )
      throw new Error('Native declaration inventory is incomplete: ' + row.id);
    const dynamic = dynamicBindings(row, routes);
    plans.push({ row, binding, routes, dynamic });
  }
  // Validate the complete document before applying any row: malformed input cannot partly clear gaps.
  for (const { row, binding, routes, dynamic } of plans) {
    const policyReferences: SourceTrace['backendPolicies'] = routes.map((route) => ({
      routeId: route.id,
      owningService: route.owningService,
      source: route.source,
      authorization: route.authorization,
      persistenceEvent: route.persistenceEvent,
    }));
    row.sourceTrace = {
      status: 'SOURCE_BOUND_NOT_RUNTIME_ACCEPTANCE',
      category: binding.category,
      rationale: binding.rationale,
      evidence: binding.evidencePaths.map((path) => ({
        path,
        sha256: document.evidenceFiles[path] ?? '',
      })),
      originalEndpoints: structuredClone(row.endpoints),
      dynamicEndpointBindings: dynamic,
      backendPolicies: policyReferences,
      delegateFeatureIds: binding.delegateFeatureIds,
      nativeMembers: binding.nativeMembers,
      testEffect: 'NONE: candidate links, missing tests and planned IDs are unchanged',
    };
    if (routes.length) {
      const endpoints = row.endpoints.filter((endpoint) => endpoint.resolution !== 'dynamic');
      for (const route of routes)
        for (const endpoint of route.endpoints) {
          if (endpoint.path.startsWith(`/v1/${route.owningService}/`))
            endpoints.push({ ...endpoint, resolution: 'source-bound' });
        }
      row.endpoints = [
        ...new Map(
          endpoints.map((endpoint) => [endpoint.method + ' ' + endpoint.path, endpoint]),
        ).values(),
      ].sort((a, b) => (a.method + ' ' + a.path).localeCompare(b.method + ' ' + b.path, 'en'));
    }
    row.unresolved = row.unresolved.filter((reason) => !binding.resolves.includes(reason));
    if (binding.category === 'presentation')
      row.presentationOnly = {
        reason: binding.rationale,
        reviewedSourceFingerprint: row.source.fingerprint,
      };
    // No inherited policy, source annotation or planned ID turns implementation into verified behavior.
    row.currentStatus =
      row.mode === 'demo' ? 'DEMO_ONLY' : 'SOURCE_TRACE_BOUND_IMPLEMENTATION_UNVERIFIED';
  }
}
export async function applySemanticBindings(ws: Workspace, features: Feature[]): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(resolve(ws.root, 'docs/production/semantic-bindings.json'), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
  const document = parseBindings(JSON.parse(raw) as unknown);
  const sources = new Map<string, string>();
  for (const path of Object.keys(document.evidenceFiles)) {
    if (
      !ws.files.includes(path) ||
      path.includes('..') ||
      !/^(apps|services|packages)\//.test(path)
    )
      throw new Error('Semantic evidence path outside scanned source: ' + path);
    sources.set(
      path,
      ws.sources.get(path)?.text ?? (await readFile(resolve(ws.root, path), 'utf8')),
    );
  }
  bindSemantics(document, features, sources);
}

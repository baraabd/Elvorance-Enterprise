import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import {
  bindSemantics,
  applySemanticBindings,
  nativeDeclarations,
  parseBindings,
  semanticReasons,
  type BindingDocument,
} from '../../tooling/production/semantic-bindings.mts';
import { sha256 } from '../../tooling/production/source.mts';
import { gapReport } from '../../tooling/production/gap-report.mts';
import type { Feature, Inventory } from '../../tooling/production/model.mts';
const testDebt =
  'No source-reference test mapping discovered; required tests remain planned, not executed.';
function feature(id: string, path: string): Feature {
  return {
    id,
    key: id,
    kind: 'handler',
    apps: ['rep'],
    mode: 'server',
    source: { path, line: 1, endLine: 1, fingerprint: sha256(id) },
    owningService: null,
    targetService: 'sales',
    endpoints: [],
    authorization: { status: 'SOURCE_OBSERVED', controls: [], roles: [], evidence: [] },
    persistenceEvent: { status: 'SOURCE_OBSERVED', tables: [], events: [], evidence: [] },
    currentStatus: 'UNVERIFIED',
    targetSprint: 'S03',
    categories: [],
    tests: { contract: [], integration: [], e2e: [], related: [], verification: 'NOT_EXECUTED' },
    requiredTests: ['contract', 'integration', 'e2e'].map((scope) => ({
      id: `PLANNED:${id}:${scope}`,
      scope,
      implementationStatus: 'REVIEW_REQUIRED_NOT_EXECUTED',
    })),
    presentationOnly: null,
    unresolved: [],
  };
}
function fixture() {
  const caller = feature('caller', 'apps/rep-mobile/src/example.ts');
  caller.endpoints = [
    {
      method: 'PATCH',
      path: '/v1/sales/quotes/${idPath(existing.id)}',
      service: 'sales',
      resolution: 'dynamic',
    },
  ];
  caller.unresolved = [semanticReasons[1], testDebt];
  const route = feature('registered-route', 'services/sales/src/transport/routes.ts');
  route.kind = 'api-route';
  route.owningService = 'sales';
  route.endpoints = [
    { method: 'PATCH', path: '/v1/sales/quotes/:id', service: 'sales', resolution: 'literal' },
  ];
  const sources = new Map([
    [caller.source.path, 'validated caller source'],
    [route.source.path, 'registered policy source'],
  ]);
  const document: BindingDocument = {
    schemaVersion: 1,
    scope: 'Source evidence only, not execution or coverage.',
    evidenceFiles: Object.fromEntries([...sources].map(([path, text]) => [path, sha256(text)])),
    bindings: [
      {
        featureId: caller.id,
        sourceFingerprint: caller.source.fingerprint,
        sourceFileSha256: sha256(sources.get(caller.source.path) ?? ''),
        category: 'parameterized-http',
        rationale: 'A parameterized request mapped to one exact registered route.',
        resolves: [semanticReasons[1]],
        backendRouteIds: [route.id],
        delegateFeatureIds: [],
        evidencePaths: [...sources.keys()],
        nativeMembers: [],
      },
    ],
  };
  const binding = document.bindings[0];
  assert.ok(binding);
  return { caller, route, features: [caller, route], document, binding, sources };
}
test('source bindings preserve original expressions, policy provenance and all test debt', () => {
  const f = fixture();
  const tests = structuredClone(f.caller.tests),
    planned = structuredClone(f.caller.requiredTests);
  const original = structuredClone(f.caller.endpoints);
  bindSemantics(parseBindings(f.document), f.features, f.sources);
  assert.deepEqual(f.caller.sourceTrace?.originalEndpoints, original);
  assert.equal(f.caller.sourceTrace?.dynamicEndpointBindings[0]?.routeIds[0], f.route.id);
  assert.equal(f.caller.sourceTrace?.backendPolicies[0]?.source.path, f.route.source.path);
  assert.deepEqual(f.caller.unresolved, [testDebt]);
  assert.deepEqual(f.caller.tests, tests);
  assert.deepEqual(f.caller.requiredTests, planned);
  assert.equal(f.caller.currentStatus, 'SOURCE_TRACE_BOUND_IMPLEMENTATION_UNVERIFIED');
  assert.equal(f.caller.endpoints[0]?.resolution, 'source-bound');
  assert.equal(f.caller.presentationOnly, null);
});
test('an unrelated registered route cannot resolve a dynamic request', () => {
  const f = fixture();
  f.route.endpoints[0] = {
    method: 'PATCH',
    path: '/v1/sales/tasks/:id',
    service: 'sales',
    resolution: 'literal',
  };
  assert.throws(
    () => bindSemantics(f.document, f.features, f.sources),
    /exact registered operation/,
  );
});
test('a matching path with the wrong HTTP verb is rejected', () => {
  const f = fixture();
  const endpoint = f.route.endpoints[0];
  assert.ok(endpoint);
  endpoint.method = 'DELETE';
  assert.throws(
    () => bindSemantics(f.document, f.features, f.sources),
    /exact registered operation/,
  );
});
test('conditional quote creation and update require both distinct operations', () => {
  const f = fixture();
  f.caller.endpoints = [
    {
      method: 'DYNAMIC',
      path: "/v1/sales/quotes${existing && !copy ? '/' + idPath(existing.id) : ''}",
      service: 'sales',
      resolution: 'dynamic',
    },
  ];
  assert.throws(() => bindSemantics(f.document, f.features, f.sources), /POST/);
  const create = structuredClone(f.route);
  create.id = 'create-quote';
  create.endpoints = [
    { method: 'POST', path: '/v1/sales/quotes', service: 'sales', resolution: 'literal' },
  ];
  f.features.push(create);
  f.binding.backendRouteIds.push(create.id);
  bindSemantics(f.document, f.features, f.sources);
  assert.deepEqual(f.caller.sourceTrace?.dynamicEndpointBindings[0]?.routeIds, [
    'create-quote',
    'registered-route',
  ]);
});
test('unknown runtime URL expressions remain unresolved rather than canonicalized', () => {
  const f = fixture();
  const endpoint = f.caller.endpoints[0];
  assert.ok(endpoint);
  endpoint.path = '/v1/${runtimeService}/quotes/${idPath(existing.id)}';
  assert.throws(() => bindSemantics(f.document, f.features, f.sources), /Unsupported dynamic/);
});
test('changed source file invalidates the entire source decision', () => {
  const f = fixture();
  f.sources.set(f.caller.source.path, 'changed source');
  assert.throws(() => bindSemantics(f.document, f.features, f.sources), /source re-review/);
  assert.equal(f.caller.sourceTrace, undefined);
});
test('changed source fingerprint and deleted feature IDs fail closed', () => {
  const f = fixture();
  f.binding.sourceFingerprint = 'b'.repeat(64);
  assert.throws(() => bindSemantics(f.document, f.features, f.sources), /Unbound semantic source/);
  f.binding.featureId = 'missing';
  assert.throws(() => bindSemantics(f.document, f.features, f.sources), /Unknown/);
});
test('partial validation failure leaves every feature unchanged', () => {
  const f = fixture();
  const before = structuredClone(f.features);
  f.document.bindings.push({ ...structuredClone(f.binding), featureId: 'missing' });
  assert.throws(() => bindSemantics(f.document, f.features, f.sources), /Unknown/);
  assert.deepEqual(f.features, before);
});
test('annotations may never clear test-mapping debt or arbitrary new warnings', () => {
  const f = fixture();
  f.binding.resolves.push(testDebt);
  assert.throws(() => bindSemantics(f.document, f.features, f.sources), /overbroad/);
  f.binding.resolves = [semanticReasons[1]];
  f.caller.unresolved.push('new unknown warning');
  bindSemantics(f.document, f.features, f.sources);
  assert.deepEqual(f.caller.unresolved, [testDebt, 'new unknown warning']);
});
test('unbound, gateway-only and duplicate backend references are rejected', () => {
  for (const mode of ['missing', 'gateway', 'duplicate', 'unbound-source']) {
    const f = fixture();
    if (mode === 'missing') f.binding.backendRouteIds = ['missing'];
    if (mode === 'gateway') f.route.owningService = 'api-gateway';
    if (mode === 'duplicate') f.binding.backendRouteIds.push(f.route.id);
    if (mode === 'unbound-source') f.binding.evidencePaths = [f.caller.source.path];
    assert.throws(
      () => bindSemantics(f.document, f.features, f.sources),
      /Unbound backend|Invalid semantic/,
    );
  }
});
test('a business HTTP handler cannot become presentation-only', () => {
  const f = fixture();
  f.binding.category = 'presentation';
  assert.throws(() => bindSemantics(f.document, f.features, f.sources), /Business operation/);
});
test('source binding cannot edit the registered backend policy itself', () => {
  const f = fixture();
  f.caller.kind = 'api-route';
  assert.throws(() => bindSemantics(f.document, f.features, f.sources), /Unbound semantic source/);
});
test('duplicate annotations and nonexistent delegates are rejected', () => {
  const f = fixture();
  f.document.bindings.push(structuredClone(f.binding));
  assert.throws(() => bindSemantics(f.document, f.features, f.sources), /duplicate/);
  f.document.bindings.pop();
  f.binding.delegateFeatureIds.push('nonexistent');
  assert.throws(
    () => bindSemantics(f.document, f.features, f.sources),
    /Invalid semantic delegate/,
  );
});
test('native member anchors distinguish Java declarations from calls and Swift bridge exports', () => {
  const java =
    'public Example() {\nvoid success(String callbackUrl);\n@Override public void load() {\ncancel("FAILED");\nregisterPlugin(Example.class);\ngetActivity().runOnUiThread(() -> action());';
  assert.equal(nativeDeclarations('Example.java', java).length, 3);
  const swift =
    'private func clear() {\nCAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),\nprivate var code: String {\nfinish(.success(url))';
  assert.equal(nativeDeclarations('Example.swift', swift).length, 3);
});
test('missing or forged native declaration anchors cannot close adapter analysis', () => {
  const f = fixture();
  f.caller.kind = 'native-adapter';
  f.caller.source.path = 'apps/rep-mobile/Example.java';
  const text = 'public Example() {\npublic void get() {';
  f.sources.set(f.caller.source.path, text);
  f.document.evidenceFiles[f.caller.source.path] = sha256(text);
  f.binding.sourceFileSha256 = sha256(text);
  f.binding.evidencePaths.push(f.caller.source.path);
  f.binding.category = 'native-adapter';
  f.binding.resolves = [semanticReasons[2]];
  f.binding.backendRouteIds = [];
  f.caller.endpoints = [];
  f.caller.unresolved = [semanticReasons[2]];
  assert.throws(() => bindSemantics(f.document, f.features, f.sources), /incomplete/);
  f.binding.nativeMembers = nativeDeclarations(f.caller.source.path, text);
  const member = f.binding.nativeMembers[0];
  assert.ok(member);
  member.signature = 'forged';
  assert.throws(() => bindSemantics(f.document, f.features, f.sources), /changed/);
});
test('malformed binding input is rejected without casts that fabricate usable records', () => {
  assert.throws(() => parseBindings({ schemaVersion: 1, bindings: [] }), /Invalid/);
  const f = fixture();
  assert.throws(
    () => parseBindings({ ...f.document, evidenceFiles: { wrong: 'not-sha256' } }),
    /Invalid/,
  );
  assert.throws(
    () =>
      parseBindings({ ...f.document, bindings: [{ ...f.binding, nativeMembers: [{ line: -1 }] }] }),
    /Invalid/,
  );
});
test('all committed semantic decisions bind to current source without upgrading absent tests', async () => {
  const document = parseBindings(
    JSON.parse(await readFile('docs/production/semantic-bindings.json', 'utf8')) as unknown,
  );
  const inventory = JSON.parse(
    await readFile('docs/production/feature-matrix.json', 'utf8'),
  ) as Inventory;
  for (const binding of document.bindings) {
    const row = inventory.features.find((feature) => feature.id === binding.featureId);
    assert.ok(row);
    if (row.sourceTrace) row.endpoints = row.sourceTrace.originalEndpoints;
    row.unresolved = [...new Set([...row.unresolved, ...binding.resolves])];
    delete row.sourceTrace;
  }
  const sources = new Map(
    await Promise.all(
      Object.keys(document.evidenceFiles).map(
        async (path) => [path, await readFile(path, 'utf8')] as const,
      ),
    ),
  );
  const testStates = inventory.features.map((row) => ({
    id: row.id,
    tests: row.tests,
    requiredTests: row.requiredTests,
  }));
  bindSemantics(document, inventory.features, sources);
  assert.deepEqual(
    inventory.features.map((row) => ({
      id: row.id,
      tests: row.tests,
      requiredTests: row.requiredTests,
    })),
    testStates,
  );
  const report = gapReport(inventory);
  assert.equal(report.totals.recordsWithSemanticGaps, 0);
  assert.equal(report.semanticStatus, 'SOURCE_TRACE_COMPLETE_NOT_RUNTIME_ACCEPTANCE');
  assert.ok(report.totals.recordsWithOnlyTestMappingDebt > 0);
  assert.equal(report.status, 'BLOCKED');
  assert.ok(
    inventory.features
      .filter((row) => row.kind === 'native-adapter' && row.apps.includes('client'))
      .every((row) => row.currentStatus !== 'PASS'),
  );
});

test('only reviewed and scanned staging sources can supply semantic evidence', async (t) => {
  const cases = [
    ['infra/railway/staging/http.mts', true, true],
    ['infra/railway/staging/target.mts', true, true],
    ['infra/railway/staging/journey.mts', true, true],
    ['infra/railway/staging/policy-checks.mts', true, true],
    ['infra/railway/staging/journey.mts', false, false],
    ['infra/railway/production/journey.mts', true, false],
    ['infra/railway/staging/unreviewed.mts', true, false],
    ['docs/arbitrary.mts', true, false],
    ['infra/railway/staging/../journey.mts', true, false],
  ] as const;
  for (const [path, scanned, accepted] of cases) {
    await t.test(`${path} scanned=${scanned}`, async () => {
      const f = fixture();
      const oldPath = f.caller.source.path;
      const text = f.sources.get(oldPath);
      assert.ok(text);
      f.caller.source.path = path;
      f.sources.delete(oldPath);
      f.sources.set(path, text);
      delete f.document.evidenceFiles[oldPath];
      f.document.evidenceFiles[path] = sha256(text);
      f.binding.evidencePaths = f.binding.evidencePaths.map((p) => (p === oldPath ? path : p));
      const root = await mkdtemp(resolve(tmpdir(), 'elv-semantic-staging-'));
      try {
        await mkdir(resolve(root, 'docs/production'), { recursive: true });
        await writeFile(
          resolve(root, 'docs/production/semantic-bindings.json'),
          JSON.stringify(f.document),
        );
        for (const [file, value] of f.sources) {
          if (file.includes('..')) continue;
          await mkdir(dirname(resolve(root, file)), { recursive: true });
          await writeFile(resolve(root, file), value);
        }
        const workspace = {
          root,
          files: [...f.sources.keys()].filter((p) => p !== path || scanned),
          sources: new Map(),
          checker: ts.createProgram([], {}).getTypeChecker(),
        };
        if (accepted) {
          await applySemanticBindings(workspace, f.features);
          assert.ok(f.caller.sourceTrace);
          assert.ok(!f.caller.unresolved.includes(semanticReasons[1]));
          assert.ok(f.caller.unresolved.includes(testDebt));
          assert.equal(f.caller.tests.verification, 'NOT_EXECUTED');
        } else {
          await assert.rejects(
            applySemanticBindings(workspace, f.features),
            /outside scanned source/,
          );
          assert.equal(f.caller.sourceTrace, undefined);
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});

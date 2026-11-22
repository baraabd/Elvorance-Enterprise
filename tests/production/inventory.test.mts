import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extract } from '../../tooling/production/extract.mts';
import {
  templateMatches,
  workflowGapRegressions,
  validateRuntime,
  type Feature,
} from '../../tooling/production/inventory.mts';
import { debtRegressions, measureDebt } from '../../tooling/production/debt.mts';
import { digest } from '../../tooling/production/source.mts';

const path = 'apps/admin-web/src/features/fixture/index.ts';
const fixture = `function save() { api.mutate('POST', '/v1/crm/customers', {}); }
function render() { return '<form data-submit="save"><button data-action="save">Save</button></form>'; }
export function createFeature() { return { routes: { home: {render} }, actions: { save } }; }`;

test('S01 inventory: actual route/action/form/control registrations receive stable IDs and locations', () => {
  const result = extract(path, fixture);
  assert.deepEqual(result.diagnostics, []);
  for (const [kind, name] of [
    ['route', 'home'],
    ['action', 'save'],
    ['form', 'data-submit:save'],
    ['control', 'data-action:save'],
  ])
    assert.ok(
      result.items.some((item) => item.kind === kind && item.name === name),
      `${kind}:${name}`,
    );
  assert.equal(new Set(result.items.map((item) => item.id)).size, result.items.length);
  assert.ok(
    result.items.every((item) => item.source.line > 0 && /^[a-f0-9]{64}$/.test(item.source.sha256)),
  );
});
test('S01 inventory: adding a registration changes the inventory rather than relying on a frozen route count', () => {
  const before = extract(path, fixture);
  const after = extract(
    path,
    fixture.replace('home: {render}', 'home: {render}, permissions: {render}'),
  );
  assert.equal(
    after.items.filter((item) => item.kind === 'route').length,
    before.items.filter((item) => item.kind === 'route').length + 1,
  );
});
test('S01 inventory: editing a handler preserves its stable ID while changing its evidence hash', () => {
  const before = extract(
    path,
    `export const f = {actions: {'submit': () => api.save('old')}};`,
  ).items.find((item) => item.kind === 'action')!;
  const after = extract(
    path,
    `export const f = {actions: {'submit': () => api.save('new')}};`,
  ).items.find((item) => item.kind === 'action')!;
  assert.equal(before.id, after.id);
  assert.notEqual(before.source.sha256, after.source.sha256);
});
test('S01 inventory: unknown computed registrations and spreads are explicit blockers', () => {
  const result = extract(path, `const f = {routes: {[lookup()]: {render}, ...unknownRoutes}};`);
  assert.equal(result.diagnostics.length, 2);
});
test('S01 inventory: global actions, background jobs, event publication and failure handlers are included', () => {
  const result = extract(
    'packages/app-runtime/src/index.ts',
    `const coreActions = {'close-modal': close}; setInterval(work, 1000); tx.emit('example.created.v1', {}); target.addEventListener('change', work); try { work() } catch(error) { retry() }`,
  );
  for (const kind of ['action', 'job', 'event', 'listener', 'failure'])
    assert.ok(
      result.items.some((item) => item.kind === kind),
      kind,
    );
});
test('S01 inventory: live forms and search/filter/export calls are not lost', () => {
  const result = extract(
    path,
    `const html = '<form data-live-form="customer"></form>'; search('query'); exportCSV('rows'); filter('active');`,
  );
  assert.ok(
    result.items.some((item) => item.kind === 'form' && item.name === 'data-live-form:customer'),
  );
  for (const tag of ['search', 'filter', 'export'])
    assert.ok(
      result.items.some((item) => item.tags.includes(tag)),
      tag,
    );
});
test('S01 inventory: runtime/static equality detects an unextracted application action', () => {
  const result = extract(path, fixture);
  const errors = validateRuntime(
    result.items,
    {
      demo: [{ app: 'admin-web', routes: ['home'], actions: ['save', 'delete'] }],
      http: [],
      live: [],
    },
    [],
  );
  assert.match(errors.join(), /actions mismatch/);
});
test('S01 inventory: contract comparison is bidirectional and fails for an undocumented operation', () => {
  const surface = extract(
    'services/crm/src/transport/routes.ts',
    `app.get('/v1/customers', handler);`,
  ).items;
  const errors = validateRuntime(
    surface,
    {
      demo: [],
      live: [],
      http: [{ service: 'crm', method: 'GET', path: '/v1/customers', automaticHead: false }],
    },
    [],
  );
  assert.match(errors.join(), /Undocumented runtime operation/);
});
test('S01 inventory: a documented but unregistered operation cannot pass', () => {
  const errors = validateRuntime([], { demo: [], live: [], http: [] }, [
    {
      service: 'crm',
      method: 'GET',
      servicePath: '/v1/missing',
      gatewayPath: '/v1/crm/missing',
      roles: ['admin'],
    },
  ]);
  assert.match(errors.join(), /unregistered/);
});
test('S01 inventory: dynamic handler templates match only their actual URL structure', () => {
  assert.equal(templateMatches('`/v1/${domain.path}/:id`', '/v1/tasks/:id'), true);
  assert.equal(templateMatches('`/v1/${domain.path}/:id`', '/v1/tasks/extra/:id'), false);
  assert.equal(templateMatches('/v1/a.b', '/v1/aXb'), false);
});
test('S01 debt: fixture strings do not create suppressions, new suppressions and any types regress', (t) => {
  const root = mkdtempSync(join(tmpdir(), 's01-debt-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'apps/example'), { recursive: true });
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({ include: ['apps/**/*.ts'], compilerOptions: { strict: true } }),
  );
  const path = join(root, 'apps/example/index.ts');
  writeFileSync(path, `export const fixture = '// @ts-nocheck';\nexport const x: unknown = 1;`);
  const baseline = measureDebt(root);
  assert.equal(baseline.totals['ts-nocheck'] ?? 0, 0);
  writeFileSync(path, `// @ts-nocheck\nexport const x: any = 1;`);
  assert.equal(debtRegressions(baseline, measureDebt(root)).length, 2);
  assert.equal(debtRegressions(measureDebt(root), baseline).length, 0);
});
test('S01 inventory: committed entries have unique IDs, explicit test gaps and no invented production acceptance', () => {
  const matrix = JSON.parse(readFileSync('docs/production/feature-matrix.json', 'utf8')) as {
    entries: Feature[];
    diagnostics: string[];
  };
  assert.deepEqual(matrix.diagnostics, []);
  assert.ok(matrix.entries.length > 0);
  assert.equal(new Set(matrix.entries.map((item) => item.id)).size, matrix.entries.length);
  for (const item of matrix.entries) {
    assert.ok(item.owner && /^S\d{2}$/.test(item.targetSprint), item.id);
    assert.equal(item.tests.evidence, 'not-measured');
    assert.ok(
      item.tests.required.contract && item.tests.required.integration && item.tests.required.e2e,
    );
    if (item.presentationOnly.verified) assert.ok(item.presentationOnly.rationale);
    if (item.mode === 'demo') assert.equal(item.status, 'demo-only-needs-server-migration');
  }
});
test('S01 inventory: source manifest hashes expose changed source even outside recognized syntax', () => {
  const value = JSON.parse(readFileSync('docs/production/architecture-inventory.json', 'utf8')) as {
    sourceManifest: { path: string; sha256: string }[];
  };
  for (const entry of value.sourceManifest)
    assert.equal(
      digest(readFileSync(entry.path, 'utf8').replace(/\r\n/g, '\n')),
      entry.sha256,
      entry.path,
    );
});

test('S01 debt: interpolated template text and regex literals cannot invent comment directives', (t) => {
  const root = mkdtempSync(join(tmpdir(), 's01-debt-template-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'apps/example'), { recursive: true });
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ include: ['apps/**/*.ts'] }));
  const path = join(root, 'apps/example/index.ts');
  writeFileSync(
    path,
    [
      'const x = 1;',
      'const content = `head ${x} // @ts-nocheck',
      'tail`;',
      'const pattern = /@ts-ignore/;',
      'const commentText = "/* @ts-expect-error */";',
    ].join('\n'),
  );
  assert.equal(measureDebt(root).totals['ts-nocheck'] ?? 0, 0);
  assert.equal(measureDebt(root).totals['ts-ignore'] ?? 0, 0);
  assert.equal(measureDebt(root).totals['ts-expect-error'] ?? 0, 0);
  writeFileSync(path, 'const x = 1; const content = `head ${/* @ts-ignore */ x} tail`;');
  assert.equal(measureDebt(root).totals['ts-ignore'], 1);
});

test('S01 debt: new uncovered workflows or lost test kinds regress even if another gap is removed', () => {
  const baseline = [{ id: 'old', missingTestKinds: ['e2e'] }];
  assert.deepEqual(workflowGapRegressions(baseline, []), []);
  assert.equal(
    workflowGapRegressions(baseline, [{ id: 'new', missingTestKinds: ['e2e'] }]).length,
    1,
  );
  assert.equal(
    workflowGapRegressions(baseline, [{ id: 'old', missingTestKinds: ['e2e', 'contract'] }]).length,
    1,
  );
});
test('S01 inventory: frozen parity omissions remain explicit instead of treating old counts as exhaustive', () => {
  const gaps = JSON.parse(readFileSync('docs/production/coverage-gaps.json', 'utf8')) as {
    frozenParity: { missingCurrentRoutes: { app: string; route: string }[] };
    instrumentedCoverage: unknown;
  };
  assert.equal(gaps.instrumentedCoverage, null);
  for (const entry of gaps.frozenParity.missingCurrentRoutes) assert.ok(entry.app && entry.route);
  const matrix = JSON.parse(readFileSync('docs/production/feature-matrix.json', 'utf8')) as {
    entries: Feature[];
  };
  const catalog = JSON.parse(readFileSync('docs/production/test-catalog.json', 'utf8')) as {
    tests: { id: string }[];
  };
  const known = new Set(catalog.tests.map((test) => test.id));
  for (const entry of matrix.entries)
    for (const kind of ['contract', 'integration', 'e2e'] as const)
      for (const id of entry.tests[kind]) assert.ok(known.has(id), `${entry.id}: ${id}`);
});

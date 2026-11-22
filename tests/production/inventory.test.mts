import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { workspace, roots } from '../../tooling/production/source.mts';
import { runtimeRegistrations } from '../../tooling/production/runtime.mts';
import { discover } from '../../tooling/production/discover.mts';
import {
  validateInventory,
  qualityBaseline,
  qualityRegressions,
} from '../../tooling/production/inventory.mts';
import { measureDebt, debtRegressions } from '../../tooling/production/debt.mts';
import type { Inventory, RuntimeRegistration } from '../../tooling/production/model.mts';
const current = async (): Promise<Inventory> =>
  JSON.parse(await readFile('docs/production/feature-matrix.json', 'utf8')) as Inventory;

test('committed inventory has complete IDs, test references, source fingerprints and bidirectional registration coverage', async () => {
  const inventory = await current();
  assert.deepEqual(validateInventory(inventory), []);
  assert.ok(inventory.features.some((row) => row.mode === 'demo'));
  for (const app of ['admin', 'client', 'rep'])
    assert.ok(
      inventory.features.some(
        (row) => row.kind === 'route' && row.mode === 'server' && row.apps.includes(app),
      ),
    );
  for (const kind of [
    'form',
    'handler',
    'search-filter',
    'export',
    'background-job',
    'permission',
    'configuration',
    'failure-state',
    'account-lifecycle',
  ])
    assert.ok(
      inventory.features.some((row) => row.kind === kind),
      kind,
    );
});
test('actual Fastify registrations and documented business operations agree in both directions', async () => {
  const ws = await workspace(process.cwd());
  const registrations = await runtimeRegistrations(ws);
  const docs = JSON.parse(
    await readFile('packages/contracts/route-inventory.json', 'utf8'),
  ) as Array<{ service: string; method: string; servicePath: string }>;
  const normalize = (path: string) => path.replace(/\{([^}]+)\}/g, ':$1');
  const actual = registrations
    .filter(
      (row) =>
        row.kind === 'api-route' &&
        row.owner !== 'api-gateway' &&
        !row.automatic &&
        row.path?.startsWith('/v1/'),
    )
    .map((row) => `${row.owner} ${row.method} ${row.path}`)
    .sort();
  const declared = docs
    .map((row) => `${row.service} ${row.method} ${normalize(row.servicePath)}`)
    .sort();
  assert.deepEqual(
    actual,
    declared,
    'An undocumented runtime endpoint must fail, not silently disappear from an old inventory',
  );
  const stored = (await current()).runtimeRegistrations.filter(
    (row) => !(row.owner === 'rep' && row.mode === 'server'),
  );
  assert.deepEqual(registrations, stored, 'Actual runtime registration drift');
});
test('inventory validator detects new, removed, duplicate and stale registrations instead of accepting historical counts', async () => {
  const baseline = await current();
  const extra: RuntimeRegistration = {
    owner: 'admin',
    mode: 'demo',
    kind: 'action',
    key: 'future-uncatalogued-action',
  };
  const added = structuredClone(baseline);
  added.runtimeRegistrations.push(extra);
  assert.match(validateInventory(added).join('\n'), /Uninventoried/);
  const removed = structuredClone(baseline);
  removed.runtimeRegistrations.pop();
  assert.match(validateInventory(removed).join('\n'), /Stale registration/);
  const duplicate = structuredClone(baseline);
  const first = duplicate.features[0];
  assert.ok(first);
  duplicate.features.push(first);
  assert.match(validateInventory(duplicate).join('\n'), /Duplicate/);
  const stale = structuredClone(baseline);
  stale.sourceDigest = '0'.repeat(64);
  assert.match(validateInventory(stale).join('\n'), /digest mismatch/);
});
test('presentation-only exceptions require a matching source fingerprint and reason', async () => {
  const inventory = await current();
  const presentation = inventory.features.find((row) => row.presentationOnly);
  assert.ok(presentation?.presentationOnly);
  presentation.presentationOnly.reviewedSourceFingerprint = '0'.repeat(64);
  assert.match(validateInventory(inventory).join('\n'), /Unbound presentation/);
});
async function fixture(source: string): Promise<{ root: string; dispose: () => Promise<void> }> {
  const root = await mkdtemp(resolve(tmpdir(), 's01-inventory-test-'));
  await Promise.all(roots.map((name) => mkdir(resolve(root, name), { recursive: true })));
  await mkdir(resolve(root, 'apps/admin-web/src'), { recursive: true });
  await writeFile(resolve(root, 'apps/admin-web/src/app.ts'), source);
  return { root, dispose: () => rm(root, { recursive: true, force: true }) };
}
test('AST discovery captures a new form, event handler, permission, search, export, job, configuration and failure without changing a historical allowlist', async () => {
  const f = await fixture(`export function feature(context) {
    const html='<form data-submit="save-new"><input type="search" name="new-query"></form>';
    context.button.addEventListener('click',()=>context.api.mutate('POST','/v1/crm/new',{}));
    requireRole(context.principal,'admin');
    const rows=context.rows.filter(row=>row.active);
    downloadCsv(rows);setInterval(()=>refresh(),1000);
    const endpoint=process.env.NEW_ENDPOINT;
    try { throw new Error('unavailable'); } catch(error) { context.notice(error); }
    return {routes:{'new-screen':()=>html},actions:{'save-new':()=>{}}};
  }`);
  try {
    const inventory = await discover(await workspace(f.root), [
      { owner: 'admin', mode: 'demo', kind: 'route', key: 'new-screen' },
      { owner: 'admin', mode: 'demo', kind: 'action', key: 'save-new' },
    ]);
    assert.deepEqual(validateInventory(inventory), []);
    for (const kind of [
      'route',
      'action',
      'form',
      'handler',
      'permission',
      'search-filter',
      'export',
      'background-job',
      'configuration',
      'failure-state',
      'api-call',
    ])
      assert.ok(
        inventory.features.some((row) => row.kind === kind),
        kind,
      );
  } finally {
    await f.dispose();
  }
});
test('type debt counts real comments/AST types, not quoted directives; unrelated removals cannot buy a new suppression', async () => {
  const directive = ['//', '@ts-nocheck'].join(' ');
  const f = await fixture(`const sample='@ts-nocheck';\nexport const value=1;`);
  try {
    const clean = measureDebt(await workspace(f.root));
    assert.equal(clean.items.length, 0);
    await writeFile(
      resolve(f.root, 'apps/admin-web/src/app.ts'),
      directive + '\nexport const value=1;',
    );
    const first = measureDebt(await workspace(f.root));
    assert.equal(first.counts['@ts-nocheck'], 1);
    assert.equal(debtRegressions(clean, first).length, 1);
    await writeFile(
      resolve(f.root, 'apps/admin-web/src/app.ts'),
      directive + ' changed rationale\nexport const value=1;',
    );
    const moved = measureDebt(await workspace(f.root));
    assert.equal(moved.items.length, first.items.length);
    assert.equal(debtRegressions(first, moved).length, 1);
  } finally {
    await f.dispose();
  }
});
test('quality baseline rejects deleted tests/routes and new uncovered workflows', async () => {
  const baseline = qualityBaseline(await current());
  const changed = structuredClone(baseline);
  changed.registrationIds.pop();
  changed.testIds.pop();
  changed.uncoveredWorkflowIds.push('new-uncovered');
  const errors = qualityRegressions(baseline, changed);
  assert.ok(errors.some((value) => value.startsWith('Removed registered feature')));
  assert.ok(errors.some((value) => value.startsWith('Removed test catalog')));
  assert.ok(errors.some((value) => value.startsWith('New unmapped workflow')));
  assert.deepEqual(qualityRegressions(baseline, baseline), []);
});

test('source inventory includes every workflow regardless of bootstrap-like naming', async () => {
  const f = await fixture('export const value = 1;');
  try {
    const path = '.github/workflows/s01-bootstrap-unexpected.yml';
    await mkdir(resolve(f.root, '.github/workflows'), { recursive: true });
    await writeFile(resolve(f.root, path), 'name: Unexpected workflow\n');
    assert.ok((await workspace(f.root)).files.includes(path));
  } finally {
    await f.dispose();
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { ContractSnapshot, Entity } from '@elvorance/contracts';
import { MemoryRepository, envelope } from '@elvorance/service-kit';
import { consumeEvent, serviceBindings } from '@elvorance/events';
import { createApp, handleEvent } from '../../services/delivery/src/app.ts';
import { tables } from '../../services/delivery/src/infrastructure/migrations/001_initial.ts';
import { migrations } from '../../services/sales/src/infrastructure/migrations/001_initial.ts';
import { handleEvent as notify } from '../../services/communications/src/application/events.ts';
import { createApp as communicationsApp } from '../../services/communications/src/app.ts';
import { auth, call } from './helpers.ts';
import { verifySprint04 } from './sprint04-scenarios.ts';

test('service-request and region API: catalog, roles, tenant/owner isolation, cursor, version, idempotency, consent and CRM outage', (t) =>
  verifySprint04(t));

test('project/milestone metadata cannot mutate financial snapshots, progress or completed scope', async (t) => {
  const repo = new MemoryRepository('delivery', tables);
  const app = createApp({ repository: repo, auth });
  t.after(() => app.close());
  const snapshot: ContractSnapshot = {
    contractId: 'metadata-contract',
    quoteId: 'quote',
    visitId: 'visit',
    clientId: 'client-a',
    repId: 'rep-a',
    customerName: 'Synthetic customer',
    currency: 'SAR',
    totalMinor: 10000,
    terms: 'Agreed scope',
    items: [
      {
        serviceId: 'web',
        title: 'Website',
        quantity: 1,
        unitPriceMinor: 10000,
        deliverables: ['Website'],
        duration: 'Two weeks',
      },
    ],
    paymentPlan: [{ id: 'first', label: 'Full amount', amountMinor: 10000, dueOn: null }],
    approvedAt: new Date().toISOString(),
    approvedBy: 'client-a',
  };
  await consumeEvent(
    repo,
    'delivery',
    envelope('sales', 'tenant-a', 'contract.approved.v1', snapshot.contractId, 2, snapshot),
    handleEvent,
  );
  let project = (await call(app, 'GET', '/v1/projects', 'admin')).body.items[0];
  const patch = { expectedVersion: project.version, title: 'Revised planning title' };
  assert.equal(
    (await call(app, 'PATCH', `/v1/projects/${project.id}`, 'client', patch)).status,
    403,
  );
  assert.equal(
    (await call(app, 'PATCH', `/v1/projects/${project.id}`, 'outsider', patch)).status,
    404,
  );
  for (const change of [
    { progress: 100 },
    { status: 'completed' },
    { contractSnapshot: {} },
    { repId: 'forged' },
  ])
    assert.equal(
      (await call(app, 'PATCH', `/v1/projects/${project.id}`, 'admin', { ...patch, ...change }))
        .status,
      400,
    );
  const concurrent = await Promise.all(
    ['Title one', 'Title two'].map((title) =>
      call(app, 'PATCH', `/v1/projects/${project.id}`, 'delivery', { ...patch, title }),
    ),
  );
  assert.deepEqual(concurrent.map((row) => row.status).sort(), [200, 409]);
  project = (await call(app, 'GET', `/v1/projects/${project.id}`, 'admin')).body;
  assert.deepEqual(project.contractSnapshot, snapshot);
  assert.equal(project.progress, 0);
  project = (
    await call(app, 'POST', `/v1/projects/${project.id}/milestones`, 'delivery', {
      expectedVersion: project.version,
      title: 'Initial discovery',
      dueOn: null,
    })
  ).body;
  const milestoneId = project.milestones[0].id;
  const path = `/v1/projects/${project.id}/milestones/${milestoneId}`;
  const metadata = {
    expectedVersion: project.version,
    title: 'Detailed discovery',
    dueOn: '2027-02-15',
  };
  assert.equal(
    (await call(app, 'PATCH', path, 'delivery', { ...metadata, dueOn: '2027-02-30' })).status,
    400,
  );
  assert.equal(
    (await call(app, 'PATCH', path, 'delivery', { ...metadata, status: 'done' })).status,
    400,
  );
  project = (await call(app, 'PATCH', path, 'delivery', metadata, 's04-milestone-key')).body;
  assert.equal(project.milestones[0].dueOn, '2027-02-15');
  assert.equal(
    (await call(app, 'PATCH', path, 'delivery', metadata, 's04-milestone-key')).body.version,
    project.version,
  );
  for (const status of ['in_progress', 'done'])
    project = (
      await call(app, 'POST', path, 'delivery', { expectedVersion: project.version, status })
    ).body;
  assert.equal(
    (await call(app, 'PATCH', path, 'delivery', { ...metadata, expectedVersion: project.version }))
      .status,
    409,
  );
  await repo.transaction('tenant-a', async (tx) => {
    const value = await tx.get<Entity>('projects', project.id);
    assert.ok(value);
    await tx.replace('projects', { ...value, status: 'completed' }, value.version);
  });
  assert.equal(
    (
      await call(app, 'PATCH', `/v1/projects/${project.id}`, 'admin', {
        ...patch,
        expectedVersion: project.version + 1,
      })
    ).status,
    409,
  );
});

test('every statically emitted domain event has a durable consumer binding', async () => {
  const emitted = new Set<string>();
  async function scan(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const name = resolve(path, entry.name);
      if (entry.isDirectory()) await scan(name);
      else if (entry.name.endsWith('.ts'))
        for (const match of (await readFile(name, 'utf8')).matchAll(
          /\.emit\(\s*['"]([^'"]+)['"]/g,
        )) {
          assert.ok(match[1]);
          emitted.add(match[1]);
        }
    }
  }
  await scan(resolve('services'));
  assert.ok(emitted.size >= 20, 'The scanner must actually inspect the service implementations');
  const bound = new Set(Object.values(serviceBindings).flat());
  assert.deepEqual(
    [...emitted].filter((type) => !bound.has(type)),
    [],
    'Mandatory publishers must not strand events without consumers',
  );
});

test('new staff-only notifications never expose internal discovery or task events to clients', async (t) => {
  const repo = new MemoryRepository('communications', ['notifications']);
  const app = communicationsApp({
    repository: repo,
    auth,
    customerDirectory: {
      async getCustomer() {
        throw new Error('Not used');
      },
    },
  });
  t.after(() => app.close());
  for (const type of [
    'crm.discovery_saved.v1',
    'crm.configuration_published.v1',
    'sales.visit_rescheduled.v1',
    'sales.visit_cancelled.v1',
    'sales.task_updated.v1',
    'sales.opportunity_updated.v1',
  ]) {
    const source = type.split('.')[0];
    assert.ok(source);
    await consumeEvent(
      repo,
      'communications',
      envelope(source, 'tenant-a', type, 'resource', 1, { clientId: 'client-a', repId: 'rep-a' }),
      notify,
    );
  }
  assert.equal((await call(app, 'GET', '/v1/notifications', 'client')).body.items.length, 0);
  assert.equal((await call(app, 'GET', '/v1/notifications', 'rep')).body.items.length, 6);
});

test('Sales migration 3 is additive, keeps old migration checksums and forces tenant RLS', () => {
  assert.equal(migrations.length, 3);
  const previous = migrations
    .slice(0, 2)
    .map((migration) => createHash('sha256').update(migration.sql).digest('hex'));
  assert.deepEqual(previous, LEGACY_MIGRATION_CHECKSUMS);
  const migration = migrations[2];
  assert.ok(migration);
  assert.equal(migration.version, 3);
  assert.match(migration.sql, /FORCE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration.sql, /DROP\s|ALTER\s+TABLE\s+(visits|quotes|contracts)\s/i);
});
const LEGACY_MIGRATION_CHECKSUMS = [
  '0a65ed83aebec669c4de92628296f7f936f8841aa41b632a300d65ee3b03daf3',
  '3c3ed1c5951e415d86890f67788c2cd890af9ed5e2f8e94572450497c628fab2',
];

import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { AppError, type Repository } from '@elvorance/service-kit';
import { repFixture } from './rep-fixture.ts';
import { call } from './helpers.ts';

/** Runs unchanged against memory and the seven separately owned PostgreSQL databases. */
export async function verifySprint04(
  t: TestContext,
  repositories?: {
    crm: Repository;
    sales: Repository;
    communications: Repository;
    identity: Repository;
  },
): Promise<void> {
  const f = await repFixture(t, repositories, 'sprint04-domain-tests');
  const input = {
    serviceId: 'web',
    catalogVersion: 1,
    currency: 'SAR',
    title: 'Customer portal request',
    brief: 'Provide an accessible portal for our customer support team.',
    budgetMinor: 25000,
    deadline: null,
  };
  const create = (body: unknown, role = 'client', key?: string) =>
    call(f.sales, 'POST', '/v1/service-requests', role, body, key);
  assert.equal((await create(input)).status, 409, 'No tenant catalog must fail closed');
  await f.publish();
  for (const role of ['rep', 'admin', 'support', 'finance'])
    assert.equal((await create(input, role)).status, 403);
  for (const change of [
    { clientId: 'forged' },
    { repId: 'forged' },
    { tenantId: 'forged' },
    { status: 'accepted' },
    { serviceId: 'absent' },
    { budgetMinor: -1 },
    { deadline: '2026-02-30' },
  ])
    assert.equal((await create({ ...input, ...change })).status, 400);
  assert.equal((await create({ ...input, catalogVersion: 999 })).status, 409);
  const created = await Promise.all([
    create(input, 'client', 's04-create-key-001'),
    create(input, 'client', 's04-create-key-001'),
  ]);
  assert.deepEqual(
    created.map((row) => row.status),
    [200, 200],
  );
  assert.ok(created[0]);
  assert.ok(created[1]);
  const first = created[0].body;
  assert.equal(first.id, created[1].body.id);
  assert.equal(first.clientId, f.customer.id);
  assert.equal(first.repId, 'rep-a');
  assert.equal(
    (await create({ ...input, title: 'Conflicting content' }, 'client', 's04-create-key-001'))
      .status,
    409,
  );
  for (const role of ['otherClient', 'otherRep', 'outsider'])
    assert.equal(
      (await call(f.sales, 'GET', `/v1/service-requests/${first.id}`, role)).status,
      404,
    );
  assert.equal(
    (await call(f.sales, 'GET', `/v1/service-requests/${first.id}`, 'support')).status,
    403,
  );
  const second = (await create({ ...input, title: 'A second customer request' })).body;
  const firstPage = await call(f.sales, 'GET', '/v1/service-requests?limit=1', 'client');
  assert.equal(firstPage.body.items.length, 1);
  assert.ok(firstPage.body.nextCursor);
  const secondPage = await call(
    f.sales,
    'GET',
    `/v1/service-requests?limit=1&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`,
    'client',
  );
  assert.equal(secondPage.body.items.length, 1);
  assert.notEqual(firstPage.body.items[0].id, secondPage.body.items[0].id);
  assert.equal(secondPage.body.nextCursor, null);
  assert.equal(
    (await call(f.sales, 'GET', '/v1/service-requests', 'outsider')).body.items.length,
    0,
  );
  const review = (body: unknown, role = 'rep', key?: string) =>
    call(f.sales, 'POST', `/v1/service-requests/${first.id}/review`, role, body, key);
  const decision = {
    expectedVersion: first.version,
    decision: 'accepted',
    note: 'Agreed to qualify the requested service.',
  };
  assert.equal((await review(decision, 'client')).status, 403);
  assert.equal((await review(decision, 'otherRep')).status, 404);
  assert.equal((await review({ ...decision, expectedVersion: 999 })).status, 409);
  assert.equal(
    (await call(f.sales, 'GET', '/v1/opportunities', 'rep')).body.items.length,
    0,
    'A stale request must roll back its attempted opportunity insert',
  );
  const accepted = await review(decision, 'rep', 's04-accept-key-001');
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.ok(accepted.body.opportunityId);
  assert.equal(
    (await review(decision, 'rep', 's04-accept-key-001')).body.opportunityId,
    accepted.body.opportunityId,
  );
  assert.equal((await call(f.sales, 'GET', '/v1/opportunities', 'rep')).body.items.length, 1);
  assert.equal(
    (
      await call(f.sales, 'POST', `/v1/service-requests/${first.id}/cancel`, 'client', {
        expectedVersion: accepted.body.version,
      })
    ).status,
    409,
  );
  const cancel = { expectedVersion: second.version };
  assert.equal(
    (
      await call(
        f.sales,
        'POST',
        `/v1/service-requests/${second.id}/cancel`,
        'client',
        cancel,
        's04-cancel-key-001',
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        f.sales,
        'POST',
        `/v1/service-requests/${second.id}/cancel`,
        'client',
        cancel,
        's04-cancel-key-001',
      )
    ).body.status,
    'cancelled',
  );
  assert.equal(
    (await call(f.sales, 'POST', `/v1/service-requests/${second.id}/review`, 'rep', decision))
      .status,
    409,
  );

  const optedOut = await call(f.crm, 'PATCH', `/v1/customers/${f.customer.id}`, 'admin', {
    expectedVersion: f.customer.version,
    doNotContact: true,
  });
  assert.equal(optedOut.status, 200);
  const inbound = await create(input);
  assert.equal(inbound.status, 200, 'Inbound request does not silently reverse contact preference');
  assert.equal(
    (await call(f.sales, 'POST', `/v1/service-requests/${inbound.body.id}/review`, 'rep', decision))
      .status,
    409,
  );
  assert.equal((await call(f.sales, 'GET', '/v1/opportunities', 'rep')).body.items.length, 1);
  assert.equal(
    (await call(f.crm, 'GET', `/v1/customers/${f.customer.id}`, 'client')).body.doNotContact,
    true,
  );
  const savedDirectory = f.directory.getCustomer;
  f.directory.getCustomer = async () => {
    throw new AppError(503, 'UPSTREAM_UNAVAILABLE', 'Test-only CRM outage');
  };
  assert.equal(
    (await call(f.sales, 'GET', `/v1/service-requests/${inbound.body.id}`, 'rep')).status,
    503,
  );
  f.directory.getCustomer = savedDirectory;
  const moved = await call(f.crm, 'PATCH', `/v1/customers/${f.customer.id}`, 'admin', {
    expectedVersion: optedOut.body.version,
    repId: 'rep-b',
  });
  assert.equal(moved.status, 200);
  assert.equal(
    (await review(decision, 'rep', 's04-accept-key-001')).status,
    404,
    'Cached command results must recheck current CRM ownership',
  );
  assert.equal((await call(f.sales, 'GET', '/v1/service-requests', 'rep')).body.items.length, 0);
  const reassigned = await call(
    f.sales,
    'POST',
    `/v1/service-requests/${inbound.body.id}/review`,
    'admin',
    {
      expectedVersion: inbound.body.version,
      decision: 'in_review',
      note: 'Reviewed current CRM assignment.',
    },
  );
  assert.equal(reassigned.status, 200);
  assert.equal(reassigned.body.repId, 'rep-b');
  assert.equal(
    (await call(f.sales, 'GET', `/v1/service-requests/${inbound.body.id}`, 'otherRep')).status,
    200,
  );

  const region = (
    await call(f.crm, 'POST', '/v1/regions', 'admin', { name: 'North district', code: 'N' })
  ).body;
  const patch = { expectedVersion: region.version, name: 'Northern district', active: false };
  assert.equal((await call(f.crm, 'PATCH', `/v1/regions/${region.id}`, 'rep', patch)).status, 403);
  assert.equal(
    (await call(f.crm, 'PATCH', `/v1/regions/${region.id}`, 'outsider', patch)).status,
    404,
  );
  assert.equal(
    (
      await call(f.crm, 'PATCH', `/v1/regions/${region.id}`, 'admin', {
        ...patch,
        tenantId: 'forged',
      })
    ).status,
    400,
  );
  assert.equal(
    (await call(f.crm, 'PATCH', `/v1/regions/${region.id}`, 'admin', patch, 's04-region-key-001'))
      .status,
    200,
  );
  assert.equal(
    (await call(f.crm, 'PATCH', `/v1/regions/${region.id}`, 'admin', patch, 's04-region-key-001'))
      .body.version,
    2,
  );
  assert.equal(
    (await call(f.crm, 'PATCH', `/v1/regions/${region.id}`, 'admin', patch)).status,
    409,
  );
  assert.equal(
    (
      await call(f.crm, 'POST', '/v1/customers', 'rep', {
        name: 'No new inactive-region assignment',
        regionId: region.id,
      })
    ).status,
    400,
  );
}

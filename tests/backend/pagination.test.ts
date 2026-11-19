import test from 'node:test';
import assert from 'node:assert/strict';
import { call } from './helpers.ts';
import { repFixture } from './rep-fixture.ts';

test('authorization is applied before the page limit and later pages remain reachable beyond 1000 tenant records', async (t) => {
  const f = await repFixture(t);
  await f.crmRepository.transaction('tenant-a', async (tx) => {
    for (let i = 0; i < 1005; i++)
      await tx.insert('customers', {
        id: `a-foreign-${String(i).padStart(4, '0')}`,
        name: 'Another representative customer',
        repId: 'rep-b',
      });
    for (let i = 0; i < 5; i++)
      await tx.insert('customers', { id: `z-owned-${i}`, name: 'Owned customer', repId: 'rep-a' });
  });
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const result = await call(
      f.crm,
      'GET',
      `/v1/customers?limit=2${cursor ? `&cursor=${cursor}` : ''}`,
      'rep',
    );
    assert.equal(result.status, 200);
    assert.ok(result.body.items.length <= 2);
    assert.ok(result.body.items.every((row: { repId: string }) => row.repId === 'rep-a'));
    ids.push(...result.body.items.map((row: { id: string }) => row.id));
    cursor = result.body.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 6);
  assert.equal(new Set(ids).size, 6);
  assert.equal((await call(f.crm, 'GET', '/v1/customers', 'client')).body.items.length, 1);
  assert.equal((await call(f.crm, 'GET', '/v1/customers', 'outsider')).body.items.length, 0);
  assert.equal((await call(f.crm, 'GET', '/v1/customers?limit=201', 'rep')).status, 400);
  assert.equal((await call(f.crm, 'GET', '/v1/customers?cursor=%27OR%201%3D1', 'rep')).status, 400);
});

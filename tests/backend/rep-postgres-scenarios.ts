import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { Repository } from '@elvorance/service-kit';
import { repFixture } from './rep-fixture.ts';
import { call } from './helpers.ts';

/** Same HTTP handlers and migrations as production, backed by separate service databases. */
export async function verifyRepPostgres(
  t: TestContext,
  repositories: {
    crm: Repository;
    sales: Repository;
    communications: Repository;
    identity: Repository;
  },
): Promise<void> {
  const tenantId = 'rep-postgres-workflow';
  const f = await repFixture(t, repositories, tenantId);
  const config = await f.publish();
  const discovery = await call(f.crm, 'PUT', `/v1/customers/${f.customer.id}/discovery`, 'rep', {
    expectedVersion: 0,
    configurationRevision: config.definition.revision,
    activityId: 'services',
    status: 'submitted',
    answers: { need: 'A durable customer portal' },
  });
  assert.equal(discovery.status, 200, JSON.stringify(discovery.body));
  assert.equal(
    (
      await call(f.identity, 'PATCH', '/v1/me/profile', 'rep', {
        expectedVersion: 0,
        displayName: 'PostgreSQL Representative',
        locale: 'ar',
        timeZone: 'Asia/Riyadh',
      })
    ).status,
    200,
  );
  const taskInput = {
    clientId: f.customer.id,
    title: 'Follow up after PostgreSQL visit',
    dueOn: '2027-01-05',
  };
  const tasks = await Promise.all([
    call(f.sales, 'POST', '/v1/tasks', 'rep', taskInput, 'pg-new-task-idempotent'),
    call(f.sales, 'POST', '/v1/tasks', 'rep', taskInput, 'pg-new-task-idempotent'),
  ]);
  assert.deepEqual(
    tasks.map((result) => result.status),
    [200, 200],
  );
  assert.equal(tasks[0]!.body.id, tasks[1]!.body.id);
  const task = tasks[0]!.body;
  const updates = await Promise.all([
    call(f.sales, 'PATCH', `/v1/tasks/${task.id}`, 'rep', {
      expectedVersion: task.version,
      status: 'done',
    }),
    call(f.sales, 'PATCH', `/v1/tasks/${task.id}`, 'rep', {
      expectedVersion: task.version,
      status: 'cancelled',
    }),
  ]);
  assert.deepEqual(updates.map((result) => result.status).sort(), [200, 409]);
  assert.equal(
    (
      await call(f.sales, 'POST', '/v1/opportunities', 'rep', {
        clientId: f.customer.id,
        title: 'Database-backed opportunity',
        valueMinor: 10000,
        currency: 'SAR',
      })
    ).status,
    200,
  );
  const visit = await f.start();
  const route = await call(f.sales, 'POST', '/v1/routes', 'rep', {
    name: 'Database-backed visit route',
    date: visit.scheduledAt.slice(0, 10),
    visitIds: [visit.id],
  });
  assert.equal(route.status, 200);
  const quote = await call(f.sales, 'POST', '/v1/quotes', 'rep', f.quoteInput(visit.id, 2000));
  assert.equal(quote.status, 200, JSON.stringify(quote.body));
  const approvalInput = {
    expectedVersion: quote.body.version,
    reason: 'PostgreSQL transactional approval request',
  };
  const requests = await Promise.all([
    call(f.sales, 'POST', `/v1/quotes/${quote.body.id}/discount-approval`, 'rep', approvalInput),
    call(f.sales, 'POST', `/v1/quotes/${quote.body.id}/discount-approval`, 'rep', approvalInput),
  ]);
  assert.equal(requests[0]!.body.id, requests[1]!.body.id);
  const approval = requests[0]!.body;
  assert.equal(
    (
      await call(f.sales, 'POST', `/v1/quote-discount-approvals/${approval.id}/decision`, 'admin', {
        expectedVersion: approval.version,
        decision: 'approved',
        note: 'Approved for PostgreSQL evidence',
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(f.sales, 'POST', `/v1/quotes/${quote.body.id}/send`, 'rep', {
        expectedVersion: quote.body.version,
      })
    ).status,
    200,
  );
  let conversation = (
    await call(f.communications, 'POST', '/v1/conversations', 'rep', { clientId: f.customer.id })
  ).body;
  const path = `/v1/conversations/${conversation.id}/messages`;
  const simultaneous = await Promise.all([
    call(f.communications, 'POST', path, 'rep', {
      expectedVersion: conversation.version,
      body: 'First concurrent message',
    }),
    call(f.communications, 'POST', path, 'client', {
      expectedVersion: conversation.version,
      body: 'Second concurrent message',
    }),
  ]);
  assert.deepEqual(simultaneous.map((result) => result.status).sort(), [200, 409]);
  conversation = simultaneous.find((result) => result.status === 200)!.body.conversation;
  const message = await call(f.communications, 'POST', path, 'client', {
    expectedVersion: conversation.version,
    body: 'Client asks for agreed scope',
  });
  assert.equal(message.status, 200);
  const first = (await call(f.communications, 'GET', `${path}?limit=1`, 'rep')).body;
  const second = (
    await call(f.communications, 'GET', `${path}?limit=1&cursor=${first.nextCursor}`, 'rep')
  ).body;
  assert.equal(first.items[0].sequence, 1);
  assert.equal(second.items[0].sequence, 2);
  assert.equal(second.nextCursor, null);
  assert.equal(
    (
      await call(f.communications, 'POST', `/v1/conversations/${conversation.id}/read`, 'rep', {
        expectedVersion: message.body.conversation.version,
        lastMessageId: message.body.message.id,
      })
    ).status,
    200,
  );
  for (const [repository, table, expected] of [
    [repositories.crm, 'discoveries', 1],
    [repositories.identity, 'user_profiles', 1],
    [repositories.sales, 'tasks', 1],
    [repositories.sales, 'opportunities', 1],
    [repositories.sales, 'visit_routes', 1],
    [repositories.sales, 'discount_approvals', 1],
    [repositories.communications, 'conversations', 1],
    [repositories.communications, 'conversation_messages', 2],
    [repositories.communications, 'conversation_reads', 1],
  ] as const) {
    assert.equal(
      (await repository.transaction(tenantId, (tx) => tx.list(table))).length,
      expected,
      `Persisted ${repository.serviceName}.${table}`,
    );
    assert.equal(
      (await repository.transaction('another-tenant', (tx) => tx.list(table))).length,
      0,
      `Tenant isolation for ${table}`,
    );
  }
  await repositories.crm.transaction(tenantId, async (tx) => {
    for (let i = 0; i < 1005; i++)
      await tx.insert('customers', {
        id: `a-foreign-${String(i).padStart(4, '0')}`,
        name: 'Other representative row',
        repId: 'rep-b',
      });
    for (let i = 0; i < 3; i++)
      await tx.insert('customers', {
        id: `z-owned-${i}`,
        name: 'Own customer row',
        repId: 'rep-a',
      });
  });
  const customerIds: string[] = [];
  let cursor: string | null = null;
  do {
    const page: { items: { id: string; repId: string }[]; nextCursor: string | null } = (
      await call(f.crm, 'GET', `/v1/customers?limit=2${cursor ? `&cursor=${cursor}` : ''}`, 'rep')
    ).body as { items: { id: string; repId: string }[]; nextCursor: string | null };
    assert.ok(page.items.every((row: { repId: string }) => row.repId === 'rep-a'));
    customerIds.push(...page.items.map((row: { id: string }) => row.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(customerIds.length, 4);
  assert.equal(new Set(customerIds).size, 4);
  assert.equal((await call(f.crm, 'GET', '/v1/customers', 'client')).body.items.length, 1);
  t.diagnostic(
    'New rep domains verified in PostgreSQL: profiles, discovery, tasks, opportunities, routes, immutable-price discounts and conversation messages/receipts; concurrent writes and pagination exercised.',
  );
}

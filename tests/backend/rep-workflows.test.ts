import test from 'node:test';
import assert from 'node:assert/strict';
import { call } from './helpers.ts';
import { repFixture } from './rep-fixture.ts';

test('rep tasks enforce tenant, assignment, idempotency, versions and current ownership on replay', async (t) => {
  const f = await repFixture(t);
  const input = {
    title: 'Follow up on requirements',
    clientId: f.customer.id,
    dueOn: '2027-01-05',
    priority: 'high',
    notes: 'Ask for the scope details',
  };
  const key = 'rep-task-create-idempotent';
  const first = await call(f.sales, 'POST', '/v1/tasks', 'rep', input, key);
  assert.equal(first.status, 200);
  assert.equal(
    (await call(f.sales, 'POST', '/v1/tasks', 'rep', input, key)).body.id,
    first.body.id,
  );
  assert.equal(
    (await call(f.sales, 'POST', '/v1/tasks', 'rep', { ...input, title: 'Changed content' }, key))
      .status,
    409,
  );
  for (const token of ['otherRep', 'outsider'])
    assert.equal((await call(f.sales, 'GET', `/v1/tasks/${first.body.id}`, token)).status, 404);
  assert.equal((await call(f.sales, 'POST', '/v1/tasks', 'client', input)).status, 403);
  const done = await call(f.sales, 'PATCH', `/v1/tasks/${first.body.id}`, 'rep', {
    expectedVersion: 1,
    status: 'done',
  });
  assert.equal(done.status, 200);
  assert.equal(done.body.status, 'done');
  assert.ok(done.body.completedAt);
  assert.equal(
    (
      await call(f.sales, 'PATCH', `/v1/tasks/${first.body.id}`, 'rep', {
        expectedVersion: 1,
        status: 'open',
      })
    ).status,
    409,
  );
  await call(f.crm, 'PATCH', `/v1/customers/${f.customer.id}`, 'admin', {
    expectedVersion: 1,
    repId: 'rep-b',
  });
  assert.equal((await call(f.sales, 'POST', '/v1/tasks', 'rep', input, key)).status, 404);
  assert.deepEqual((await call(f.sales, 'GET', '/v1/tasks', 'rep')).body.items, []);
});

test('opportunities derive won value from an approved contract and reject fabricated sales', async (t) => {
  const f = await repFixture(t);
  const created = await call(f.sales, 'POST', '/v1/opportunities', 'rep', {
    clientId: f.customer.id,
    title: 'Website opportunity',
    stage: 'qualified',
    valueMinor: 15000,
    currency: 'SAR',
    expectedCloseOn: null,
  });
  assert.equal(created.status, 200);
  assert.equal(
    (
      await call(f.sales, 'PATCH', `/v1/opportunities/${created.body.id}`, 'rep', {
        expectedVersion: 1,
        stage: 'won',
      })
    ).status,
    409,
  );
  await f.publish();
  const visit = await f.start();
  const draft = (await call(f.sales, 'POST', '/v1/quotes', 'rep', f.quoteInput(visit.id))).body;
  const sent = (
    await call(f.sales, 'POST', `/v1/quotes/${draft.id}/send`, 'rep', {
      expectedVersion: draft.version,
    })
  ).body;
  const acceptance = await call(f.sales, 'POST', `/v1/quotes/${draft.id}/accept`, 'client', {
    expectedVersion: sent.version,
    consent: true,
  });
  assert.equal(acceptance.status, 200, JSON.stringify(acceptance.body));
  const contract = acceptance.body.contract;
  assert.equal(
    (
      await call(f.sales, 'PATCH', `/v1/opportunities/${created.body.id}`, 'rep', {
        expectedVersion: 1,
        stage: 'won',
        contractId: contract.id,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(f.sales, 'POST', `/v1/contracts/${contract.id}/approve`, 'client', {
        expectedVersion: contract.version,
        consent: true,
        signerName: 'Customer Signer',
      })
    ).status,
    200,
  );
  const won = await call(f.sales, 'PATCH', `/v1/opportunities/${created.body.id}`, 'rep', {
    expectedVersion: 1,
    stage: 'won',
    contractId: contract.id,
    valueMinor: 990000,
  });
  assert.equal(won.status, 200);
  assert.equal(won.body.valueMinor, 10000);
  assert.equal(
    (
      await call(f.sales, 'PATCH', `/v1/opportunities/${created.body.id}`, 'rep', {
        expectedVersion: won.body.version,
        stage: 'new',
        contractId: null,
      })
    ).status,
    409,
  );
});

test('planned routes persist stop order and cannot complete while a visit remains open', async (t) => {
  const f = await repFixture(t);
  const first = await f.schedule();
  const second = await f.schedule();
  const input = {
    name: 'Morning customer route',
    date: first.scheduledAt.slice(0, 10),
    visitIds: [second.id, first.id],
  };
  const result = await call(f.sales, 'POST', '/v1/routes', 'rep', input);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual(result.body.visitIds, input.visitIds);
  assert.equal((await call(f.sales, 'POST', '/v1/routes', 'rep', input)).status, 409);
  assert.equal(
    (
      await call(f.sales, 'PATCH', `/v1/routes/${result.body.id}`, 'rep', {
        expectedVersion: 1,
        status: 'completed',
      })
    ).status,
    409,
  );
  for (const visit of [first, second])
    assert.equal(
      (
        await call(f.sales, 'POST', `/v1/visits/${visit.id}/cancel`, 'rep', {
          expectedVersion: visit.version,
          reason: 'Customer requested postponement',
        })
      ).status,
      200,
    );
  const completed = await call(f.sales, 'PATCH', `/v1/routes/${result.body.id}`, 'rep', {
    expectedVersion: 1,
    status: 'completed',
  });
  assert.equal(completed.status, 200);
  assert.equal(
    (
      await call(f.sales, 'PATCH', `/v1/routes/${result.body.id}`, 'rep', {
        expectedVersion: completed.body.version,
        status: 'active',
      })
    ).status,
    409,
  );
});

test('visits support scheduling and declared outcomes without inferring acceptance', async (t) => {
  const f = await repFixture(t);
  const scheduled = await f.schedule();
  const updated = await call(f.sales, 'PATCH', `/v1/visits/${scheduled.id}`, 'rep', {
    expectedVersion: 1,
    purpose: 'Updated discovery appointment',
    scheduledAt: new Date().toISOString(),
  });
  assert.equal(updated.status, 200);
  const active = await call(f.sales, 'POST', `/v1/visits/${scheduled.id}/start`, 'rep', {
    expectedVersion: updated.body.version,
    proof: { kind: 'manual', reason: 'Reception confirmed attendance' },
  });
  assert.equal(active.status, 200);
  const complete = await call(f.sales, 'POST', `/v1/visits/${scheduled.id}/complete`, 'rep', {
    expectedVersion: active.body.version,
    outcome: 'ready_to_contract',
    notes: 'Customer would like a proposal',
    nextStep: 'Prepare the commercial offer',
  });
  assert.equal(complete.status, 200);
  assert.deepEqual(complete.body.agreementSnapshot.quotes, []);
  assert.deepEqual(complete.body.agreementSnapshot.contracts, []);
});

test('discovery validates published schema, answer types, version conflicts and customer scope', async (t) => {
  const f = await repFixture(t);
  assert.deepEqual((await call(f.crm, 'GET', '/v1/catalog', 'rep')).body.items, []);
  const base = {
    expectedVersion: 0,
    configurationRevision: 1,
    activityId: 'services',
    answers: {},
    status: 'draft',
    notes: '',
  };
  const path = `/v1/customers/${f.customer.id}/discovery`;
  assert.equal((await call(f.crm, 'PUT', path, 'rep', base)).status, 409);
  const config = await f.publish();
  const catalog = (await call(f.crm, 'GET', '/v1/catalog', 'rep')).body;
  assert.equal(catalog.configured, true);
  assert.equal(catalog.items[0].unitPriceMinor, 10000);
  assert.equal(
    (await call(f.crm, 'PUT', path, 'rep', { ...base, status: 'submitted' })).status,
    400,
  );
  assert.equal(
    (
      await call(f.crm, 'PUT', path, 'rep', {
        ...base,
        answers: { unknown: 'inject an unknown field' },
      })
    ).status,
    400,
  );
  assert.equal(
    (await call(f.crm, 'PUT', path, 'rep', { ...base, answers: { need: ['wrong type'] } })).status,
    400,
  );
  const saved = await call(f.crm, 'PUT', path, 'rep', {
    ...base,
    configurationRevision: config.definition.revision,
    answers: { need: 'A maintained company website' },
    status: 'submitted',
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal((await call(f.crm, 'GET', path, 'rep')).body.record.id, saved.body.id);
  assert.equal((await call(f.crm, 'PUT', path, 'rep', base)).status, 409);
  assert.equal((await call(f.crm, 'GET', path, 'otherRep')).status, 404);
  assert.equal((await call(f.crm, 'GET', path, 'client')).status, 403);
});

test('profile editing never grants access claims and private customer fields stay internal', async (t) => {
  const f = await repFixture(t);
  const profile = await call(f.identity, 'PATCH', '/v1/me/profile', 'rep', {
    expectedVersion: 0,
    displayName: 'Representative Name',
    phone: '+966500000000',
    locale: 'ar',
    timeZone: 'Asia/Riyadh',
  });
  assert.equal(profile.status, 200, JSON.stringify(profile.body));
  const me = (await call(f.identity, 'GET', '/v1/me', 'rep')).body;
  assert.equal(me.profile.displayName, 'Representative Name');
  assert.deepEqual(me.principal.roles, ['rep']);
  assert.equal(
    (
      await call(f.identity, 'PATCH', '/v1/me/profile', 'rep', {
        expectedVersion: 1,
        roles: ['admin'],
        displayName: 'Forged admin',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(f.identity, 'PATCH', '/v1/me/profile', 'rep', {
        expectedVersion: 0,
        displayName: 'Stale edit',
      })
    ).status,
    409,
  );
  assert.equal((await call(f.identity, 'GET', '/v1/me', 'otherRep')).body.profile, null);
  const customer = (await call(f.crm, 'GET', `/v1/customers/${f.customer.id}`, 'client')).body;
  assert.equal(customer.notes, undefined);
  assert.equal(customer.city, 'Riyadh');
  assert.equal(
    (
      await call(f.crm, 'PATCH', `/v1/customers/${f.customer.id}`, 'client', {
        expectedVersion: 1,
        notes: 'Attempted sales note rewrite',
      })
    ).status,
    403,
  );
});

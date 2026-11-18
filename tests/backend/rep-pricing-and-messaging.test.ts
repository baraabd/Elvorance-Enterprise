import test from 'node:test';
import assert from 'node:assert/strict';
import { call } from './helpers.ts';
import { repFixture } from './rep-fixture.ts';

test('catalog authority prevents hiding discounts in unit prices and rejects foreign currencies', async (t) => {
  const f = await repFixture(t);
  const visit = await f.start();
  const base = f.quoteInput(visit.id);
  assert.equal((await call(f.sales, 'POST', '/v1/quotes', 'rep', base)).status, 409);
  await f.publish();
  const forged = {
    ...base,
    items: [{ ...base.items[0], unitPriceMinor: 100 }],
    paymentPlan: [{ id: 'first', label: 'Full amount', amountMinor: 100, dueOn: null }],
  };
  const rejected = await call(f.sales, 'POST', '/v1/quotes', 'rep', forged);
  assert.equal(rejected.status, 409);
  assert.equal(rejected.body.error.code, 'CATALOG_PRICE');
  assert.equal(
    (await call(f.sales, 'POST', '/v1/quotes', 'rep', { ...base, currency: 'USD' })).status,
    400,
  );
  assert.equal(
    (
      await call(f.sales, 'POST', '/v1/quotes', 'rep', {
        ...base,
        items: [{ ...base.items[0], serviceId: 'invented-service' }],
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(f.sales, 'POST', '/v1/quotes', 'rep', {
        ...base,
        paymentPlan: [
          { id: 'first', label: 'Tiny down payment', amountMinor: 1999, dueOn: null },
          { id: 'second', label: 'Remaining balance', amountMinor: 8001, dueOn: null },
        ],
      })
    ).status,
    400,
  );
});

test('large discounts need an administrator decision tied to exact content; later edits invalidate approval', async (t) => {
  const f = await repFixture(t);
  await f.publish();
  const visit = await f.start();
  const input = f.quoteInput(visit.id, 2000);
  let quote = (await call(f.sales, 'POST', '/v1/quotes', 'rep', input)).body;
  assert.equal(quote.totalMinor, 8000);
  assert.equal(
    (
      await call(f.sales, 'POST', `/v1/quotes/${quote.id}/send`, 'rep', {
        expectedVersion: quote.version,
      })
    ).body.error.code,
    'DISCOUNT_APPROVAL_REQUIRED',
  );
  let approval = (
    await call(f.sales, 'POST', `/v1/quotes/${quote.id}/discount-approval`, 'rep', {
      expectedVersion: quote.version,
      reason: 'Commercial retention exception requested',
    })
  ).body;
  assert.equal(approval.status, 'pending');
  assert.equal(
    (
      await call(f.sales, 'POST', `/v1/quote-discount-approvals/${approval.id}/decision`, 'rep', {
        expectedVersion: approval.version,
        decision: 'approved',
        note: 'I approve myself',
      })
    ).status,
    403,
  );
  approval = (
    await call(f.sales, 'POST', `/v1/quote-discount-approvals/${approval.id}/decision`, 'admin', {
      expectedVersion: approval.version,
      decision: 'approved',
      note: 'Approved for this scope only',
    })
  ).body;
  assert.equal(approval.status, 'approved');
  quote = (
    await call(f.sales, 'PATCH', `/v1/quotes/${quote.id}`, 'rep', {
      ...input,
      expectedVersion: quote.version,
      terms: 'Changed scope after the administrative decision',
    })
  ).body;
  assert.equal(
    (
      await call(f.sales, 'POST', `/v1/quotes/${quote.id}/send`, 'rep', {
        expectedVersion: quote.version,
      })
    ).status,
    409,
  );
  const renewed = (
    await call(f.sales, 'POST', `/v1/quotes/${quote.id}/discount-approval`, 'rep', {
      expectedVersion: quote.version,
      reason: 'Reapproval requested after changed terms',
    })
  ).body;
  await call(f.sales, 'POST', `/v1/quote-discount-approvals/${renewed.id}/decision`, 'admin', {
    expectedVersion: renewed.version,
    decision: 'approved',
    note: 'Updated scope approved',
  });
  const sent = await call(f.sales, 'POST', `/v1/quotes/${quote.id}/send`, 'rep', {
    expectedVersion: quote.version,
  });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.status, 'sent');
});

test('custom-priced services require approval even with zero explicit discount', async (t) => {
  const f = await repFixture(t);
  await f.publish();
  const visit = await f.start();
  const draft = await call(
    f.sales,
    'POST',
    '/v1/quotes',
    'rep',
    f.quoteInput(visit.id, 0, 'custom'),
  );
  assert.equal(draft.status, 200);
  assert.equal(draft.body.customPricing, true);
  const send = await call(f.sales, 'POST', `/v1/quotes/${draft.body.id}/send`, 'rep', {
    expectedVersion: 1,
  });
  assert.equal(send.status, 409);
  assert.equal(send.body.error.code, 'DISCOUNT_APPROVAL_REQUIRED');
});

test('conversation messages persist independently, paginate and maintain per-actor receipts', async (t) => {
  const f = await repFixture(t);
  const created = await call(f.communications, 'POST', '/v1/conversations', 'rep', {
    clientId: f.customer.id,
  });
  assert.equal(created.status, 200);
  let conversation = created.body;
  assert.equal(
    (await call(f.communications, 'POST', '/v1/conversations', 'rep', { clientId: f.customer.id }))
      .body.id,
    conversation.id,
  );
  const path = `/v1/conversations/${conversation.id}/messages`;
  const input = {
    expectedVersion: conversation.version,
    body: 'Here is the follow-up from our visit',
  };
  const key = 'conversation-message-idempotent';
  const sent = await call(f.communications, 'POST', path, 'rep', input, key);
  assert.equal(sent.status, 200);
  assert.equal(
    (await call(f.communications, 'POST', path, 'rep', input, key)).body.message.id,
    sent.body.message.id,
  );
  conversation = sent.body.conversation;
  const reply = await call(f.communications, 'POST', path, 'client', {
    expectedVersion: conversation.version,
    body: 'Thank you; please provide the written scope',
  });
  assert.equal(reply.status, 200);
  conversation = reply.body.conversation;
  assert.equal(reply.body.message.senderRole, 'client');
  assert.equal(
    (await call(f.communications, 'POST', path, 'rep', { expectedVersion: 1, body: 'Stale send' }))
      .status,
    409,
  );
  const first = await call(f.communications, 'GET', `${path}?limit=1`, 'rep');
  assert.equal(first.body.items.length, 1);
  assert.equal(first.body.nextCursor, '1');
  const second = await call(
    f.communications,
    'GET',
    `${path}?cursor=${first.body.nextCursor}&limit=1`,
    'rep',
  );
  assert.equal(second.body.items[0].id, reply.body.message.id);
  assert.equal(second.body.nextCursor, null);
  const receipt = await call(
    f.communications,
    'POST',
    `/v1/conversations/${conversation.id}/read`,
    'rep',
    { expectedVersion: conversation.version, lastMessageId: reply.body.message.id },
  );
  assert.equal(receipt.body.lastReadSequence, 2);
  assert.equal((await call(f.communications, 'GET', path, 'client')).body.receipt, null);
  for (const token of ['otherRep', 'otherClient', 'outsider'])
    assert.equal((await call(f.communications, 'GET', path, token)).status, 404);
});

test('outbound messages respect contact withdrawal and stale rep replay cannot expose transferred conversations', async (t) => {
  const f = await repFixture(t);
  const conversation = (
    await call(f.communications, 'POST', '/v1/conversations', 'rep', { clientId: f.customer.id })
  ).body;
  const path = `/v1/conversations/${conversation.id}/messages`;
  const key = 'conversation-before-transfer';
  const original = { expectedVersion: 1, body: 'Customer requirement discussion' };
  const sent = await call(f.communications, 'POST', path, 'rep', original, key);
  let customer = (
    await call(f.crm, 'PATCH', `/v1/customers/${f.customer.id}`, 'client', {
      expectedVersion: 1,
      doNotContact: true,
    })
  ).body;
  assert.equal(customer.doNotContact, true);
  assert.equal(
    (
      await call(f.communications, 'POST', path, 'rep', {
        expectedVersion: sent.body.conversation.version,
        body: 'Unwanted new contact',
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(f.communications, 'POST', path, 'client', {
        expectedVersion: sent.body.conversation.version,
        body: 'I am asking a question despite opting out of outbound sales',
      })
    ).status,
    200,
  );
  customer = (
    await call(f.crm, 'PATCH', `/v1/customers/${f.customer.id}`, 'admin', {
      expectedVersion: customer.version,
      repId: 'rep-b',
    })
  ).body;
  assert.equal(customer.repId, 'rep-b');
  assert.equal((await call(f.communications, 'POST', path, 'rep', original, key)).status, 404);
  assert.deepEqual(
    (await call(f.communications, 'GET', '/v1/conversations', 'rep')).body.items,
    [],
  );
});

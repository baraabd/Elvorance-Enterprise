import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { ContractSnapshot, EventEnvelope } from '@elvorance/contracts';
import { consumeEvent } from '@elvorance/events';
import { MemoryRepository, type Repository } from '@elvorance/service-kit';
import { handleEvent } from '../../services/billing/src/application/events.ts';
import { tables } from '../../services/billing/src/infrastructure/migrations/001_initial.ts';
import { repFixture } from './rep-fixture.ts';
import { call } from './helpers.ts';

const envelope = (payload: object): EventEnvelope => ({
  id: randomUUID(),
  type: 'contract.approved.v1',
  schemaVersion: 1,
  source: 'sales',
  tenantId: 'tenant-a',
  aggregateId: 'contract-a',
  aggregateVersion: 2,
  occurredAt: new Date().toISOString(),
  correlationId: randomUUID(),
  payload,
});
const snapshot = (unitPriceMinor = 10000) => ({
  contractId: 'contract-a',
  quoteId: 'quote-a',
  visitId: 'visit-a',
  clientId: 'client-a',
  repId: 'rep-a',
  customerName: 'Test customer',
  currency: 'SAR',
  items: [
    {
      serviceId: 'web',
      title: 'Website',
      quantity: 1,
      unitPriceMinor,
      deliverables: ['Website'],
      duration: 'Two weeks',
    },
  ],
  totalMinor: unitPriceMinor,
  terms: 'Agreed scope',
  paymentPlan: [{ id: 'first', label: 'Full amount', amountMinor: unitPriceMinor, dueOn: null }],
  approvedAt: new Date().toISOString(),
  approvedBy: 'client-a',
});

test('discounted quote retains gross and discount in approval and bills only the net amount', async (t) => {
  const f = await repFixture(t);
  await f.publish();
  const visit = await f.start();
  let quote = (await call(f.sales, 'POST', '/v1/quotes', 'rep', f.quoteInput(visit.id, 1000))).body;
  quote = (
    await call(f.sales, 'POST', `/v1/quotes/${quote.id}/send`, 'rep', {
      expectedVersion: quote.version,
    })
  ).body;
  const accepted = await call(f.sales, 'POST', `/v1/quotes/${quote.id}/accept`, 'client', {
    expectedVersion: quote.version,
    consent: true,
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  const approved = await call(
    f.sales,
    'POST',
    `/v1/contracts/${accepted.body.contract.id}/approve`,
    'client',
    {
      expectedVersion: accepted.body.contract.version,
      consent: true,
      signerName: 'Test customer',
    },
  );
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const events = await f.salesRepository.leaseOutbox();
  const approval = events.find((row) => row.event.type === 'contract.approved.v1');
  assert.ok(approval);
  const event = approval.event;
  const repo = new MemoryRepository('billing', tables);
  await consumeEvent(repo, 'billing', event, handleEvent);
  const invoices = await repo.transaction('tenant-a', (tx) => tx.list('invoices'));
  assert.equal(invoices.length, 1);
  assert.equal((invoices[0] as unknown as { amountMinor: number }).amountMinor, 9000);
  const body = event.payload as ContractSnapshot & { subtotalMinor: number; discountMinor: number };
  assert.equal(body.subtotalMinor, 10000);
  assert.equal(body.discountMinor, 1000);
  assert.equal(await consumeEvent(repo, 'billing', event, handleEvent), 'duplicate');
  await consumeEvent(repo, 'billing', { ...event, id: randomUUID() }, handleEvent);
  assert.equal((await repo.transaction('tenant-a', (tx) => tx.list('invoices'))).length, 1);
});

test('legacy undiscounted approvals remain valid including the sales unit-price limit', async () => {
  for (const price of [10000, 10_000_000_000]) {
    const repo = new MemoryRepository('billing', tables);
    assert.equal(
      await consumeEvent(repo, 'billing', envelope(snapshot(price)), handleEvent),
      'processed',
    );
  }
});

test('inconsistent discounts roll back the inbox, account, invoices and outbox', async () => {
  const original = snapshot();
  for (const money of [
    { subtotalMinor: 9999, discountMinor: 0 },
    { subtotalMinor: 10000, discountMinor: -1 },
    { subtotalMinor: 10000, discountMinor: 1 },
    { discountMinor: 0 },
    { subtotalMinor: 10000 },
  ]) {
    const repo: Repository = new MemoryRepository('billing', tables);
    const event = envelope({ ...original, ...money });
    await assert.rejects(consumeEvent(repo, 'billing', event, handleEvent));
    assert.equal((await repo.transaction('tenant-a', (tx) => tx.list('invoices'))).length, 0);
    assert.equal((await repo.leaseOutbox()).length, 0);
    assert.equal(
      await consumeEvent(repo, 'billing', { ...event, payload: original }, handleEvent),
      'processed',
    );
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { ContractSnapshot } from '@elvorance/contracts';
import { MemoryRepository, envelope } from '@elvorance/service-kit';
import { consumeEvent } from '@elvorance/events';
import { handleEvent } from '../../services/billing/src/application/events.ts';
import { tables } from '../../services/billing/src/infrastructure/migrations/001_initial.ts';
import type { Invoice, ContractAccount } from '../../services/billing/src/domain/model.ts';
import {
  toApprovedSnapshot,
  type Contract,
  type Quote,
} from '../../services/sales/src/domain/model.ts';

function contract(): Contract {
  const entity = {
    id: 'quote-s09',
    tenantId: 'tenant-s09',
    version: 3,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
  const quote: Quote = {
    ...entity,
    visitId: 'visit-s09',
    clientId: 'client-s09',
    customerName: 'Synthetic customer',
    repId: 'rep-s09',
    status: 'accepted',
    subtotalMinor: 10000,
    discountMinor: 2000,
    catalogVersion: 1,
    customPricing: false,
    currency: 'SAR',
    items: [
      {
        serviceId: 'service-s09',
        title: 'Synthetic service',
        quantity: 1,
        unitPriceMinor: 10000,
        deliverables: ['Synthetic report'],
        duration: 'One day',
      },
    ],
    totalMinor: 8000,
    terms: 'Synthetic terms',
    paymentPlan: [
      { id: 'first', label: 'Deposit', amountMinor: 3200, dueOn: null },
      { id: 'last', label: 'Balance', amountMinor: 4800, dueOn: null },
    ],
    validUntil: '2027-01-01',
    sentAt: entity.createdAt,
    acceptedAt: entity.createdAt,
    acceptedBy: 'client-user-s09',
    customerResponse: '',
    revisionOf: null,
  };
  return {
    ...entity,
    id: 'contract-s09',
    quoteId: quote.id,
    quoteVersion: quote.version,
    visitId: quote.visitId,
    clientId: quote.clientId,
    customerName: quote.customerName,
    repId: quote.repId,
    status: 'approved',
    currency: quote.currency,
    items: quote.items,
    totalMinor: quote.totalMinor,
    terms: quote.terms,
    paymentPlan: quote.paymentPlan,
    quoteSnapshot: quote,
    approvedAt: entity.createdAt,
    approvedBy: 'client-user-s09',
    signerName: 'Synthetic signer',
  };
}
function event(payload: object) {
  return envelope('sales', 'tenant-s09', 'contract.approved.v1', 'contract-s09', 2, payload);
}
async function rows(repo: MemoryRepository) {
  return repo.transaction('tenant-s09', async (tx) => ({
    accounts: await tx.list<ContractAccount>('contract_accounts'),
    invoices: await tx.list<Invoice>('invoices'),
  }));
}

test('S09: approved discount crosses the sales snapshot and billing inbox exactly once', async () => {
  const payload = toApprovedSnapshot(contract());
  // Check emitted wire data, not merely the internal quote record.
  const wire = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
  assert.equal(wire.subtotalMinor, 10000);
  assert.equal(wire.discountMinor, 2000);
  const repo = new MemoryRepository('billing', tables);
  const approved = event(payload);
  assert.equal(await consumeEvent(repo, 's09-billing', approved, handleEvent), 'processed');
  assert.equal(await consumeEvent(repo, 's09-billing', approved, handleEvent), 'duplicate');
  await consumeEvent(repo, 's09-billing', { ...approved, id: randomUUID() }, handleEvent);
  const result = await rows(repo);
  assert.equal(result.accounts.length, 1);
  assert.equal(result.invoices.length, 2);
  assert.deepEqual(result.invoices.map((row) => row.amountMinor).sort(), [3200, 4800]);
  assert.ok(result.invoices.every((row) => row.paidMinor === 0 && row.status === 'open'));
  assert.equal(repo.events().filter((row) => row.type === 'billing.invoices_created.v1').length, 1);
});

test('S09: explicit balanced discount is accepted by the billing consumer', async () => {
  const repo = new MemoryRepository('billing', tables);
  await consumeEvent(
    repo,
    's09-billing',
    event({ ...toApprovedSnapshot(contract()), subtotalMinor: 10000, discountMinor: 2000 }),
    handleEvent,
  );
  assert.equal((await rows(repo)).invoices.length, 2);
});

test('S09: undiscounted historical v1 snapshots remain consumable', async () => {
  const payload: Record<string, unknown> = {
    ...toApprovedSnapshot(contract()),
    totalMinor: 10000,
    paymentPlan: [{ id: 'full', label: 'Full payment', amountMinor: 10000, dueOn: null }],
  };
  delete payload.subtotalMinor;
  delete payload.discountMinor;
  const repo = new MemoryRepository('billing', tables);
  await consumeEvent(repo, 's09-billing', event(payload), handleEvent);
  assert.equal((await rows(repo)).invoices.length, 1);
});

test('S09: missing, inconsistent, partial and invalid discount evidence never creates financial rows', async () => {
  const base: Record<string, unknown> = { ...toApprovedSnapshot(contract()) };
  delete base.subtotalMinor;
  delete base.discountMinor;
  const invalid = [
    base,
    { ...base, subtotalMinor: 10000 },
    { ...base, discountMinor: 2000 },
    { ...base, subtotalMinor: 10000, discountMinor: 1999 },
    { ...base, subtotalMinor: 9999, discountMinor: 1999 },
    { ...base, subtotalMinor: 10000, discountMinor: -1 },
    { ...base, subtotalMinor: 10000, discountMinor: 2000.5 },
    {
      ...base,
      subtotalMinor: 10000,
      discountMinor: 2000,
      paymentPlan: [{ id: 'bad', label: 'Bad total', amountMinor: 10000, dueOn: null }],
    },
  ];
  for (const payload of invalid) {
    const repo = new MemoryRepository('billing', tables);
    const message = event(payload);
    await assert.rejects(consumeEvent(repo, 's09-billing', message, handleEvent));
    assert.deepEqual(await rows(repo), { accounts: [], invoices: [] });
    assert.deepEqual(repo.events(), []);
    // A failed transaction must not claim the inbox permanently; a corrected retry can succeed.
    const valid: ContractSnapshot = toApprovedSnapshot(contract());
    await consumeEvent(
      repo,
      's09-billing',
      { ...message, payload: { ...valid, subtotalMinor: 10000, discountMinor: 2000 } },
      handleEvent,
    );
    assert.equal((await rows(repo)).invoices.length, 2);
  }
});

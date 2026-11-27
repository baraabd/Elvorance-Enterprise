import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeEvent } from '@elvorance/events';
import { envelope, MemoryRepository } from '@elvorance/service-kit';
import type { Entity } from '@elvorance/contracts';
import { handleEvent } from '../../services/billing/src/application/events.ts';

const payload = (totalMinor: number, discountMinor?: number) => ({
  contractId: 'contract-s05',
  quoteId: 'quote-s05',
  visitId: 'visit-s05',
  clientId: 'customer-s05',
  repId: 'rep-s05',
  customerName: 'Isolated test',
  currency: 'SAR',
  totalMinor,
  ...(discountMinor === undefined ? {} : { subtotalMinor: 10000, discountMinor }),
  items: [
    {
      serviceId: 'service-s05',
      title: 'Service',
      quantity: 1,
      unitPriceMinor: 10000,
      deliverables: ['Work'],
      duration: 'Week',
    },
  ],
  paymentPlan: [{ id: 'deposit', label: 'Payment', amountMinor: totalMinor, dueOn: '2030-01-01' }],
  terms: 'Test agreement',
  approvedAt: '2026-01-01T00:00:00.000Z',
  approvedBy: 'client-s05',
});
for (const [name, total, discount] of [
  ['legacy undiscounted events', 10000, undefined],
  ['explicit zero discount', 10000, 0],
  ['approved discounted events', 8000, 2000],
] as const) {
  test(`S05 billing accepts ${name} and delivers invoices exactly once`, async () => {
    const repo = new MemoryRepository('billing', ['contract_accounts', 'invoices', 'payments']);
    const event = envelope(
      'sales',
      'tenant-s05',
      'contract.approved.v1',
      'contract-s05',
      2,
      payload(total, discount),
    );
    assert.equal(await consumeEvent(repo, 'billing', event, handleEvent), 'processed');
    assert.equal(await consumeEvent(repo, 'billing', event, handleEvent), 'duplicate');
    const rows = await repo.transaction('tenant-s05', (tx) =>
      tx.list<Entity & { amountMinor: number }>('invoices'),
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.amountMinor, total);
  });
}
for (const discount of [undefined, -2000, 10001, 1999, 2000.5]) {
  test(`S05 billing rejects unbalanced discount ${String(discount)} without partial invoices`, async () => {
    const repo = new MemoryRepository('billing', ['contract_accounts', 'invoices', 'payments']);
    const event = envelope(
      'sales',
      'tenant-s05',
      'contract.approved.v1',
      'contract-s05',
      2,
      payload(8000, discount),
    );
    await assert.rejects(consumeEvent(repo, 'billing', event, handleEvent));
    assert.equal((await repo.transaction('tenant-s05', (tx) => tx.list('invoices'))).length, 0);
    assert.equal(
      (await repo.transaction('tenant-s05', (tx) => tx.list('contract_accounts'))).length,
      0,
    );
  });
}

for (const [name, changes] of [
  ['missing subtotal', { subtotalMinor: undefined }],
  ['missing discount', { discountMinor: undefined }],
  ['incorrect subtotal', { subtotalMinor: 9999 }],
  ['fractional subtotal', { subtotalMinor: 10000.5 }],
] as const) {
  test(`S05 billing rejects Sprint04 ${name} evidence atomically`, async () => {
    const repo = new MemoryRepository('billing', ['contract_accounts', 'invoices', 'payments']);
    const event = envelope('sales', 'tenant-s05', 'contract.approved.v1', 'contract-s05', 2, {
      ...payload(8000, 2000),
      ...changes,
    });
    await assert.rejects(consumeEvent(repo, 'billing', event, handleEvent));
    assert.equal((await repo.transaction('tenant-s05', (tx) => tx.list('invoices'))).length, 0);
    assert.equal(
      (await repo.transaction('tenant-s05', (tx) => tx.list('contract_accounts'))).length,
      0,
    );
  });
}
test('S05 billing accepts the Sprint04 Sales unit-price ceiling', async () => {
  const repo = new MemoryRepository('billing', ['contract_accounts', 'invoices', 'payments']);
  const value = payload(2_000_000_000, 0);
  value.subtotalMinor = 2_000_000_000;
  const item = value.items[0];
  assert.ok(item);
  item.unitPriceMinor = 2_000_000_000;
  const event = envelope('sales', 'tenant-s05', 'contract.approved.v1', 'contract-s05', 2, value);
  assert.equal(await consumeEvent(repo, 'billing', event, handleEvent), 'processed');
  const rows = await repo.transaction('tenant-s05', (tx) =>
    tx.list<Entity & { amountMinor: number }>('invoices'),
  );
  assert.equal(rows[0]?.amountMinor, 2_000_000_000);
});

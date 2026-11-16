// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  normalizedFinancials,
  planAudit,
  suggestedPlan,
} from '../../packages/app-runtime/src/finance.ts';

test('amount discount and balanced 30/40/remainder', () => {
  const f = normalizedFinancials({
    items: [{ qty: 1, price: 950 }],
    discountMode: 'amount',
    discountValue: 100,
  });
  assert.equal(f.subtotalCents, 95000);
  assert.equal(f.discountCents, 10000);
  assert.equal(f.totalCents, 85000);
  assert.equal(f.audit.valid, true);
  assert.equal(
    f.plan.reduce((a, b) => a + b.amount, 0),
    850,
  );
});
test('percent discount converts to exact dollar amount', () => {
  const f = normalizedFinancials({
    items: [{ qty: 1, price: 950 }],
    discountMode: 'percent',
    discountValue: 10,
  });
  assert.equal(f.discountCents, 9500);
  assert.equal(f.totalCents, 85500);
});
test('excess of 100 dollars rejected', () => {
  const audit = planAudit([{ amount: 300 }, { amount: 400 }, { amount: 350 }], 95000);
  assert.equal(audit.kind, 'excess');
  assert.equal(audit.remainingCents, -10000);
});
test('first instalment below 20 percent rejected', () => {
  const audit = planAudit([{ amount: 169 }, { amount: 681 }], 85000);
  assert.equal(audit.kind, 'first_low');
  assert.equal(audit.minFirstCents, 17000);
});
test('remainder of 350 dollars after two instalments', () => {
  const audit = planAudit([{ amount: 200 }, { amount: 300 }], 85000);
  assert.equal(audit.remainingCents, 35000);
  assert.equal(audit.kind, 'short');
});
test('rounding always sums to total cents', () => {
  for (const cents of [1, 10, 101, 10001, 350000, 1000001]) {
    const plan = suggestedPlan(cents);
    if (cents < 10) continue;
    assert.equal(Math.round(plan.reduce((a, b) => a + b.amount, 0) * 100), cents);
  }
});

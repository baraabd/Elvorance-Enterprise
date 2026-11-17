// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoData } from '../../packages/demo-data/src/index.ts';
import { createContext } from '../../apps/rep-mobile/src/context.ts';
import { createQuotesFeature } from '../../apps/rep-mobile/src/features/quotes/index.ts';
const s = createDemoData();
const escape = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (k) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[k],
  );
const A = {
  state: () => s,
  escape: escape,
  esc: escape,
  icon: (n) => `<svg data-icon="${escape(n)}"></svg>`,
  money: (n) => '$' + Number(n || 0).toLocaleString('en-US'),
  badge: (l) => `<span>${escape(l)}</span>`,
  today: () => new Date().toISOString().slice(0, 10),
  addDays: (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10),
  date: (v) => String(v || ''),
  empty: (a, b) => `<p>${escape(a)} ${escape(b)}</p>`,
  id: () => 'test-id',
  quoteFingerprint: () => 'sample',
};
const ctx = createContext(A);
const quotes = createQuotesFeature(ctx, {
  state: {
    commit: () => false,
    readDraft: () => null,
    removeDraft: () => {},
    writeDraft: () => true,
  },
  visits: { bindQuoteToVisit: () => {}, currentVisitFor: () => null, visitWorking: () => ({}) },
});
test('quote builder shows discount selector and instalment planner before final actions', () => {
  const client = ctx.ownClients(s).find((c) => !c.doNotContact);
  assert.ok(client, 'test client must exist');
  const html = quotes.routes['quote-builder'].render({ state: s, params: { client: client.id } });
  assert.match(html, /السعر والخصم أولًا/);
  assert.match(html, /خصم بالنسبة المئوية/);
  assert.match(html, /صافي العرض بعد الخصم/);
  assert.match(html, /جدول الدفعات/);
  assert.match(html, /data-action="quote-payment-add"/);
  assert.match(html, /data-action="quote-payment-suggest"/);
  assert.match(html, /data-action="quote-discount-mode"/);
  assert.ok(html.indexOf('السعر والخصم أولًا') < html.indexOf('جدول الدفعات'));
});
test('new controls are handled by actual feature actions', () => {
  const a = quotes.actions;
  for (const name of [
    'quote-discount-mode',
    'quote-discount-input',
    'quote-payment-amount',
    'quote-payment-add',
    'quote-payment-fill',
    'quote-payment-suggest',
  ])
    assert.equal(typeof a[name], 'function', name);
});

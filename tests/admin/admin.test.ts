import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(import.meta.url)('jsdom') as typeof import('jsdom');
import {
  createAdminApi,
  paths,
  segment,
  row,
  type Row,
} from '../../apps/admin-web/src/server/api.ts';
import { fields } from '../../apps/admin-web/src/server/forms.ts';
import { invoiceTotals, snapshot } from '../../apps/admin-web/src/server/reports.ts';
import { createOperation, recordOperations } from '../../apps/admin-web/src/server/operations.ts';
import { parseRoute, selectRows } from '../../apps/admin-web/src/server/workspace.ts';
import { quoteOperation } from '../../apps/admin-web/src/server/quote-editor.ts';
import { fixture } from './fixture.mts';
const entity = (id: string, extra: Record<string, unknown> = {}): Row => ({
  id,
  tenantId: 'tenant-a',
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...extra,
});
test('S05 entity and path validation reject foreign tenants and unsafe identifiers', () => {
  for (const value of ['../tenant', 'a?b', 'a/b', 'a#b', '']) assert.throws(() => segment(value));
  assert.throws(() => row(entity('valid'), 'tenant-other'));
  assert.throws(() => row({ ...entity('valid'), version: 0 }));
  assert.equal(row(entity('valid'), 'tenant-a').id, 'valid');
});
test('S05 scoped pagination exhausts pages and rejects repeated, truncated or foreign data', async () => {
  let kind = 'good';
  let reads = 0;
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/me'))
      return Response.json({ principal: { sub: 's05', tenantId: 'tenant-a', roles: ['admin'] } });
    reads++;
    const cursor = url.searchParams.get('cursor');
    return Response.json({
      items: [
        entity(kind === 'repeat' ? 'same' : `record-${reads}`, {
          tenantId: kind === 'foreign' ? 'other' : 'tenant-a',
        }),
      ],
      nextCursor:
        kind === 'bound' ? `cursor-${reads}` : kind === 'repeat' ? 'same' : cursor ? null : 'next',
    });
  };
  const api = createAdminApi(
    { baseUrl: 'https://test.invalid', accessToken: async () => 'token', fetch: fetcher },
    new AbortController().signal,
  );
  await assert.rejects(api.page('customers'));
  await api.identity();
  assert.equal((await api.all('customers')).length, 2);
  kind = 'repeat';
  await assert.rejects(api.all('customers'));
  kind = 'foreign';
  await assert.rejects(api.all('customers'));
  kind = 'bound';
  reads = 0;
  await assert.rejects(api.all('customers'));
  assert.equal(reads, 100);
});
test('S05 retry preserves one idempotency key after uncertain outcome and starts a new intent after success', async () => {
  const keys: string[] = [];
  let fail = true;
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).endsWith('/me'))
      return Response.json({ principal: { sub: 's05', tenantId: 'tenant-a', roles: ['admin'] } });
    keys.push(new Headers(init?.headers).get('Idempotency-Key') ?? '');
    if (fail) {
      fail = false;
      throw new Error('lost connection');
    }
    return Response.json(entity('record'));
  };
  const api = createAdminApi(
    { baseUrl: 'https://test.invalid', accessToken: async () => 'token', fetch: fetcher },
    new AbortController().signal,
  );
  await api.identity();
  const body = { name: 'Customer', expectedVersion: 1 };
  await assert.rejects(api.mutate('PATCH', paths.customers + '/record', body));
  await api.mutate('PATCH', paths.customers + '/record', body);
  await api.mutate('PATCH', paths.customers + '/record', { ...body, expectedVersion: 2 });
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[1], keys[2]);
});
test('S05 monetary totals retain currency separation, outstanding amounts and safe-integer guards', () => {
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        invoiceTotals([
          entity('a', { currency: 'SAR', amountMinor: 1000, paidMinor: 250 }),
          entity('b', { currency: 'USD', amountMinor: 300, paidMinor: 300 }),
        ]),
      ),
    ),
    {
      SAR: { amountMinor: 1000, paidMinor: 250, outstandingMinor: 750 },
      USD: { amountMinor: 300, paidMinor: 300, outstandingMinor: 0 },
    },
  );
  for (const extra of [
    { paidMinor: 1001 },
    { currency: 'unknown' },
    { amountMinor: 0.5 },
    { paidMinor: -1 },
  ])
    assert.throws(() =>
      invoiceTotals([entity('a', { currency: 'SAR', amountMinor: 1000, paidMinor: 0, ...extra })]),
    );
});
test('S05 reports reject partial service failure instead of manufacturing zero KPIs', async () => {
  await assert.rejects(
    snapshot({
      all: async (resource) => {
        if (resource === 'invoices') throw new Error('Unavailable');
        return [entity(resource)];
      },
    }),
  );
});
test('S05 URL route/query state and deterministic within-scope filtering survive reconstruction', () => {
  const route = parseRoute('#/admin/customers?q=alpha&status=qualified&scope=all');
  assert.equal(route.screen, 'customers');
  assert.deepEqual(
    selectRows(
      [
        entity('b', { name: 'Alpha 2', status: 'new' }),
        entity('a', { name: 'Alpha 1', status: 'qualified' }),
      ],
      route.query,
    ).map((row) => row.id),
    ['a'],
  );
  assert.equal(parseRoute('#/admin/not-a-route').screen, 'dashboard');
  assert.equal(parseRoute('#/admin/memberships').screen, 'users');
});
test('S05 form controls have accessible labels and do not interpret record text as markup', () => {
  const dom = new JSDOM('<!doctype html>');
  const doc = dom.window.document;
  const editor = fields(
    doc,
    [
      { key: 'name', label: 'اسم العميل', required: true },
      { key: 'amount', label: 'المبلغ', type: 'number', min: 1, required: true },
    ],
    { name: '<img src=x onerror=alert(1)>', amount: 3 },
  );
  doc.body.append(editor.root);
  assert.equal(doc.querySelectorAll('img').length, 0);
  for (const input of doc.querySelectorAll('input')) assert.ok(input.labels?.length);
  assert.equal(editor.read().name, '<img src=x onerror=alert(1)>');
  const input = doc.querySelector<HTMLInputElement>('[name="amount"]');
  assert.ok(input);
  input.value = '1.5';
  assert.throws(() => editor.read());
  dom.window.close();
});
test('S05 controls expose only documented commands, not fake deletes or administrator client consent', () => {
  assert.equal(createOperation('contracts'), null);
  assert.deepEqual(recordOperations('contracts', entity('contract', { status: 'pending' })), []);
  assert.deepEqual(recordOperations('quotes', entity('quote', { status: 'accepted' })), []);
  assert.ok(
    recordOperations('invoices', entity('invoice', { status: 'unpaid' }))[0]?.notice?.includes(
      'لا تُنفّذ',
    ),
  );
  for (const resource of Object.keys(paths) as (keyof typeof paths)[])
    for (const operation of recordOperations(resource, entity('item', { status: 'draft' })))
      assert.notEqual(String(operation.method), 'DELETE');
});
test('S05 quote editor requires published real pricing and validates installment total', () => {
  assert.throws(() =>
    quoteOperation({ configured: false, recordVersion: 0, currency: 'SAR', items: [] }),
  );
  const operation = quoteOperation({
    configured: true,
    recordVersion: 1,
    currency: 'SAR',
    items: [{ id: 'service', title: 'Published service', unitPriceMinor: 10000 }],
  });
  assert.ok(operation.prepare);
  const input = {
    visitId: 'visit',
    items: [
      {
        serviceId: 'service',
        quantity: 1,
        unitPriceMinor: 1,
        deliverables: ['Real deliverable'],
        duration: 'One week',
      },
    ],
    discountMinor: 0,
    paymentPlan: [{ label: 'Full payment', amountMinor: 10000, dueOn: null }],
    validUntil: '2030-01-01',
    terms: 'Agreed scope',
  };
  const result = operation.prepare(input);
  assert.equal((result.items as Record<string, unknown>[])[0]?.unitPriceMinor, 10000);
  assert.throws(() =>
    operation.prepare?.({ ...input, paymentPlan: [{ label: 'Wrong', amountMinor: 1 }] }),
  );
});
test('S05 real HTTP: signed identity, tenant isolation, optimistic writes, lost-response retry and API reread', async (t) => {
  const stack = await fixture();
  t.after(stack.close);
  const api = createAdminApi(
    { baseUrl: stack.url, accessToken: async () => stack.admin },
    new AbortController().signal,
  );
  await api.identity();
  const result = await api.mutate('POST', paths.customers, {
    name: 'S05 customer',
    repId: 'rep-s05',
  });
  const customer = row(result, 'tenant-s05');
  const edit = { name: 'Persisted via HTTP', expectedVersion: customer.version };
  stack.loseResponse();
  await assert.rejects(api.mutate('PATCH', `${paths.customers}/${customer.id}`, edit));
  await api.mutate('PATCH', `${paths.customers}/${customer.id}`, edit);
  const reread = await api.detail('customers', customer.id);
  assert.equal(reread.name, 'Persisted via HTTP');
  assert.equal(reread.version, 2);
  await assert.rejects(
    api.mutate('PATCH', `${paths.customers}/${customer.id}`, {
      name: 'Stale overwrite',
      expectedVersion: 1,
    }),
  );
  assert.equal((await api.detail('customers', customer.id)).name, 'Persisted via HTTP');
  assert.equal(
    (await stack.call(`${paths.customers}/${customer.id}`, 'GET', undefined, stack.outsider))
      .status,
    404,
  );
  assert.equal(
    (await stack.call('/v1/identity/memberships', 'GET', undefined, stack.rep)).status,
    403,
  );
  const forbidden = createAdminApi(
    { baseUrl: stack.url, accessToken: async () => stack.rep },
    new AbortController().signal,
  );
  await assert.rejects(forbidden.identity());
});

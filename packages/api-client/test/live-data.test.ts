import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/index.ts';
import { createLiveDataApi } from '../src/live-data.ts';

test('live API reads server customer rows, not browser demo storage', async () => {
  const paths: string[] = [];
  const api = createLiveDataApi({
    baseUrl: 'http://127.0.0.1:3000',
    accessToken: async () => 'valid-token',
    fetch: async (url, init) => {
      paths.push(String(url));
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer valid-token');
      return Response.json({
        items: [
          {
            id: 'customer-1',
            version: 2,
            tenantId: 'tenant-1',
            createdAt: '2026-11-17T00:00:00Z',
            updatedAt: '2026-11-17T00:00:00Z',
            name: 'Server customer',
            repId: 'rep-1',
            regionId: null,
            phone: '',
            email: '',
            notes: '',
            doNotContact: false,
            consentVersion: 1,
          },
        ],
      });
    },
  });
  const customers = await api.crm.customers();
  assert.equal(customers[0]?.name, 'Server customer');
  assert.deepEqual(paths, ['http://127.0.0.1:3000/v1/crm/customers']);
});

test('no authenticated token means no request is made', async () => {
  let calls = 0;
  const api = createLiveDataApi({
    baseUrl: 'https://api.example.com',
    accessToken: async () => null,
    fetch: async () => {
      calls++;
      return Response.json({ items: [] });
    },
  });
  await assert.rejects(api.crm.customers(), (error: unknown) => {
    return error instanceof ApiError && error.status === 401;
  });
  assert.equal(calls, 0);
});

test('customer editing is a versioned PATCH with an idempotency key', async () => {
  const api = createLiveDataApi({
    baseUrl: 'https://api.example.com',
    accessToken: async () => 'signed-in-token',
    fetch: async (url, init) => {
      assert.equal(String(url), 'https://api.example.com/v1/crm/customers/customer-1');
      assert.equal(init?.method, 'PATCH');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('idempotency-key'), 'edit-customer-intent-1');
      assert.deepEqual(JSON.parse(String(init?.body)), {
        expectedVersion: 2,
        name: 'Updated from client',
      });
      return Response.json({ id: 'customer-1', version: 3 });
    },
  });
  const result = await api.crm.changeCustomer(
    'customer-1',
    { expectedVersion: 2, name: 'Updated from client' },
    { idempotencyKey: 'edit-customer-intent-1' },
  );
  assert.equal(result.version, 3);
});

test('an invalid record identifier fails before network access', async () => {
  let requests = 0;
  const api = createLiveDataApi({
    baseUrl: 'https://api.example.com',
    accessToken: async () => 'token',
    fetch: async () => {
      requests++;
      return Response.json({});
    },
  });
  assert.throws(() => api.crm.customer('../identity'), /identifier/);
  assert.equal(requests, 0);
});

test('malformed responses fail closed rather than fabricating demo records', async () => {
  const api = createLiveDataApi({
    baseUrl: 'https://api.example.com',
    accessToken: async () => 'token',
    fetch: async () => Response.json({ items: [{ id: 'customer-no-version' }] }),
  });
  await assert.rejects(api.crm.customers(), (error: unknown) => {
    return error instanceof ApiError && error.code === 'invalid_response';
  });
});

test('support ticket POST uses the backend message contract', async () => {
  const api = createLiveDataApi({
    baseUrl: 'https://api.example.com',
    accessToken: async () => 'token',
    fetch: async (url, init) => {
      assert.equal(String(url), 'https://api.example.com/v1/communications/tickets');
      assert.equal(init?.method, 'POST');
      assert.deepEqual(JSON.parse(String(init?.body)), {
        subject: 'Cannot open project',
        category: 'delivery',
        message: 'Project page returns an error',
      });
      return Response.json({ id: 'ticket-1', version: 1 });
    },
  });
  const result = await api.communications.createTicket(
    {
      subject: 'Cannot open project',
      category: 'delivery',
      message: 'Project page returns an error',
    },
    { idempotencyKey: 'new-ticket-001' },
  );
  assert.equal(result.id, 'ticket-1');
});

test('commercial decisions preserve exact consent, version and idempotency contracts', async () => {
  const requests: { path: string; input: unknown; key: string | null }[] = [];
  const api = createLiveDataApi({
    baseUrl: 'https://api.example.com',
    accessToken: async () => 'verified-client',
    fetch: async (url, init) => {
      assert.equal(init?.method, 'POST');
      requests.push({
        path: new URL(String(url)).pathname,
        input: JSON.parse(String(init?.body)) as unknown,
        key: new Headers(init?.headers).get('idempotency-key'),
      });
      return Response.json({ id: 'record', version: 4 });
    },
  });
  await api.sales.acceptQuote(
    'quote-1',
    { expectedVersion: 2, consent: true, paymentWishes: 'Bank transfer preferred' },
    { idempotencyKey: 'accept-user-intent-1' },
  );
  await api.sales.rejectQuote(
    'quote-2',
    { expectedVersion: 3, reason: 'Timing does not fit' },
    { idempotencyKey: 'reject-user-intent-1' },
  );
  await api.sales.requestQuoteChanges(
    'quote-3',
    { expectedVersion: 4, reason: 'Please adjust the scope' },
    { idempotencyKey: 'changes-user-intent-1' },
  );
  await api.sales.approveContract(
    'contract-1',
    { expectedVersion: 1, consent: true, signerName: 'Customer Signer' },
    { idempotencyKey: 'approve-contract-intent' },
  );
  await api.sales.decideDiscount(
    'approval-1',
    { expectedVersion: 1, decision: 'rejected', note: 'Margin is insufficient' },
    { idempotencyKey: 'discount-decision-intent' },
  );
  assert.deepEqual(
    requests.map((request) => request.path),
    [
      '/v1/sales/quotes/quote-1/accept',
      '/v1/sales/quotes/quote-2/reject',
      '/v1/sales/quotes/quote-3/request-changes',
      '/v1/sales/contracts/contract-1/approve',
      '/v1/sales/quote-discount-approvals/approval-1/decision',
    ],
  );
  assert.deepEqual(requests[0]!.input, {
    expectedVersion: 2,
    consent: true,
    paymentWishes: 'Bank transfer preferred',
  });
  assert.deepEqual(requests[3]!.input, {
    expectedVersion: 1,
    consent: true,
    signerName: 'Customer Signer',
  });
  assert.ok(requests.every((request) => request.key));
});

test('generic live lists follow every cursor and reject a repeated cursor rather than truncating', async () => {
  let calls = 0;
  const api = createLiveDataApi({
    baseUrl: 'https://api.example.com',
    accessToken: async () => 'verified-client',
    fetch: async (url) => {
      calls++;
      const cursor = new URL(String(url)).searchParams.get('cursor');
      return Response.json({
        items: [{ id: cursor ? 'quote-2' : 'quote-1', version: 1 }],
        nextCursor: cursor ? null : 'next-page',
      });
    },
  });
  assert.deepEqual(
    (await api.sales.quotes()).map((quote) => quote.id),
    ['quote-1', 'quote-2'],
  );
  assert.equal(calls, 2);
  const invalid = createLiveDataApi({
    baseUrl: 'https://api.example.com',
    accessToken: async () => 'verified-client',
    fetch: async () => Response.json({ items: [], nextCursor: 'same-page' }),
  });
  await assert.rejects(
    invalid.sales.quotes(),
    (error: unknown) => error instanceof ApiError && error.code === 'invalid_response',
  );
});

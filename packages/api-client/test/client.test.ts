import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApiClient } from '../src/index.ts';

test('rejects remote HTTP and credentials in base URL', () => {
  for (const baseUrl of ['http://api.example.com', 'https://user:pass@api.example.com']) {
    assert.throws(() => createApiClient({ baseUrl, accessToken: async () => null }));
  }
});

test('commands preserve their idempotency key and never trust browser tenant/role headers', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(String(url), 'https://api.example.com/v1/sales/visits');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer test-token');
    assert.equal(headers.get('idempotency-key'), 'intent-0001');
    assert.equal(headers.get('x-tenant-id'), null);
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.redirect, 'error');
    return Response.json({ id: 'visit-1' });
  };
  const client = createApiClient({
    baseUrl: 'https://api.example.com',
    accessToken: async () => 'test-token',
    fetch: fetcher,
  });
  assert.deepEqual(
    await client.command(
      '/v1/sales/visits',
      { clientId: 'client-1' },
      { idempotencyKey: 'intent-0001' },
    ),
    { id: 'visit-1' },
  );
  assert.equal(calls, 1);
});

test('does not make authenticated requests without a token or to an arbitrary origin', async () => {
  let calls = 0;
  const client = createApiClient({
    baseUrl: 'https://api.example.com',
    accessToken: async () => null,
    fetch: async () => {
      calls++;
      return Response.json({});
    },
  });
  await assert.rejects(
    client.get('/v1/crm/customers'),
    (e: unknown) => e instanceof ApiError && e.status === 401,
  );
  await assert.rejects(client.get('//evil.example/v1/crm/customers'));
  assert.equal(calls, 0);
});

test('surfaces domain conflicts with request ID without retrying the mutation', async () => {
  let calls = 0;
  const client = createApiClient({
    baseUrl: 'http://localhost:3000',
    accessToken: async () => 'token',
    fetch: async () => {
      calls++;
      return Response.json(
        {
          error: { code: 'version_conflict', message: 'Changed by another user', requestId: 'r-1' },
        },
        { status: 409 },
      );
    },
  });
  await assert.rejects(
    client.command(
      '/v1/sales/contracts/contract-1/approve',
      { expectedVersion: 1 },
      { idempotencyKey: 'approve-0001' },
    ),
    (e: unknown) => e instanceof ApiError && e.code === 'version_conflict' && e.requestId === 'r-1',
  );
  assert.equal(calls, 1);
});

test('PATCH and PUT use the authenticated API with versioned payloads and stable keys', async () => {
  const requests: Array<{ url: string; method: string; key: string | null; body: unknown }> = [];
  const client = createApiClient({
    baseUrl: 'https://api.example.com',
    accessToken: async () => 'test-token',
    fetch: async (url, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('authorization'), 'Bearer test-token');
      requests.push({
        url: String(url),
        method: init?.method ?? '',
        key: headers.get('idempotency-key'),
        body: JSON.parse(String(init?.body)),
      });
      return Response.json({ version: 2 });
    },
  });
  await client.patch('/v1/crm/customers/c-1', { expectedVersion: 1, name: 'Updated' }, {
    idempotencyKey: 'edit-customer-1',
  });
  await client.put('/v1/crm/configuration', { expectedVersion: 1, title: 'Current' }, {
    idempotencyKey: 'publish-config-1',
  });
  assert.deepEqual(requests, [
    {
      url: 'https://api.example.com/v1/crm/customers/c-1',
      method: 'PATCH',
      key: 'edit-customer-1',
      body: { expectedVersion: 1, name: 'Updated' },
    },
    {
      url: 'https://api.example.com/v1/crm/configuration',
      method: 'PUT',
      key: 'publish-config-1',
      body: { expectedVersion: 1, title: 'Current' },
    },
  ]);
  assert.throws(() => client.patch('/v1/crm/customers/c-1', {}, { idempotencyKey: 'invalid' }));
});

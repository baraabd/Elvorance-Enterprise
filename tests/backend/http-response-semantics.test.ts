import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError, createService, MemoryRepository } from '@elvorance/service-kit';
import { createApp } from '../../services/api-gateway/src/app.ts';
import { forward } from '../../services/api-gateway/src/application/proxy.ts';
import type { Upstreams } from '../../services/api-gateway/src/domain/routes.ts';
import { auth } from './helpers.ts';

for (const status of [200, 301, 399, 400.5, 500, 503, Number.NaN, '400']) {
  test(`service rejects untrusted error status ${String(status)}`, async (t) => {
    const app = createService('crm', { repository: new MemoryRepository('crm', []), auth });
    app.get('/test-error', async () => {
      throw Object.assign(new Error('private-internal-detail'), { statusCode: status });
    });
    t.after(() => app.close());
    const response = await app.inject('/test-error');
    assert.equal(response.statusCode, 500);
    assert.equal(response.json().error.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(response.body, /private-internal-detail|stack/);
    assert.equal(typeof response.json().error.requestId, 'string');
  });
}

for (const status of [400, 413, 415, 429]) {
  test(`service preserves legitimate client error status ${status}`, async (t) => {
    const app = createService('crm', { repository: new MemoryRepository('crm', []), auth });
    app.get('/test-error', async () => {
      throw Object.assign(new Error('private-parser-detail'), { statusCode: status });
    });
    t.after(() => app.close());
    const response = await app.inject('/test-error');
    assert.equal(response.statusCode, status);
    assert.equal(response.json().error.code, 'INVALID_REQUEST');
    assert.doesNotMatch(response.body, /private-parser-detail/);
  });
}

test('service preserves known application errors', async (t) => {
  const app = createService('crm', { repository: new MemoryRepository('crm', []), auth });
  app.get('/test-error', async () => {
    throw new AppError(409, 'VERSION_CONFLICT', 'Version changed');
  });
  t.after(() => app.close());
  const response = await app.inject('/test-error');
  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, 'VERSION_CONFLICT');
  assert.equal(response.json().error.message, 'Version changed');
});

const upstreams: Upstreams = {
  identity: 'https://identity.example.test',
  crm: 'https://crm.example.test',
  sales: 'https://sales.example.test',
  delivery: 'https://delivery.example.test',
  billing: 'https://billing.example.test',
  tracking: 'https://tracking.example.test',
  communications: 'https://communications.example.test',
};
for (const status of [200, 404, 503]) {
  test(`gateway HEAD preserves upstream status ${status} without parsing a body`, async (t) => {
    let forwarded = 0;
    const app = createApp({
      auth,
      upstreams,
      fetcher: async (_url, init) => {
        forwarded++;
        assert.equal(init?.method, 'HEAD');
        assert.equal(init?.body, undefined);
        return new Response(null, { status });
      },
    });
    t.after(() => app.close());
    const response = await app.inject({
      method: 'HEAD',
      url: '/v1/crm/customers',
      headers: { authorization: 'Bearer rep' },
    });
    assert.equal(response.statusCode, status);
    assert.equal(response.body, '');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(forwarded, 1);
    const anonymous = await app.inject({ method: 'HEAD', url: '/v1/crm/customers' });
    assert.equal(anonymous.statusCode, 401);
    assert.equal(forwarded, 1);
  });
}

for (const body of ['', 'not-json']) {
  test(`gateway GET still rejects invalid JSON body ${JSON.stringify(body)}`, async () => {
    await assert.rejects(
      forward(
        {
          origin: upstreams.crm,
          suffix: '/customers',
          query: '',
          method: 'GET',
          authorization: 'Bearer rep',
          requestId: 'test',
        },
        async () => new Response(body, { headers: { 'content-type': 'application/json' } }),
      ),
      (error: unknown) => error instanceof AppError && error.statusCode === 502,
    );
  });
}

test('gateway HEAD still reports upstream connection failures', async () => {
  await assert.rejects(
    forward(
      {
        origin: upstreams.crm,
        suffix: '/customers',
        query: '',
        method: 'HEAD',
        authorization: 'Bearer rep',
        requestId: 'test',
      },
      async () => {
        throw new Error('private-connection-detail');
      },
    ),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 503 && !error.message.includes('private'),
  );
});

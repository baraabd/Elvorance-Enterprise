import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../services/api-gateway/src/app.ts';
import type { Upstreams } from '../../services/api-gateway/src/domain/routes.ts';
import { auth } from './helpers.ts';

const upstreams: Upstreams = {
  identity: 'https://identity.example.test',
  crm: 'https://crm.example.test',
  sales: 'https://sales.example.test',
  delivery: 'https://delivery.example.test',
  billing: 'https://billing.example.test',
  tracking: 'https://tracking.example.test',
  communications: 'https://communications.example.test',
};

for (const sample of [
  { name: 'malformed JSON', type: 'application/json', payload: '{', status: 400 },
  { name: 'oversized JSON', type: 'application/json', payload: 'x'.repeat(300_000), status: 413 },
  { name: 'unsupported content type', type: 'application/xml', payload: '<quote/>', status: 415 },
]) {
  test(`gateway preserves client status for ${sample.name}`, async (t) => {
    let forwarded = false;
    const app = createApp({
      auth,
      upstreams,
      fetcher: async () => {
        forwarded = true;
        return Response.json({ ok: true });
      },
    });
    t.after(() => app.close());
    const response = await app.inject({
      method: 'POST',
      url: '/v1/sales/quotes',
      headers: { authorization: 'Bearer rep', 'content-type': sample.type },
      payload: sample.payload,
    });
    assert.equal(response.statusCode, sample.status);
    assert.equal(response.json().error.code, 'INVALID_REQUEST');
    assert.equal(response.json().error.message, 'The request could not be processed');
    assert.equal(typeof response.json().error.requestId, 'string');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(forwarded, false);
  });
}

test('gateway masks unexpected errors and bounds the inbound request timeout', async (t) => {
  const app = createApp({ auth, upstreams });
  app.get('/test-failure', async () => {
    throw new Error('private-internal-detail');
  });
  t.after(() => app.close());
  const response = await app.inject({ method: 'GET', url: '/test-failure' });
  assert.equal(response.statusCode, 500);
  assert.equal(response.json().error.code, 'INTERNAL_ERROR');
  assert.doesNotMatch(response.body, /private-internal-detail|stack/);
  assert.equal(app.server.requestTimeout, 30_000);
});

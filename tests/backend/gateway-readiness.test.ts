import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../services/api-gateway/src/app.ts';
import { serviceNames, type Upstreams } from '../../services/api-gateway/src/domain/routes.ts';
import { auth } from './helpers.ts';

test('gateway deployment readiness fails on an unavailable domain and coalesces concurrent probes', async () => {
  const upstreams = Object.fromEntries(
    serviceNames.map((name) => [name, `http://${name}.internal`]),
  ) as Upstreams;
  let requests = 0;
  const app = createApp({
    auth,
    upstreams,
    fetcher: async (input, options) => {
      requests++;
      assert.equal(options?.redirect, 'error');
      assert.equal(new Headers(options?.headers).has('authorization'), false);
      const service = new URL(String(input)).hostname.split('.')[0];
      return Response.json(
        { service, status: 'ready', database: 'ready', broker: 'ready' },
        { status: service === 'sales' ? 503 : 200 },
      );
    },
  });
  try {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => app.inject({ method: 'GET', url: '/ready' })),
    );
    for (const response of responses) {
      assert.equal(response.statusCode, 503);
      assert.equal(response.json().dependencies.sales, false);
      assert.equal(response.headers['cache-control'], 'no-store');
    }
    assert.equal(requests, serviceNames.length);
    assert.equal((await app.inject({ method: 'GET', url: '/health' })).statusCode, 200);
  } finally {
    await app.close();
  }
});

test('gateway readiness rejects a successful response from the wrong application or unconfigured broker', async () => {
  const upstreams = Object.fromEntries(
    serviceNames.map((name) => [name, `http://${name}.internal`]),
  ) as Upstreams;
  const app = createApp({
    auth,
    upstreams,
    fetcher: async (input) => {
      const service = new URL(String(input)).hostname.split('.')[0];
      if (service === 'billing')
        return new Response('<html>Proxy fallback</html>', { status: 200 });
      return Response.json({
        service: service === 'crm' ? 'identity' : service,
        status: 'ready',
        database: 'ready',
        broker: service === 'sales' ? 'not-configured' : 'ready',
      });
    },
  });
  try {
    const response = await app.inject({ method: 'GET', url: '/ready' });
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json().dependencies, {
      identity: true,
      crm: false,
      sales: false,
      delivery: true,
      billing: false,
      tracking: true,
      communications: true,
    });
  } finally {
    await app.close();
  }
});

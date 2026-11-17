import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountLiveWorkspace } from '../../packages/api-client/src/live-workspace.ts';

test('server mode renders authenticated API records without a preview repository', async () => {
  const dom = new JSDOM('<div id="app"></div>', {
    url: 'http://127.0.0.1:4173',
  });
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (url, init) => {
    const pathname = new URL(String(url)).pathname;
    calls.push(pathname);
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer signed-in-rep');
    if (pathname === '/v1/identity/me') {
      return Response.json({
        principal: { sub: 'rep-subject', tenantId: 'tenant-1', roles: ['rep'], repId: 'rep-1' },
        profile: null,
        identitySource: 'verified-oidc-claims',
      });
    }
    if (pathname === '/v1/crm/customers') {
      return Response.json({
        items: [
          {
            id: 'server-customer-1',
            version: 1,
            tenantId: 'tenant-1',
            createdAt: '2026-11-17T00:00:00Z',
            updatedAt: '2026-11-17T00:00:00Z',
            name: 'Real API customer',
          },
        ],
      });
    }
    throw new Error('Unexpected API path: ' + pathname);
  };
  try {
    const root = dom.window.document.getElementById('app');
    assert.ok(root);
    await mountLiveWorkspace({
      root,
      role: 'rep',
      baseUrl: 'http://127.0.0.1:3000',
      accessToken: async () => 'signed-in-rep',
    });
    assert.match(root.textContent ?? '', /Real API customer/);
    assert.deepEqual(calls, ['/v1/identity/me', '/v1/crm/customers']);
    assert.doesNotMatch(root.innerHTML, /rep-1.*بيانات توضيحية/);
  } finally {
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
});

test('an unavailable API fails visibly instead of rendering seeded company records', async () => {
  const dom = new JSDOM('<div id="app"></div>', {
    url: 'http://127.0.0.1:4173',
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json(
      { error: { code: 'service_unavailable', message: 'Unavailable' } },
      { status: 503 },
    );
  try {
    const root = dom.window.document.getElementById('app');
    assert.ok(root);
    await mountLiveWorkspace({
      root,
      role: 'client',
      baseUrl: 'http://127.0.0.1:3000',
      accessToken: async () => 'signed-in-client',
    });
    assert.match(root.textContent ?? '', /يتطلب التطبيق اتصالًا مصادقًا/);
    assert.doesNotMatch(root.textContent ?? '', /مقهى مدار/);
  } finally {
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
});

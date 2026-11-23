import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { authFromEnv, MemoryRepository, principalFromClaims } from '@elvorance/service-kit';
import { createApp as createIdentity } from '../../services/identity/src/app.ts';
import { createApp as createGateway } from '../../services/api-gateway/src/app.ts';
import { auth, principals } from './helpers.ts';
import type { Upstreams } from '../../services/api-gateway/src/domain/routes.ts';
const secret = 'automated-test-secret-only-32-characters';
const env = {
  NODE_ENV: 'test',
  AUTH_MODE: 'dev-hs256',
  DEV_JWT_SECRET: secret,
  OIDC_ISSUER: 'https://issuer.example.test',
  OIDC_AUDIENCE: 'elvorance-api',
};
async function token(
  overrides: Record<string, unknown> = {},
  signingSecret = secret,
): Promise<string> {
  return new SignJWT({
    sub: 'rep-a',
    tenant_id: 'tenant-a',
    roles: ['rep'],
    rep_id: 'rep-a',
    ...overrides,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(env.OIDC_ISSUER)
    .setAudience(env.OIDC_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(signingSecret));
}
test('signed access claims establish tenant and role; spoofed headers cannot replace them', async (t) => {
  const repository = new MemoryRepository('identity', [
    'tenant_profiles',
    'memberships',
    'user_profiles',
  ]);
  const app = createIdentity({ repository, auth: authFromEnv(env) });
  t.after(() => app.close());
  const valid = await token();
  const response = await app.inject({
    method: 'GET',
    url: '/v1/me',
    headers: { authorization: `Bearer ${valid}`, 'x-tenant-id': 'tenant-b', 'x-roles': 'admin' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().principal.tenantId, 'tenant-a');
  assert.deepEqual(response.json().principal.roles, ['rep']);
  const forged = await token({}, 'different-secret-with-at-least-32-bytes');
  assert.equal(
    (
      await app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: { authorization: `Bearer ${forged}` },
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: { 'x-tenant-id': 'tenant-a', 'x-roles': 'admin' },
      })
    ).statusCode,
    401,
  );
  assert.equal((await app.inject({ method: 'GET', url: '/health' })).statusCode, 200);
});
test('production rejects development auth; missing ownership claims and unknown roles fail closed', async () => {
  assert.throws(() => authFromEnv({ ...env, NODE_ENV: 'production' }), /forbidden/);
  assert.throws(
    () => principalFromClaims({ sub: 'user', tenant_id: 'tenant-a', roles: ['rep'] }),
    /rep_id/,
  );
  assert.throws(
    () => principalFromClaims({ sub: 'user', tenant_id: 'tenant-a', roles: ['super-admin'] }),
    /roles/,
  );
  assert.throws(
    () =>
      authFromEnv({
        ...env,
        AUTH_MODE: 'oidc',
        NODE_ENV: 'production',
        OIDC_JWKS_URL: 'http://untrusted.example/jwks',
      }),
    /HTTPS/,
  );
  const verifier = authFromEnv(env);
  await assert.rejects(verifier(`Bearer ${await token({ tenant_id: '../tenant-b' })}`));
});
test('gateway revalidates auth and forwards only allowed headers to fixed service origins without following redirects', async (t) => {
  const upstreams = Object.fromEntries(
    ['identity', 'crm', 'sales', 'delivery', 'billing', 'tracking', 'communications'].map(
      (name) => [name, `https://${name}.example.test`],
    ),
  ) as Upstreams;
  let captured: { url: string; init: RequestInit } | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    captured = { url: String(input), init: init! };
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const app = createGateway({
    auth,
    upstreams,
    fetcher,
    allowedOrigins: ['https://portal.example.test'],
  });
  t.after(() => app.close());
  const response = await app.inject({
    method: 'POST',
    url: '/v1/sales/quotes?limit=10',
    headers: {
      authorization: 'Bearer rep',
      'idempotency-key': 'gateway-command-001',
      'x-tenant-id': 'tenant-b',
      'x-roles': 'admin',
      origin: 'https://portal.example.test',
    },
    payload: { note: 'Transport test' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(captured?.url, 'https://sales.example.test/v1/quotes?limit=10');
  assert.equal(captured?.init.redirect, 'error');
  const headers = captured!.init.headers as Record<string, string>;
  assert.equal(headers.authorization, 'Bearer rep');
  assert.equal(headers['x-tenant-id'], undefined);
  assert.equal(headers['x-roles'], undefined);
  assert.equal(response.headers['access-control-allow-origin'], 'https://portal.example.test');
  assert.equal(
    (await app.inject({ method: 'GET', url: '/v1/sales/quotes', headers: { 'x-roles': 'admin' } }))
      .statusCode,
    401,
  );
  const denied = await app.inject({
    method: 'GET',
    url: '/v1/sales/quotes',
    headers: { authorization: 'Bearer rep', origin: 'https://evil.example' },
  });
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
  assert.equal(principals.rep!.tenantId, 'tenant-a');
});

test('a cached command cannot be replayed after the same subject loses its signed roles', async (t) => {
  const app = createIdentity({
    repository: new MemoryRepository('identity', [
      'tenant_profiles',
      'memberships',
      'user_profiles',
    ]),
    auth: authFromEnv(env),
  });
  t.after(() => app.close());
  const elevated = await token({ sub: 'same-user', roles: ['admin'], rep_id: undefined });
  const downgraded = await token({ sub: 'same-user', roles: [], rep_id: undefined });
  const command = {
    method: 'POST' as const,
    url: '/v1/tenant',
    payload: { name: 'Protected tenant profile' },
  };
  const accepted = await app.inject({
    ...command,
    headers: { authorization: `Bearer ${elevated}`, 'idempotency-key': 'role-replay-probe' },
  });
  assert.equal(accepted.statusCode, 200);
  const denied = await app.inject({
    ...command,
    headers: { authorization: `Bearer ${downgraded}`, 'idempotency-key': 'role-replay-probe' },
  });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.json().name, undefined);
  assert.equal(denied.json().error.code, 'FORBIDDEN');
});

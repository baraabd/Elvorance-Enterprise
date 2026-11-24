import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import inventory from '@elvorance/contracts/routes' with { type: 'json' };
import { roles, type Principal } from '@elvorance/contracts';
import {
  AppError,
  MemoryRepository,
  authFromEnv,
  createService,
  type SecurityAuditEvent,
} from '@elvorance/service-kit';
import { createApp as createIdentity } from '../../services/identity/src/app.ts';
import { createApp as createGateway } from '../../services/api-gateway/src/app.ts';
import type { Upstreams } from '../../services/api-gateway/src/domain/routes.ts';
import { auth } from './helpers.ts';

const upstreams = Object.fromEntries(
  ['identity', 'crm', 'sales', 'delivery', 'billing', 'tracking', 'communications'].map((name) => [
    name,
    `https://${name}.example.test`,
  ]),
) as Upstreams;
const repository = () =>
  new MemoryRepository('identity', ['tenant_profiles', 'memberships', 'user_profiles']);
const forbidden = (error: unknown) => error instanceof AppError && error.statusCode === 403;

test('S03 backend permission hook precedes handlers and unknown policies fail at startup', async (t) => {
  let calls = 0;
  const app = createService('identity', { repository: repository(), auth });
  t.after(() => app.close());
  app.post('/v1/tenant', async () => {
    calls++;
    return { ok: true };
  });
  const denied = await app.inject({
    method: 'POST',
    url: '/v1/tenant',
    headers: { authorization: 'Bearer client' },
  });
  assert.equal(denied.statusCode, 403);
  assert.equal(calls, 0);
  const allowed = await app.inject({
    method: 'POST',
    url: '/v1/tenant',
    headers: { authorization: 'Bearer admin' },
  });
  assert.equal(allowed.statusCode, 200);
  assert.equal(calls, 1);
  const unreviewed = createService('identity', { repository: repository(), auth });
  t.after(() => unreviewed.close());
  assert.throws(() => unreviewed.get('/v1/unreviewed', async () => ({})), /no reviewed permission/);
});

test('S03 signed future-issued tokens and cookie-only identities are rejected', async (t) => {
  const secret = 'synthetic-test-signing-value-at-least-32-bytes';
  const env = {
    NODE_ENV: 'test',
    AUTH_MODE: 'dev-hs256',
    DEV_JWT_SECRET: secret,
    OIDC_ISSUER: 'https://issuer.example.test',
    OIDC_AUDIENCE: 'elvorance-api',
  };
  const verifier = authFromEnv(env);
  const app = createIdentity({ repository: repository(), auth: verifier });
  t.after(() => app.close());
  const issue = (iat: number) =>
    new SignJWT({ tenant_id: 'tenant-a', roles: ['admin'] })
      .setSubject('signed-test-user')
      .setIssuer(env.OIDC_ISSUER)
      .setAudience(env.OIDC_AUDIENCE)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(iat)
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(secret));
  const now = Math.floor(Date.now() / 1000);
  const valid = await issue(now);
  const future = await issue(now + 3600);
  for (const [value, status] of [
    [valid, 200],
    [future, 401],
  ] as const) {
    const result = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${value}` },
    });
    assert.equal(result.statusCode, status);
  }
  const cookie = await app.inject({
    method: 'GET',
    url: '/v1/me',
    headers: { cookie: `session=${valid}` },
  });
  assert.equal(cookie.statusCode, 401);
});

test('S03 CORS denies disallowed mutation origins before upstream work; bearer native and exact web origins work', async (t) => {
  let forwarded = 0;
  const app = createGateway({
    auth,
    upstreams,
    allowedOrigins: ['https://portal.example.test'],
    fetcher: async () => {
      forwarded++;
      return new Response('{}', { headers: { 'content-type': 'application/json' } });
    },
  });
  t.after(() => app.close());
  for (const origin of [
    'https://evil.example.test',
    'null',
    'https://portal.example.test.evil.test',
  ]) {
    const denied = await app.inject({
      method: 'POST',
      url: '/v1/identity/tenant',
      headers: { authorization: 'Bearer admin', origin },
      payload: { name: 'should not mutate' },
    });
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.headers['access-control-allow-origin'], undefined);
  }
  assert.equal(forwarded, 0);
  const preflight = await app.inject({
    method: 'OPTIONS',
    url: '/v1/identity/tenant',
    headers: { origin: 'https://portal.example.test', 'access-control-request-method': 'POST' },
  });
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers['access-control-allow-credentials'], undefined);
  assert.equal(forwarded, 0);
  for (const origin of [undefined, 'https://portal.example.test']) {
    const allowed = await app.inject({
      method: 'POST',
      url: '/v1/identity/tenant',
      headers: { authorization: 'Bearer admin', ...(origin ? { origin } : {}) },
      payload: { name: 'test' },
    });
    assert.equal(allowed.statusCode, 200);
    assert.equal(allowed.headers['cache-control'], 'no-store');
  }
  assert.equal(forwarded, 2);
});

test('S03 gateway limits verified subjects and socket addresses, not forged forwarding headers', async (t) => {
  let now = 0,
    forwarded = 0;
  const app = createGateway({
    auth,
    upstreams,
    requestLimits: { perIp: 3, perPrincipal: 1, windowMs: 1000, now: () => now },
    fetcher: async () => {
      forwarded++;
      return new Response('{}', { headers: { 'content-type': 'application/json' } });
    },
  });
  t.after(() => app.close());
  const send = (token: string, remoteAddress: string, spoof: string) =>
    app.inject({
      method: 'GET',
      url: '/v1/identity/me',
      remoteAddress,
      headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': spoof, 'x-tenant-id': spoof },
    });
  assert.equal((await send('admin', '192.0.2.1', 'one')).statusCode, 200);
  const limited = await send('admin', '192.0.2.2', 'two');
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers['retry-after'], '1');
  assert.equal((await send('outsider', '192.0.2.2', 'three')).statusCode, 200);
  assert.equal((await send('missing', '192.0.2.2', 'four')).statusCode, 401);
  assert.equal((await send('rep', '192.0.2.2', 'five')).statusCode, 429);
  assert.equal(forwarded, 2);
  now = 1001;
  assert.equal((await send('admin', '192.0.2.2', 'six')).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/health' })).statusCode, 200);
});

test('S03 sensitive-operation audit records allowed, denied and anonymous attempts without request contents', async (t) => {
  const events: SecurityAuditEvent[] = [];
  const app = createIdentity({
    repository: repository(),
    auth,
    auditObserver: (event) => {
      events.push(event);
    },
  });
  t.after(() => app.close());
  for (const token of ['admin', 'client', 'missing']) {
    await app.inject({
      method: 'POST',
      url: '/v1/tenant?private=never-log-query',
      headers: {
        authorization: `Bearer ${token}`,
        cookie: 'never-log-cookie',
        'idempotency-key': 's03-audit-intent',
        'x-request-id': 'never-log-untrusted-request-id',
      },
      payload: { name: 'never-log-business-content' },
    });
  }
  assert.deepEqual(
    events.map((event) => event.statusCode),
    [200, 403, 401],
  );
  assert.deepEqual(
    events.map((event) => event.outcome),
    ['allowed', 'denied', 'denied'],
  );
  const accepted = events.at(0),
    anonymous = events.at(2);
  assert.ok(accepted && anonymous);
  assert.equal(accepted.actorId, 'admin-a');
  assert.equal(accepted.tenantId, 'tenant-a');
  assert.equal(anonymous.actorId, null);
  assert.ok(events.every((event) => event.route === '/v1/tenant' && Object.isFrozen(event)));
  const serialized = JSON.stringify(events);
  for (const forbiddenText of [
    'never-log',
    'Bearer ',
    'cookie',
    'authorization',
    'idempotency-key',
  ])
    assert.equal(serialized.includes(forbiddenText), false);
  await app.inject({ method: 'GET', url: '/health' });
  assert.equal(events.length, 3);
});

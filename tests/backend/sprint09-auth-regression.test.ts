import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { authFromEnv, MemoryRepository, principalFromClaims } from '@elvorance/service-kit';
import { createApp as identityApp } from '../../services/identity/src/app.ts';
import { createApp as gatewayApp } from '../../services/api-gateway/src/app.ts';
import { tables } from '../../services/identity/src/infrastructure/migrations/001_initial.ts';
import type { Upstreams } from '../../services/api-gateway/src/domain/routes.ts';

const issuer = 'https://sprint09.invalid/issuer';
const audience = 'elvorance-api';
const claims = { sub: 's09-user', tenant_id: 's09-tenant', roles: [] };
const unauthorized = (error: unknown): boolean =>
  error instanceof Error && 'statusCode' in error && error.statusCode === 401;

// Positive controls are deliberately independent from the rejection expectations.
test('S09: all six legitimate application roles still establish scoped principals', () => {
  for (const role of ['admin', 'rep', 'client', 'finance', 'delivery', 'support']) {
    const result = principalFromClaims({
      ...claims,
      roles: [role],
      rep_id: 's09-rep',
      client_id: 's09-client',
    });
    assert.deepEqual(result.roles, [role]);
    assert.equal(result.tenantId, 's09-tenant');
  }
});

test('S09: an empty roles array is not an authenticated application principal', () => {
  assert.throws(() => principalFromClaims(claims), unauthorized);
});

test('S09: signed roleless tokens receive 401 at both service and gateway without forwarding', async (t) => {
  const secret = randomBytes(48).toString('hex');
  const auth = authFromEnv({
    NODE_ENV: 'test',
    AUTH_MODE: 'dev-hs256',
    DEV_JWT_SECRET: secret,
    OIDC_ISSUER: issuer,
    OIDC_AUDIENCE: audience,
  });
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('2m')
    .sign(new TextEncoder().encode(secret));
  const identity = identityApp({ repository: new MemoryRepository('identity', tables), auth });
  let forwards = 0;
  const upstreams = Object.fromEntries(
    ['identity', 'crm', 'sales', 'delivery', 'billing', 'tracking', 'communications'].map(
      (name) => [name, `https://${name}.s09.invalid`],
    ),
  ) as Upstreams;
  const gateway = gatewayApp({
    auth,
    upstreams,
    fetcher: async () => {
      forwards++;
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  t.after(async () => {
    await gateway.close();
    await identity.close();
  });
  const headers = { authorization: `Bearer ${token}` };
  const direct = await identity.inject({ method: 'GET', url: '/v1/me', headers });
  const proxied = await gateway.inject({ method: 'GET', url: '/v1/identity/me', headers });
  assert.equal(direct.statusCode, 401, 'A signed token without application roles must not read /me');
  assert.equal(proxied.statusCode, 401);
  assert.equal(forwards, 0, 'Gateway must reject before invoking any upstream');
});

test('S09: real RS256 OIDC verification rejects roleless claims and accepts an authorized control', async (t) => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 's09-fixture', use: 'sig', alg: 'RS256' };
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ keys: [jwk] }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  }));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const auth = authFromEnv({
    NODE_ENV: 'test', AUTH_MODE: 'oidc', OIDC_ISSUER: issuer, OIDC_AUDIENCE: audience,
    OIDC_JWKS_URL: `http://127.0.0.1:${address.port}/jwks`,
  });
  async function sign(roles: string[]): Promise<string> {
    return new SignJWT({ ...claims, roles })
      .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
      .setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime('2m').sign(privateKey);
  }
  assert.deepEqual((await auth(`Bearer ${await sign(['admin'])}`)).roles, ['admin']);
  await assert.rejects(auth(`Bearer ${await sign([])}`), unauthorized);
});

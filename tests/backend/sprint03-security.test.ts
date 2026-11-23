import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import inventory from '@elvorance/contracts/routes' with { type: 'json' };
import { roles, type Principal } from '@elvorance/contracts';
import {
  AppError,
  MemoryRepository,
  RequestLimits,
  authFromEnv,
  createService,
  requireRoutePermission,
  routeRoles,
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

test('S03 reviewed matrix: every operation accepts exactly its declared roles; no role denies', () => {
  assert.equal(inventory.length, 84);
  let decisions = 0;
  for (const entry of inventory) {
    const path = entry.servicePath.replace(/\{([^}]+)\}/g, ':$1');
    for (const role of roles) {
      const principal: Principal = { sub: 'matrix-user', tenantId: 'matrix-tenant', roles: [role] };
      const check = () => requireRoutePermission(entry.service, entry.method, path, principal);
      if (entry.roles.includes(role)) assert.doesNotThrow(check);
      else assert.throws(check, forbidden);
      decisions++;
    }
    assert.throws(
      () =>
        requireRoutePermission(entry.service, entry.method, path, {
          sub: 'matrix-user',
          tenantId: 'matrix-tenant',
          roles: [],
        }),
      forbidden,
    );
    decisions++;
    if (entry.method === 'GET')
      assert.deepEqual(
        routeRoles(entry.service, 'HEAD', path),
        routeRoles(entry.service, 'GET', path),
      );
  }
  assert.equal(decisions, 588);
});

test('S03 request budgets separate tenant tuples and fail closed at bounded capacity without evicting active limits', () => {
  let now = 0;
  const limits = new RequestLimits({
    maxKeys: 2,
    perPrincipal: 1,
    perIp: 1,
    windowMs: 1000,
    now: () => now,
  });
  limits.principal('a:b', 'c');
  limits.principal('a', 'b:c');
  assert.throws(
    () => limits.ip('192.0.2.9'),
    (error: unknown) => error instanceof AppError && error.statusCode === 429,
  );
  assert.throws(() => limits.principal('a:b', 'c'));
  now = 1001;
  assert.doesNotThrow(() => limits.ip('192.0.2.9'));
  for (const invalid of [0, -1, NaN, Infinity, 1.5])
    assert.throws(() => new RequestLimits({ perIp: invalid }), /Invalid request limit/);
});

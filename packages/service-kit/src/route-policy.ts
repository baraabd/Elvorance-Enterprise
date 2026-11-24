import inventory from '@elvorance/contracts/routes' with { type: 'json' };
import { roles, type Principal, type Role } from '@elvorance/contracts';
import { assert } from './errors.ts';

/** The existing API inventory is the coarse role policy; domain ownership checks still apply. */
const permissions = new Map<string, readonly Role[]>();
for (const entry of inventory) {
  const path = entry.servicePath.replace(/\{([^}]+)\}/g, ':$1');
  const key = `${entry.service}:${entry.method}:${path}`;
  assert(!permissions.has(key), 'CONFIGURATION', 'Duplicate route permission', 500);
  assert(
    entry.roles.length > 0 && entry.roles.every((role) => roles.includes(role as Role)),
    'CONFIGURATION',
    'Invalid route permission',
    500,
  );
  permissions.set(key, Object.freeze([...entry.roles] as Role[]));
}
export function routeRoles(service: string, method: string, path: string): readonly Role[] {
  const allowed = permissions.get(`${service}:${method === 'HEAD' ? 'GET' : method}:${path}`);
  assert(allowed, 'CONFIGURATION', 'API route has no reviewed permission policy', 500);
  return allowed;
}
export function requireRoutePermission(
  service: string,
  method: string,
  path: string,
  principal: Principal,
): void {
  assert(
    routeRoles(service, method, path).some((role) => principal.roles.includes(role)),
    'FORBIDDEN',
    'Your role cannot perform this operation',
    403,
  );
}

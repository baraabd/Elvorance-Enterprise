import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { roles, type Principal, type Role } from '@elvorance/contracts';
import { AppError, assert } from './errors.ts';
export type AuthVerifier = (authorization: string | undefined) => Promise<Principal>;
export function principalFromClaims(claims: JWTPayload): Principal {
  if (claims.iat !== undefined)
    assert(
      typeof claims.iat === 'number' &&
        Number.isFinite(claims.iat) &&
        claims.iat <= Date.now() / 1000 + 5,
      'INVALID_TOKEN',
      'Token issuance time is invalid',
      401,
    );
  assert(
    typeof claims.sub === 'string' && claims.sub.length > 0 && claims.sub.length <= 512,
    'INVALID_TOKEN',
    'Token subject is missing',
    401,
  );
  assert(
    typeof claims.tenant_id === 'string' && /^[\w-]{1,100}$/.test(claims.tenant_id),
    'INVALID_TOKEN',
    'Token tenant claim is missing or invalid',
    401,
  );
  assert(
    Array.isArray(claims.roles) &&
      claims.roles.every((role) => typeof role === 'string' && roles.includes(role as Role)),
    'INVALID_TOKEN',
    'Token roles are invalid',
    401,
  );
  const principal: Principal = {
    sub: claims.sub,
    tenantId: claims.tenant_id,
    roles: claims.roles as Role[],
  };
  if (typeof claims.rep_id === 'string' && claims.rep_id.length) principal.repId = claims.rep_id;
  if (typeof claims.client_id === 'string' && claims.client_id.length)
    principal.clientId = claims.client_id;
  assert(
    !principal.roles.includes('rep') || principal.repId,
    'INVALID_TOKEN',
    'A representative token requires rep_id',
    401,
  );
  assert(
    !principal.roles.includes('client') || principal.clientId,
    'INVALID_TOKEN',
    'A customer token requires client_id',
    401,
  );
  return principal;
}
export function authFromEnv(env: NodeJS.ProcessEnv = process.env): AuthVerifier {
  const mode = env.AUTH_MODE ?? 'oidc';
  const issuer = env.OIDC_ISSUER;
  const audience = env.OIDC_AUDIENCE;
  assert(issuer && audience, 'CONFIGURATION', 'OIDC_ISSUER and OIDC_AUDIENCE are required', 500);
  if (mode === 'dev-hs256') {
    assert(
      env.NODE_ENV !== 'production',
      'CONFIGURATION',
      'Development HS256 tokens are forbidden in production',
      500,
    );
    assert(
      env.DEV_JWT_SECRET && env.DEV_JWT_SECRET.length >= 32,
      'CONFIGURATION',
      'DEV_JWT_SECRET must contain at least 32 characters',
      500,
    );
    const secret = new TextEncoder().encode(env.DEV_JWT_SECRET);
    return async (authorization) => {
      try {
        return principalFromClaims(
          (
            await jwtVerify(bearer(authorization), secret, {
              issuer,
              audience,
              algorithms: ['HS256'],
              requiredClaims: ['exp', 'iat', 'sub', 'tenant_id', 'roles'],
              clockTolerance: 5,
            })
          ).payload,
        );
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(401, 'INVALID_TOKEN', 'Bearer token is invalid or expired');
      }
    };
  }
  assert(
    mode === 'oidc' && env.OIDC_JWKS_URL,
    'CONFIGURATION',
    'AUTH_MODE must be oidc and OIDC_JWKS_URL must be configured',
    500,
  );
  const url = new URL(env.OIDC_JWKS_URL);
  assert(
    url.protocol === 'https:' ||
      (env.NODE_ENV !== 'production' &&
        ['localhost', '127.0.0.1', 'keycloak'].includes(url.hostname)),
    'CONFIGURATION',
    'OIDC JWKS requires HTTPS outside local development',
    500,
  );
  const keySet = createRemoteJWKSet(url, { timeoutDuration: 5000 });
  return async (authorization) => {
    try {
      return principalFromClaims(
        (
          await jwtVerify(bearer(authorization), keySet, {
            issuer,
            audience,
            algorithms: ['RS256', 'ES256'],
            requiredClaims: ['exp', 'iat', 'sub', 'tenant_id', 'roles'],
            clockTolerance: 5,
          })
        ).payload,
      );
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(401, 'INVALID_TOKEN', 'Bearer token is invalid or expired');
    }
  };
}
export function bearer(authorization: string | undefined): string {
  assert(
    authorization && /^Bearer [^\s]+$/.test(authorization),
    'UNAUTHENTICATED',
    'A Bearer access token is required',
    401,
  );
  return authorization.slice(7);
}
export const hasRole = (principal: Principal, ...allowed: Role[]): boolean =>
  allowed.some((role) => principal.roles.includes(role));
export function requireRole(principal: Principal, ...allowed: Role[]): void {
  assert(
    hasRole(principal, ...allowed),
    'FORBIDDEN',
    'Your role cannot perform this operation',
    403,
  );
}
export function isOwner(
  principal: Principal,
  resource: { clientId?: string | null; repId?: string | null },
  privileged: Role[] = ['admin'],
): boolean {
  return (
    hasRole(principal, ...privileged) ||
    (hasRole(principal, 'client') &&
      Boolean(principal.clientId) &&
      principal.clientId === resource.clientId) ||
    (hasRole(principal, 'rep') && Boolean(principal.repId) && principal.repId === resource.repId)
  );
}
export function requireOwner(
  principal: Principal,
  resource: { clientId?: string | null; repId?: string | null },
  privileged: Role[] = ['admin'],
): void {
  assert(isOwner(principal, resource, privileged), 'NOT_FOUND', 'Resource was not found', 404);
}

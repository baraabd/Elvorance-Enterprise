// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/** Read-only development probe. The token remains in memory and is never printed. */
export async function smoke({ baseUrl, secret, issuer, audience, fetcher = fetch }) {
  const base = new URL(baseUrl);
  if (
    base.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) ||
    base.username ||
    base.password
  )
    throw new Error('This HS256 development probe is restricted to a loopback HTTP gateway.');
  if (!secret || secret.length < 32 || !issuer || !audience)
    throw new Error(
      'Configure development JWT secret, issuer and audience before running the probe.',
    );
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const claims = {
    sub: 'elvorance-local-smoke-admin',
    tenant_id: 'elvorance-local-smoke',
    roles: ['admin'],
    iss: issuer,
    aud: audience,
    iat: now,
    exp: now + 300,
  };
  const input = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`;
  const token = `${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`;
  const results = [];
  async function check(path, expected, authorized = true, validate = () => true) {
    const response = await fetcher(new URL(path, base), {
      headers: authorized ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });
    const body = await response.json();
    if (response.status !== expected || !validate(body))
      throw new Error(
        `Probe failed for ${path}: HTTP ${response.status}; expected ${expected} and the documented response shape.`,
      );
    results.push({ path, status: response.status, passed: true });
  }
  await check(
    '/health',
    200,
    false,
    (body) => body.service === 'api-gateway' && body.status === 'alive',
  );
  await check('/v1/identity/me', 401, false);
  await check(
    '/v1/identity/me',
    200,
    true,
    (body) =>
      body.principal?.sub === claims.sub &&
      body.principal?.tenantId === claims.tenant_id &&
      body.principal?.roles?.includes('admin'),
  );
  for (const path of [
    '/v1/crm/customers',
    '/v1/sales/quotes',
    '/v1/delivery/projects',
    '/v1/billing/invoices',
    '/v1/tracking/latest',
    '/v1/communications/notifications',
  ])
    await check(path, 200, true, (body) => Array.isArray(body.items));
  return {
    passed: results.length,
    failed: 0,
    scope:
      'Read-only loopback development gateway authentication and seven domain reads; no UI, writes, events, real GPS, payment collection or production identity proof.',
    results,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const envFile = fileURLToPath(new URL('./.env', import.meta.url));
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  if (process.env.AUTH_MODE !== 'dev-hs256')
    throw new Error('This probe only supports the explicit local dev-hs256 mode.');
  try {
    const result = await smoke({
      baseUrl: `http://127.0.0.1:${process.env.GATEWAY_PORT || 3000}`,
      secret: process.env.DEV_JWT_SECRET,
      issuer: process.env.OIDC_ISSUER,
      audience: process.env.OIDC_AUDIENCE,
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

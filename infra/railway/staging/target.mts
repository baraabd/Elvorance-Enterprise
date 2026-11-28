/** Exact, non-production deployment boundary. No secrets belong in this file. */
export const stagingTarget = Object.freeze({
  projectId: '075e27d5-8edc-4ddd-8f27-a5eea3ef5d5a',
  environmentId: '49c49479-0810-491c-99cb-fc52ca547c04',
  identityOrigin: 'https://keycloak-staging-1abfa6e3.up.railway.app',
  gatewayOrigin: 'https://api-gateway-staging-46ce4994.up.railway.app',
  web: {
    admin: 'https://admin-web-staging-61f0781c.up.railway.app',
    client: 'https://client-web-staging-5c7b09cf.up.railway.app',
    rep: 'https://rep-web-staging.up.railway.app',
  },
});
export const domains = [
  'identity',
  'crm',
  'sales',
  'delivery',
  'billing',
  'tracking',
  'communications',
] as const;
export type Domain = (typeof domains)[number];
export function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export function requiredValue<T>(value: T | null | undefined, message: string): T {
  ensure(value !== null && value !== undefined, message);
  return value;
}
export function assertStaging(env: NodeJS.ProcessEnv = process.env): void {
  ensure(
    env.RAILWAY_PROJECT_ID === stagingTarget.projectId,
    'Wrong project: staging operations refused.',
  );
  ensure(
    env.RAILWAY_ENVIRONMENT_ID === stagingTarget.environmentId,
    'Wrong environment: staging operations refused.',
  );
  ensure(env.ELVORANCE_ENVIRONMENT === 'staging', 'Explicit staging environment required.');
  ensure(
    env.STAGING_OPERATION === 'bootstrap' ||
      env.STAGING_OPERATION === 'acceptance' ||
      env.STAGING_OPERATION === 'backup-restore',
    'Unknown staging operation.',
  );
  ensure(env.KEYCLOAK_BASE_URL === stagingTarget.identityOrigin, 'Unexpected identity origin.');
}
export function ownedName(service: Domain): string {
  return `elvorance_stg_${service}`;
}
export function identifier(value: string): string {
  ensure(/^[a-z][a-z0-9_]{0,62}$/.test(value), 'Unsafe SQL identifier.');
  return `"${value}"`;
}
export function privateDatabaseUrl(value: string, expectedDatabase?: string): URL {
  const url = new URL(value);
  ensure(
    ['postgres:', 'postgresql:'].includes(url.protocol) &&
      url.hostname.endsWith('.railway.internal') &&
      url.port === '5432',
    'Database operations require the private staging PostgreSQL endpoint.',
  );
  ensure(!url.hash && !url.search, 'Unexpected PostgreSQL URL options.');
  if (expectedDatabase) ensure(url.pathname === `/${expectedDatabase}`, 'Wrong owned database.');
  return url;
}
export function sourceRevision(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.RAILWAY_GIT_COMMIT_SHA ?? env.SOURCE_REVISION ?? '';
  ensure(
    /^[a-f0-9]{40}$/.test(value),
    'An exact source revision is required for deployment evidence.',
  );
  return value;
}

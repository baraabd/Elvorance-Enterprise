/** Exact deployment allowlist. Names are not proof of isolation; platform IDs are mandatory. */
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
export const stagingDomains = [
  'identity',
  'crm',
  'sales',
  'delivery',
  'billing',
  'tracking',
  'communications',
] as const;
export type StagingDomain = (typeof stagingDomains)[number];
function check(value: unknown, key: string): asserts value {
  if (!value) throw new Error(`Staging boundary rejected ${key}`);
}
function url(value: string | undefined, key: string): URL {
  try {
    return new URL(value ?? '');
  } catch {
    throw new Error(`Staging boundary rejected ${key}`);
  }
}
/** Every Railway process fails closed outside the approved staging project. Local CI is unchanged. */
export function assertRuntimeStaging(service: string, env: NodeJS.ProcessEnv = process.env): void {
  if (
    !env.RAILWAY_PROJECT_ID &&
    !env.RAILWAY_ENVIRONMENT_ID &&
    env.ELVORANCE_ENVIRONMENT !== 'staging'
  )
    return;
  check(env.RAILWAY_PROJECT_ID === stagingTarget.projectId, 'project');
  check(env.RAILWAY_ENVIRONMENT_ID === stagingTarget.environmentId, 'environment ID');
  check(
    env.ELVORANCE_ENVIRONMENT === 'staging' && env.NODE_ENV === 'production',
    'environment markers',
  );
  check(
    /^[a-f0-9]{40}$/.test(env.RAILWAY_GIT_COMMIT_SHA ?? env.SOURCE_REVISION ?? ''),
    'source revision',
  );
  check(env.AUTH_MODE === 'oidc', 'authentication mode');
  const issuer = stagingTarget.identityOrigin + '/realms/elvorance-staging';
  check(env.OIDC_ISSUER === issuer, 'issuer');
  check(env.OIDC_JWKS_URL === issuer + '/protocol/openid-connect/certs', 'JWKS');
  check(env.OIDC_AUDIENCE === 'elvorance-api-staging', 'audience');
  if (service === 'api-gateway') {
    for (const [index, name] of stagingDomains.entries()) {
      check(
        env[`${name.toUpperCase()}_URL`] === `http://${name}.railway.internal:${3001 + index}`,
        `${name} upstream`,
      );
    }
    const origins = (env.CORS_ORIGINS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const allowed: string[] = Object.values(stagingTarget.web);
    check(
      origins.length > 0 &&
        new Set(origins).size === origins.length &&
        origins.every((origin) => allowed.includes(origin)),
      'CORS origins',
    );
    return;
  }
  check(
    stagingDomains.some((name) => name === service),
    'service name',
  );
  const database = url(env.DATABASE_URL, 'database URL');
  check(
    ['postgres:', 'postgresql:'].includes(database.protocol) &&
      database.hostname === 'postgres.railway.internal' &&
      database.port === '5432',
    'database endpoint',
  );
  const owner = `elvorance_stg_${service}`;
  check(
    database.pathname === `/${owner}` &&
      decodeURIComponent(database.username) === owner &&
      Boolean(database.password),
    'database ownership',
  );
  check(!database.search && !database.hash, 'database URL options');
  const broker = url(env.RABBITMQ_URL, 'broker URL');
  check(
    broker.protocol === 'amqp:' &&
      broker.hostname === 'rabbitmq.railway.internal' &&
      broker.port === '5672',
    'private broker endpoint',
  );
  check(
    decodeURIComponent(broker.pathname) === '/elvorance-staging' &&
      decodeURIComponent(broker.username) === 'elvorance_staging' &&
      Boolean(broker.password),
    'broker identity',
  );
  check(!broker.search && !broker.hash, 'broker URL options');
  check(env.AUTO_MIGRATE !== 'true', 'automatic schema mutation');
}

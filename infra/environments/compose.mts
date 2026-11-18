import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  domains,
  services,
  ports,
  validateEnvironment,
  type EnvironmentSpec,
  type ServiceName,
} from './topology.mts';

const root = fileURLToPath(new URL('../../', import.meta.url));
export function composeEnvironment(spec: EnvironmentSpec) {
  validateEnvironment(spec);
  if (!isAbsolute(spec.secretsDirectory))
    throw new Error('secretsDirectory must be an absolute directory outside the repository.');
  const name = `elvorance-${spec.environment}`;
  const common = {
    NODE_ENV: 'production',
    APP_ENV: spec.environment,
    HOST: '0.0.0.0',
    AUTH_MODE: 'oidc',
    OIDC_ISSUER: spec.issuer,
    OIDC_AUDIENCE: `elvorance-api-${spec.environment}`,
    OIDC_JWKS_URL: `${spec.issuer}/protocol/openid-connect/certs`,
    AUTO_MIGRATE: 'false',
  };
  const secretNames = [
    'postgres_admin_password',
    'oidc_database_password',
    'oidc_admin_password',
    'rabbitmq_password',
    'rabbitmq_url',
    ...domains.flatMap((domain) => [`${domain}_db_password`, `${domain}_database_url`]),
  ];
  const runtime = (service: ServiceName) => ({
    image: spec.images[service],
    init: true,
    read_only: true,
    tmpfs: ['/tmp'],
    cap_drop: ['ALL'],
    security_opt: ['no-new-privileges:true'],
    restart: 'unless-stopped',
    networks: service === 'api-gateway' ? ['mesh'] : ['mesh', 'data'],
    labels: {
      'org.opencontainers.image.revision': spec.sourceRevision,
      'com.elvorance.environment': spec.environment,
    },
    healthcheck: {
      test: [
        'CMD',
        'node',
        '-e',
        "fetch('http://127.0.0.1:'+process.env.PORT+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
      ],
      interval: '15s',
      timeout: '5s',
      retries: 10,
      start_period: '30s',
    },
    environment: {
      ...common,
      SERVICE_NAME: service,
      PORT: String(ports[service]),
      ...(service === 'api-gateway'
        ? {
            CORS_ORIGINS: 'https://localhost,capacitor://localhost',
            ...Object.fromEntries(
              domains.map((domain) => [
                `${domain.toUpperCase()}_URL`,
                `http://${domain}:${ports[domain]}`,
              ]),
            ),
          }
        : {
            DATABASE_URL_FILE: `/run/secrets/${service}_database_url`,
            RABBITMQ_URL_FILE: '/run/secrets/rabbitmq_url',
            ...(['sales', 'communications'].includes(service)
              ? { CRM_URL: `http://crm:${ports.crm}` }
              : {}),
          }),
    },
    ...(service === 'api-gateway' ? {} : { secrets: [`${service}_database_url`, 'rabbitmq_url'] }),
  });
  const entries: Record<string, unknown> = {
    postgres: {
      image: spec.images.postgres,
      restart: 'unless-stopped',
      networks: ['data'],
      environment: {
        POSTGRES_USER: 'postgres',
        POSTGRES_DB: 'postgres',
        POSTGRES_PASSWORD_FILE: '/run/secrets/postgres_admin_password',
        ...Object.fromEntries(
          domains.map((domain) => [
            `${domain.toUpperCase()}_DB_PASSWORD_FILE`,
            `/run/secrets/${domain}_db_password`,
          ]),
        ),
      },
      secrets: ['postgres_admin_password', ...domains.map((domain) => `${domain}_db_password`)],
      volumes: [
        'domain-data:/var/lib/postgresql/data',
        `${resolve(root, 'infra/compose/postgres/010-service-databases.sh')}:/docker-entrypoint-initdb.d/010-service-databases.sh:ro`,
        `${resolve(root, 'infra/compose/postgres/check-isolation.sh')}:/opt/elvorance/check-isolation.sh:ro`,
      ],
      healthcheck: {
        test: ['CMD-SHELL', 'pg_isready -U postgres -d postgres'],
        interval: '5s',
        timeout: '5s',
        retries: 20,
      },
    },
    'oidc-postgres': {
      image: spec.images.postgres,
      restart: 'unless-stopped',
      networks: ['identity-data'],
      environment: {
        POSTGRES_USER: 'keycloak',
        POSTGRES_DB: 'keycloak',
        POSTGRES_PASSWORD_FILE: '/run/secrets/oidc_database_password',
      },
      secrets: ['oidc_database_password'],
      volumes: ['identity-data:/var/lib/postgresql/data'],
      healthcheck: {
        test: ['CMD-SHELL', 'pg_isready -U keycloak -d keycloak'],
        interval: '5s',
        timeout: '5s',
        retries: 20,
      },
    },
    rabbitmq: {
      image: spec.images.rabbitmq,
      restart: 'unless-stopped',
      networks: ['mesh'],
      environment: {
        RABBITMQ_DEFAULT_USER: 'elvorance',
        RABBITMQ_DEFAULT_VHOST: name,
        RABBITMQ_DEFAULT_PASS_FILE: '/run/secrets/rabbitmq_password',
      },
      secrets: ['rabbitmq_password'],
      volumes: [
        'events-data:/var/lib/rabbitmq',
        `${resolve(root, 'infra/docker/rabbitmq-secret-entrypoint.sh')}:/opt/elvorance/rabbitmq-entrypoint.sh:ro`,
      ],
      entrypoint: ['/bin/sh', '/opt/elvorance/rabbitmq-entrypoint.sh'],
      command: ['rabbitmq-server'],
      healthcheck: {
        test: ['CMD', 'rabbitmq-diagnostics', '-q', 'ping'],
        interval: '10s',
        timeout: '5s',
        retries: 20,
      },
    },
    keycloak: {
      image: spec.images.keycloak,
      restart: 'unless-stopped',
      networks: ['mesh', 'identity-data'],
      depends_on: { 'oidc-postgres': { condition: 'service_healthy' } },
      environment: {
        KC_DB: 'postgres',
        KC_DB_URL: 'jdbc:postgresql://oidc-postgres:5432/keycloak',
        KC_DB_USERNAME: 'keycloak',
        KC_HOSTNAME: new URL(spec.issuer).origin,
        KC_HTTP_ENABLED: 'true',
        KC_PROXY_HEADERS: 'xforwarded',
        KC_HOSTNAME_STRICT: 'true',
        KC_HEALTH_ENABLED: 'true',
        KC_METRICS_ENABLED: 'true',
        KC_BOOTSTRAP_ADMIN_USERNAME: 'bootstrap-admin',
      },
      secrets: ['oidc_database_password', 'oidc_admin_password'],
      volumes: [
        `${resolve(root, 'infra/environments/keycloak-entrypoint.sh')}:/opt/elvorance/keycloak-entrypoint.sh:ro`,
      ],
      entrypoint: ['/bin/bash', '/opt/elvorance/keycloak-entrypoint.sh'],
    },
    edge: {
      image: spec.images.edge,
      restart: 'unless-stopped',
      networks: ['mesh'],
      ports: ['80:80', '443:443'],
      environment: {
        API_HOST: new URL(spec.gatewayOrigin).hostname,
        AUTH_HOST: new URL(spec.issuer).hostname,
      },
      volumes: [
        `${resolve(root, 'infra/environments/Caddyfile')}:/etc/caddy/Caddyfile:ro`,
        'tls-data:/data',
        'tls-config:/config',
      ],
    },
  };
  for (const service of domains) {
    entries[`${service}-migrate`] = {
      ...runtime(service),
      restart: 'no',
      command: ['--migrate-only'],
      healthcheck: { disable: true },
      depends_on: { postgres: { condition: 'service_healthy' } },
    };
    entries[service] = {
      ...runtime(service),
      depends_on: {
        [`${service}-migrate`]: { condition: 'service_completed_successfully' },
        rabbitmq: { condition: 'service_healthy' },
      },
    };
  }
  entries['api-gateway'] = {
    ...runtime('api-gateway'),
    depends_on: Object.fromEntries(
      domains.map((domain) => [domain, { condition: 'service_healthy' }]),
    ),
  };
  return {
    name,
    services: entries,
    secrets: Object.fromEntries(
      secretNames.map((secret) => [secret, { file: resolve(spec.secretsDirectory, secret) }]),
    ),
    volumes: Object.fromEntries(
      ['domain-data', 'identity-data', 'events-data', 'tls-data', 'tls-config'].map((volume) => [
        volume,
        { name: `${name}-${volume}` },
      ]),
    ),
    networks: {
      mesh: { name: `${name}-mesh` },
      data: { internal: true, name: `${name}-data` },
      'identity-data': { internal: true, name: `${name}-identity-data` },
    },
  };
}

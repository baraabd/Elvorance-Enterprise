import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { composeEnvironment } from '../../infra/environments/compose.mts';
import { services, type EnvironmentSpec } from '../../infra/environments/topology.mts';

function fixture(environment: EnvironmentSpec['environment']): EnvironmentSpec {
  return {
    environment,
    sourceRevision: 'a'.repeat(40),
    gatewayOrigin: `https://${environment}.elvorance.dev`,
    issuer: `https://${environment}-identity.elvorance.dev/realms/elvorance-${environment}`,
    secretsDirectory: resolve(realpathSync(tmpdir()), 'elvorance-test-fixture-secrets'),
    images: Object.fromEntries(
      [...services, 'postgres', 'rabbitmq', 'keycloak', 'edge'].map((name) => [
        name,
        `registry.test/${name}@sha256:${'b'.repeat(64)}`,
      ]),
    ) as EnvironmentSpec['images'],
  };
}
test('environment topology isolates identity, domain data, event volumes and all network ingress', () => {
  const staging = composeEnvironment(fixture('staging'));
  const production = composeEnvironment(fixture('production'));
  assert.notEqual(staging.name, production.name);
  for (const name of Object.keys(staging.volumes))
    assert.notEqual(staging.volumes[name]!.name, production.volumes[name]!.name);
  for (const [name, raw] of Object.entries(staging.services)) {
    const service = raw as {
      ports?: string[];
      environment?: Record<string, string>;
      depends_on?: object;
    };
    if (name !== 'edge')
      assert.equal(service.ports, undefined, `${name} must have no public ingress`);
    if (services.includes(name as (typeof services)[number])) {
      assert.equal(service.environment?.AUTH_MODE, 'oidc');
      assert.equal(service.environment?.NODE_ENV, 'production');
      assert.equal(service.environment?.OIDC_AUDIENCE, 'elvorance-api-staging');
      if (name !== 'api-gateway')
        assert.equal(service.environment?.DATABASE_URL_FILE, `/run/secrets/${name}_database_url`);
    }
  }
  assert.throws(
    () =>
      composeEnvironment({
        ...fixture('staging'),
        images: { ...fixture('staging').images, crm: 'crm:latest' },
      }),
    /immutable image/,
  );
  assert.throws(
    () =>
      composeEnvironment({
        ...fixture('staging'),
        issuer: 'https://id.elvorance.dev/realms/elvorance-production',
      }),
    /realm/,
  );
});

test('persistent services use explicit PGDATA, completed bootstrap and stable broker identity', () => {
  const topology = composeEnvironment(fixture('staging'));
  for (const [name, volume] of [
    ['postgres', 'domain-data'],
    ['oidc-postgres', 'identity-data'],
  ] as const) {
    const service = topology.services[name] as {
      environment: Record<string, string>;
      volumes: string[];
      healthcheck: { test: string[] };
    };
    assert.equal(service.environment.PGDATA, '/var/lib/postgresql/elvorance');
    assert.ok(service.volumes.includes(`${volume}:/var/lib/postgresql`));
    assert.ok(
      service.healthcheck.test.includes('127.0.0.1'),
      'probe the final TCP server, not the temporary initdb socket',
    );
    for (const bind of service.volumes.filter((entry) => entry.startsWith('/'))) {
      assert.ok(
        existsSync(bind.split(':')[0]!),
        'bootstrap and isolation scripts must resolve to actual source files',
      );
    }
  }
  assert.equal(
    (topology.services.rabbitmq as { hostname: string }).hostname,
    'elvorance-staging-rabbitmq',
  );
  for (const service of services.filter((name) => name !== 'api-gateway')) {
    const migration = topology.services[`${service}-migrate`] as {
      command: string[];
      depends_on: object;
    };
    assert.deepEqual(migration.command, ['--migrate-only']);
    assert.deepEqual(migration.depends_on, { postgres: { condition: 'service_healthy' } });
    const runtime = topology.services[service] as {
      depends_on: Record<string, { condition: string }>;
    };
    assert.equal(
      runtime.depends_on[`${service}-migrate`]?.condition,
      'service_completed_successfully',
    );
  }
});

test('gateway CORS includes only configured exact web origins and fixed native origins', () => {
  const spec = {
    ...fixture('staging'),
    webOrigins: ['https://ADMIN.elvorance.dev:443/', 'https://client.elvorance.dev'],
  };
  const gateway = composeEnvironment(spec).services['api-gateway'] as {
    environment: Record<string, string>;
  };
  assert.equal(
    gateway.environment.CORS_ORIGINS,
    'https://localhost,capacitor://localhost,https://admin.elvorance.dev,https://client.elvorance.dev',
  );
  for (const origin of [
    'https://*.elvorance.dev',
    'http://admin.elvorance.dev',
    'https://admin.elvorance.dev/path',
    'https://admin.elvorance.dev?test=true',
    'https://user:password@admin.elvorance.dev',
  ]) {
    assert.throws(() => composeEnvironment({ ...spec, webOrigins: [origin] }), /HTTPS origins/);
  }
  assert.throws(
    () =>
      composeEnvironment({
        ...spec,
        webOrigins: ['https://admin.elvorance.dev', 'https://ADMIN.elvorance.dev:443/'],
      }),
    /duplicate/,
  );
  assert.throws(
    () => composeEnvironment({ ...spec, gatewayOrigin: 'https://api.elvorance.dev:8443' }),
    /standard edge port/,
  );
});

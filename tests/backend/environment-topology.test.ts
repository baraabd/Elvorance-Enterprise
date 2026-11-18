import test from 'node:test';
import assert from 'node:assert/strict';
import { composeEnvironment } from '../../infra/environments/compose.mts';
import { services, type EnvironmentSpec } from '../../infra/environments/topology.mts';

function fixture(environment: EnvironmentSpec['environment']): EnvironmentSpec {
  return {
    environment,
    sourceRevision: 'a'.repeat(40),
    gatewayOrigin: `https://${environment}.elvorance.dev`,
    issuer: `https://${environment}-identity.elvorance.dev/realms/elvorance-${environment}`,
    secretsDirectory: '/tmp/elvorance-test-fixture-secrets',
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

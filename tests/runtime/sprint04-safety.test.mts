import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { sprint04Faults } from './sprint04-resilience.mts';
const fixture: NodeJS.ProcessEnv = {
  CI: 'true',
  COMPOSE_PROJECT_NAME: 'elvorance-runtime-123-1',
  AUTH_MODE: 'dev-hs256',
  RUNTIME_GATEWAY_URL: 'http://127.0.0.1:23000',
  RABBITMQ_PASSWORD: 'disposable-test-only',
};
test('Sprint 04 destructive failure harness refuses hosted, production, non-CI and remote-Docker targets before invoking Docker', () => {
  const tenant = 'ci-runtime-12345678-1234-1234-1234-123456789012';
  assert.doesNotThrow(() => sprint04Faults(fixture, tenant));
  for (const change of [
    { CI: 'false' },
    { NODE_ENV: 'production' },
    { AUTH_MODE: 'oidc' },
    { COMPOSE_PROJECT_NAME: 'elvorance-production' },
    { RUNTIME_GATEWAY_URL: 'https://api.example.com' },
    { DOCKER_HOST: 'ssh://production.invalid' },
    { DOCKER_CONTEXT: 'production' },
    { RABBITMQ_MANAGEMENT_BIND_HOST: '0.0.0.0' },
    { RABBITMQ_MANAGEMENT_PORT: 'NaN' },
  ])
    assert.throws(() => sprint04Faults({ ...fixture, ...change }, tenant));
  assert.throws(() => sprint04Faults(fixture, 'production-tenant'));
});

// The real Compose journey still verifies routing, duplicate acknowledgements and DLQ delivery.
// This contract regression catches an unsupported HTTP method before spinning up Docker.
test('isolated broker publishing uses RabbitMQ management POST without a permissive fallback', () => {
  const source = readFileSync(new URL('./sprint04-resilience.mts', import.meta.url), 'utf8');
  assert.match(
    source,
    /broker<\{ routed: boolean \}>\(\s*'POST',\s*'\/exchanges\/atlas\/atlas\.events\/publish'/,
  );
  assert.match(source, /assert\.equal\(result\.routed, true\)/);
});

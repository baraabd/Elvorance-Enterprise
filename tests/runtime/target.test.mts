import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeTarget } from './compose-journey.mts';

const isolated: NodeJS.ProcessEnv = {
  CI: 'true',
  COMPOSE_PROJECT_NAME: 'elvorance-runtime-123-1',
  AUTH_MODE: 'dev-hs256',
  RUNTIME_GATEWAY_URL: 'http://127.0.0.1:23000',
};

test('distributed fixture runner accepts only isolated loopback development context', () => {
  assert.equal(runtimeTarget(isolated).origin, 'http://127.0.0.1:23000');
  assert.equal(
    runtimeTarget({ ...isolated, RUNTIME_GATEWAY_URL: 'http://[::1]:23000' }).origin,
    'http://[::1]:23000',
  );
});

test('distributed fixture runner refuses hosted targets and non-disposable contexts before signing', () => {
  for (const changes of [
    { RUNTIME_GATEWAY_URL: 'https://staging.company.invalid' },
    { RUNTIME_GATEWAY_URL: 'http://127.0.0.1.company.invalid' },
    { RUNTIME_GATEWAY_URL: 'http://localhost:23000' },
    { RUNTIME_GATEWAY_URL: 'http://user:password@127.0.0.1:23000' },
    { RUNTIME_GATEWAY_URL: 'http://127.0.0.1:23000/v1/' },
    { RUNTIME_GATEWAY_URL: 'http://127.0.0.1:23000?environment=production' },
    { RUNTIME_GATEWAY_URL: 'http://127.0.0.1:23000#fragment' },
    { COMPOSE_PROJECT_NAME: 'elvorance-staging' },
    { COMPOSE_PROJECT_NAME: 'elvorance-runtime-123-1-other' },
    { CI: 'false' },
    { AUTH_MODE: 'oidc' },
    { NODE_ENV: 'production' },
  ]) {
    assert.throws(() => runtimeTarget({ ...isolated, ...changes }), /requires/);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { adminBuildConfig, buildAdminServer } from '../../tooling/scripts/build-admin-server.mts';
const config = {
  dataMode: 'server',
  environment: 'staging',
  apiBaseUrl: 'https://gateway.example.test',
  auth: {
    issuer: 'https://identity.example.test/realms/staging',
    clientId: 'admin-staging',
    redirectUri: 'https://admin.example.test/',
    environment: 'staging',
  },
};

test('S05 build rejects demo mode, secrets, mixed environments and insecure hosted origins', () => {
  assert.equal(adminBuildConfig(config).dataMode, 'server');
  for (const change of [
    { dataMode: 'demo' },
    { environment: 'production' },
    { apiBaseUrl: 'http://gateway.example.test' },
    { accessToken: 'never-embed' },
    { auth: { ...config.auth, clientSecret: 'never-embed' } },
    { auth: { ...config.auth, redirectUri: 'com.elvorance.rep.staging:/oauth2redirect' } },
  ])
    assert.throws(() => adminBuildConfig({ ...config, ...change }));
});
test('S05 server-only bundle excludes demo runtime and example catalog', async () => {
  const result = await buildAdminServer(config, process.cwd());
  assert.ok(result.inputs.length > 5);
  assert.ok(
    !result.inputs.some((path) => /demo-data|local-demo|app-runtime|\/features\//.test(path)),
  );
});

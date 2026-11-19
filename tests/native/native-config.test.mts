import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeConfig, releaseVersion } from '../../tooling/scripts/rep-native/config.mts';
import { packagedConfigHash } from '../../tooling/scripts/rep-native/packaged-config.mts';

const staging = {
  APP_ENV: 'staging',
  REP_API_BASE_URL: 'https://rep-staging.up.railway.app',
  REP_OIDC_ISSUER: 'https://identity-staging.up.railway.app/realms/elvorance-staging',
  REP_OIDC_CLIENT_ID: 'elvorance-rep-staging',
};

test('native identities and endpoint pins follow the selected isolated realm', () => {
  const config = nativeConfig(staging);
  assert.equal(config.appId, 'com.elvorance.rep.staging');
  assert.equal(
    config.plugins.ElvoranceAuthBridge.authorizationEndpoint,
    `${staging.REP_OIDC_ISSUER}/protocol/openid-connect/auth`,
  );
  assert.equal(config.android.allowMixedContent, false);
  assert.equal(config.android.webContentsDebuggingEnabled, false);
  assert.equal(config.ios.webContentsDebuggingEnabled, false);
  assert.ok(!('url' in config.server));
  assert.throws(() => nativeConfig({ ...staging, APP_ENV: 'production' }));
  const production = nativeConfig({
    ...staging,
    APP_ENV: 'production',
    REP_OIDC_CLIENT_ID: 'elvorance-rep-production',
    REP_OIDC_ISSUER: 'https://identity-production.up.railway.app/realms/elvorance-production',
  });
  assert.equal(production.appId, 'com.elvorance.rep');
});

test('release versions reject missing, prerelease and unsafe build identifiers', () => {
  assert.deepEqual(
    releaseVersion({ ELVORANCE_VERSION_NAME: '2.4.1', ELVORANCE_VERSION_CODE: '37' }),
    { name: '2.4.1', code: '37' },
  );
  for (const name of ['', '1', '1.0.0-beta', '01.0.0', '../2.0.0']) {
    assert.throws(() =>
      releaseVersion({ ELVORANCE_VERSION_NAME: name, ELVORANCE_VERSION_CODE: '2' }),
    );
  }
  for (const code of ['', '0', '-1', '1.2', '1000000000', '$(bad)']) {
    assert.throws(() =>
      releaseVersion({ ELVORANCE_VERSION_NAME: '2.4.1', ELVORANCE_VERSION_CODE: code }),
    );
  }
});

test('native provenance accounts for Capacitor-generated iOS registrations without weakening endpoint validation', () => {
  const expected = nativeConfig(staging);
  const packaged = {
    ...expected,
    packageClassList: ['AppPlugin', 'CAPNetworkPlugin', 'GeolocationPlugin'],
  };
  assert.match(packagedConfigHash('ios', packaged, expected), /^[a-f0-9]{64}$/);
  assert.throws(() =>
    packagedConfigHash('ios', { ...packaged, appId: 'com.elvorance.rep' }, expected),
  );
  assert.throws(() =>
    packagedConfigHash('ios', { ...packaged, packageClassList: ['AppPlugin'] }, expected),
  );
  assert.throws(() =>
    packagedConfigHash('ios', { ...packaged, server: { url: 'https://untrusted.test' } }, expected),
  );
  assert.throws(() => packagedConfigHash('android', packaged, expected));
});

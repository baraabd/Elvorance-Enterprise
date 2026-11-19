import test from 'node:test';
import assert from 'node:assert/strict';
import { repReleaseConfig } from '../../tooling/scripts/rep-release/release-config.mts';

const staging = {
  APP_ENV: 'staging',
  REP_API_BASE_URL: 'https://gateway.elvorance.dev',
  REP_OIDC_ISSUER: 'https://identity.elvorance.dev/realms/elvorance-staging',
  REP_OIDC_CLIENT_ID: 'elvorance-rep-staging',
};

for (const production of [
  'https://gateway.elvorance.dev',
  'https://gateway.elvorance.dev/',
  'https://GATEWAY.ELVORANCE.DEV',
  'https://gateway.elvorance.dev:443/',
  ' https://gateway.elvorance.dev/ ',
]) {
  test(`staging rejects an equivalent production gateway: ${production.trim()}`, () => {
    assert.throws(
      () => repReleaseConfig({ ...staging, REP_PRODUCTION_API_BASE_URL: production }),
      /Staging and production must not share a gateway/,
    );
  });
}

test('gateway comparison canonicalizes the staging endpoint as well', () => {
  assert.throws(
    () =>
      repReleaseConfig({
        ...staging,
        REP_API_BASE_URL: 'https://GATEWAY.elvorance.dev:443/',
        REP_PRODUCTION_API_BASE_URL: 'https://gateway.elvorance.dev/',
      }),
    /Staging and production must not share a gateway/,
  );
});

test('a supplied production reference must itself be a valid HTTPS gateway origin', () => {
  for (const production of [
    'not a URL',
    'http://production.elvorance.dev',
    'https://production.elvorance.dev/api',
    'https://production.elvorance.dev?environment=production',
    'https://production.elvorance.dev#production',
    'https://user:password@production.elvorance.dev',
    'https://localhost',
    'https://example.com',
  ]) {
    assert.throws(
      () => repReleaseConfig({ ...staging, REP_PRODUCTION_API_BASE_URL: production }),
      Error,
      `Invalid production reference was accepted: ${production}`,
    );
  }
});

test('separate gateway origins preserve the staging native identity', () => {
  const config = repReleaseConfig({
    ...staging,
    REP_PRODUCTION_API_BASE_URL: 'https://production.elvorance.dev:443/',
  });
  assert.equal(config.apiBaseUrl, 'https://gateway.elvorance.dev');
  assert.equal(config.auth.redirectUri, 'com.elvorance.rep.staging:/oauth2redirect');
});

test('an unconfigured production reference does not prevent initial staging setup', () => {
  assert.equal(repReleaseConfig(staging).environment, 'staging');
  assert.equal(
    repReleaseConfig({ ...staging, REP_PRODUCTION_API_BASE_URL: '' }).environment,
    'staging',
  );
});

test('production builds may reference their own canonical production origin', () => {
  const config = repReleaseConfig({
    APP_ENV: 'production',
    REP_API_BASE_URL: 'https://production.elvorance.dev/',
    REP_PRODUCTION_API_BASE_URL: 'https://production.elvorance.dev:443/',
    REP_OIDC_ISSUER: 'https://identity.elvorance.dev/realms/elvorance-production',
    REP_OIDC_CLIENT_ID: 'elvorance-rep-production',
  });
  assert.equal(config.environment, 'production');
  assert.equal(config.auth.redirectUri, 'com.elvorance.rep:/oauth2redirect');
});

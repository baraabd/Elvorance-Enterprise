import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateProfile,
  exportOptions,
  type ProvisioningProfile,
} from '../../tooling/scripts/rep-native/ios-profile.mts';

const env = {
  APP_ENV: 'staging',
  REP_API_BASE_URL: 'https://rep-staging.up.railway.app',
  REP_OIDC_ISSUER: 'https://identity-staging.up.railway.app/realms/elvorance-staging',
  REP_OIDC_CLIENT_ID: 'elvorance-rep-staging',
  APPLE_TEAM_ID: 'ABC1234567',
  IOS_EXPORT_METHOD: 'app-store-connect',
};
const profile = (): ProvisioningProfile => ({
  UUID: '12345678-1234-1234-1234-123456789ABC',
  TeamIdentifier: ['ABC1234567'],
  ApplicationIdentifierPrefix: ['ABC1234567'],
  ExpirationDate: new Date(Date.now() + 86400000).toISOString(),
  Entitlements: {
    'application-identifier': 'ABC1234567.com.elvorance.rep.staging',
    'get-task-allow': false,
  },
});

test('export requires a distribution profile for the exact app identity, team and method', () => {
  assert.doesNotThrow(() => validateProfile(profile(), env));
  for (const invalid of [
    { ...profile(), TeamIdentifier: ['OTHERTEAM1'] },
    { ...profile(), ExpirationDate: '2000-01-01T00:00:00Z' },
    { ...profile(), ProvisionedDevices: ['physical-udid'] },
    { ...profile(), ProvisionsAllDevices: true },
    {
      ...profile(),
      Entitlements: {
        'application-identifier': 'ABC1234567.com.elvorance.rep',
        'get-task-allow': false,
      },
    },
    { ...profile(), Entitlements: { ...profile().Entitlements, 'get-task-allow': true } },
  ])
    assert.throws(() => validateProfile(invalid, env));
  assert.throws(() => validateProfile(profile(), { ...env, IOS_EXPORT_METHOD: 'release-testing' }));
  assert.doesNotThrow(() =>
    validateProfile(
      { ...profile(), ProvisionedDevices: ['physical-udid'] },
      { ...env, IOS_EXPORT_METHOD: 'release-testing' },
    ),
  );
});

test('export options preserve the reviewed identity and do not upload automatically', () => {
  const options = exportOptions(profile(), env);
  assert.match(options, /<key>destination<\/key><string>export<\/string>/);
  assert.match(options, /com\.elvorance\.rep\.staging/);
  assert.match(options, /manageAppVersionAndBuildNumber<\/key><false\/>/);
  assert.doesNotMatch(options, /<string>upload<\/string>/);
});

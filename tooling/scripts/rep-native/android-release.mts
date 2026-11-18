import { X509Certificate } from 'node:crypto';
import { chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { repReleaseConfig } from '../rep-release/release-config.mts';
import { repositoryRoot } from '../rep-release/build-proof.mts';
import { nativeIdentity, releaseVersion } from './config.mts';
import { assertNativePrepared, writeEvidence } from './provenance.mts';
import { capture, run } from './process.mts';

const manifest = await assertNativePrepared('android');
const config = repReleaseConfig();
const { flavor } = nativeIdentity(config);
releaseVersion();
for (const key of [
  'ANDROID_KEYSTORE_PATH',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
]) {
  if (!process.env[key])
    throw new Error(`Missing ${key}. An unsigned bundle cannot satisfy a release build.`);
}
const directory = resolve(repositoryRoot, 'apps/rep-mobile/android');
await chmod(resolve(directory, 'gradlew'), 0o755);
run(
  './gradlew',
  ['--no-daemon', `lint${flavor}Release`, `test${flavor}DebugUnitTest`, `bundle${flavor}Release`],
  directory,
);
const bundle = resolve(
  directory,
  `app/build/outputs/bundle/${config.environment}Release/app-${config.environment}-release.aab`,
);
const verification = capture('jarsigner', ['-J-Duser.language=en', '-verify', bundle]);
if (!verification.includes('jar verified.'))
  throw new Error('Android bundle signature verification failed.');
const signedCertificate = capture('keytool', ['-printcert', '-rfc', '-jarfile', bundle]);
const expectedCertificate = capture('keytool', [
  '-exportcert',
  '-rfc',
  '-keystore',
  process.env.ANDROID_KEYSTORE_PATH!,
  '-alias',
  process.env.ANDROID_KEY_ALIAS!,
  '-storepass:env',
  'ANDROID_KEYSTORE_PASSWORD',
]);
const pem = (value: string) =>
  value.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/)?.[0];
const signedPem = pem(signedCertificate),
  expectedPem = pem(expectedCertificate);
if (
  !signedPem ||
  !expectedPem ||
  new X509Certificate(signedPem).fingerprint256 !== new X509Certificate(expectedPem).fingerprint256
) {
  throw new Error('Android bundle signer does not match the configured upload certificate.');
}
await writeEvidence('android-release', manifest, [bundle], {
  platform: 'android',
  signed: true,
  certificateSha256: new X509Certificate(signedPem).fingerprint256,
  deviceAcceptance: 'not-performed-by-build',
  published: false,
});
console.log(
  'Built and verified the signed Android App Bundle. Store upload and physical acceptance are separate gates.',
);

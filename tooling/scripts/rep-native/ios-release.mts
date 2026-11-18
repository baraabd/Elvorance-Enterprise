import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { repositoryRoot } from '../rep-release/build-proof.mts';
import { repReleaseConfig } from '../rep-release/release-config.mts';
import { nativeIdentity, releaseVersion } from './config.mts';
import { exportOptions, validateProfile } from './ios-profile.mts';
import { cleanupSigning, installSigning, readProfile } from './ios-signing.mts';
import { assertNativePrepared, writeEvidence } from './provenance.mts';
import { capture, run } from './process.mts';

if (process.platform !== 'darwin')
  throw new Error('iOS archives require macOS with Xcode 26 or newer.');
const xcode = capture('xcodebuild', ['-version']);
if (!/^Xcode (?:2[6-9]|[3-9]\d)(?:\.|\s)/.test(xcode))
  throw new Error('Xcode 26 or newer is required.');
const manifest = await assertNativePrepared('ios');
const config = repReleaseConfig();
const identity = nativeIdentity(config);
const version = releaseVersion();
const directory = resolve(repositoryRoot, 'dist/rep-native/ios-release');
const archive = resolve(directory, 'App.xcarchive');
const exported = resolve(directory, 'export');
await mkdir(directory, { recursive: true });
try {
  const profile = await installSigning();
  const options = resolve(directory, 'ExportOptions.plist');
  await writeFile(options, exportOptions(profile));
  run('xcodebuild', [
    '-project',
    'apps/rep-mobile/ios/App/App.xcodeproj',
    '-scheme',
    'App',
    '-configuration',
    'Release',
    '-destination',
    'generic/platform=iOS',
    '-archivePath',
    archive,
    `ELVORANCE_BUNDLE_IDENTIFIER=${identity.applicationId}`,
    `ELVORANCE_APP_DISPLAY_NAME=${identity.displayName}`,
    `MARKETING_VERSION=${version.name}`,
    `CURRENT_PROJECT_VERSION=${version.code}`,
    `DEVELOPMENT_TEAM=${process.env.APPLE_TEAM_ID!}`,
    'CODE_SIGN_STYLE=Manual',
    'CODE_SIGN_IDENTITY=Apple Distribution',
    `PROVISIONING_PROFILE_SPECIFIER=${profile.UUID}`,
    'archive',
  ]);
  run('xcodebuild', [
    '-exportArchive',
    '-archivePath',
    archive,
    '-exportPath',
    exported,
    '-exportOptionsPlist',
    options,
  ]);
  const packages = (await readdir(exported)).filter((name) => name.endsWith('.ipa'));
  if (packages.length !== 1)
    throw new Error('Expected exactly one signed IPA from archive export.');
  const ipa = resolve(exported, packages[0]!);
  const expanded = resolve(directory, 'verified-ipa');
  run('unzip', ['-q', ipa, '-d', expanded]);
  const applications = (await readdir(resolve(expanded, 'Payload'))).filter((name) =>
    name.endsWith('.app'),
  );
  if (applications.length !== 1)
    throw new Error('Exported IPA must contain exactly one application.');
  const app = resolve(expanded, 'Payload', applications[0]!);
  run('codesign', ['--verify', '--deep', '--strict', app]);
  const bundleId = capture('plutil', [
    '-extract',
    'CFBundleIdentifier',
    'raw',
    '-o',
    '-',
    resolve(app, 'Info.plist'),
  ]);
  if (bundleId !== identity.applicationId)
    throw new Error('Exported IPA has the wrong environment identity.');
  const embedded = resolve(directory, 'embedded-profile.plist');
  await writeFile(
    embedded,
    capture('security', ['cms', '-D', '-i', resolve(app, 'embedded.mobileprovision')]),
  );
  const embeddedProfile = readProfile(embedded);
  validateProfile(embeddedProfile);
  if (embeddedProfile.UUID !== profile.UUID)
    throw new Error('IPA provisioning profile changed during export.');
  await writeEvidence('ios-release', manifest, [ipa], {
    platform: 'ios',
    signed: true,
    applicationId: bundleId,
    profileId: profile.UUID,
    exportMethod: process.env.IOS_EXPORT_METHOD,
    xcode,
    deviceAcceptance: 'not-performed-by-build',
    published: false,
  });
  console.log(
    'Built and verified the signed iOS IPA. App Store upload and physical acceptance are separate gates.',
  );
} finally {
  await cleanupSigning();
}

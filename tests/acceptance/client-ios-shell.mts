import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { capture, run } from '../../tooling/scripts/rep-native/process.mts';

assert.equal(process.env.CI, 'true', 'Client shell verification is CI-only');
const version = capture('xcodebuild', ['-version']);
assert.ok(Number(version.match(/Xcode (\d+)/)?.[1]) >= 26);
const devices = JSON.parse(
  capture('xcrun', ['simctl', 'list', 'devices', 'available', '--json']),
) as {
  devices: Record<
    string,
    Array<{ name: string; udid: string; state: string; isAvailable: boolean }>
  >;
};
const device = Object.entries(devices.devices)
  .filter(([runtime]) => /iOS-(?:2[6-9]|[3-9]\d)-/.test(runtime))
  .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
  .flatMap(([, values]) => values)
  .find((value) => value.isAvailable && value.name.startsWith('iPhone'));
assert.ok(device, 'An iOS 26+ iPhone simulator is required');
await mkdir('dist/acceptance', { recursive: true });
run('xcodebuild', [
  '-project',
  'apps/client-mobile/ios/App/App.xcodeproj',
  '-scheme',
  'App',
  '-configuration',
  'Debug',
  '-destination',
  `platform=iOS Simulator,id=${device.udid}`,
  '-derivedDataPath',
  'dist/acceptance/client-ios-derived',
  'CODE_SIGN_IDENTITY=-',
  'CODE_SIGNING_ALLOWED=YES',
  'ELVORANCE_BUNDLE_IDENTIFIER=com.elvorance.client.staging',
  'build',
]);
const application = resolve(
  'dist/acceptance/client-ios-derived/Build/Products/Debug-iphonesimulator/App.app',
);
const identity = capture('/usr/libexec/PlistBuddy', [
  '-c',
  'Print :CFBundleIdentifier',
  application + '/Info.plist',
]).trim();
assert.equal(identity, 'com.elvorance.client.staging');
const bootedHere = device.state !== 'Booted';
let installed = false;
try {
  if (bootedHere) run('xcrun', ['simctl', 'boot', device.udid]);
  run('xcrun', ['simctl', 'bootstatus', device.udid, '-b']);
  run('xcrun', ['simctl', 'install', device.udid, application]);
  installed = true;
  const launched = capture('xcrun', ['simctl', 'launch', device.udid, identity]).trim();
  assert.match(launched, /^com\.elvorance\.client\.staging: \d+$/);
  await writeFile(
    'dist/acceptance/client-ios-shell.json',
    JSON.stringify(
      {
        scope:
          'Client demo shell build and simulator launch only; no UI journey, OIDC, physical device or distribution acceptance',
        sourceSha: process.env.GITHUB_SHA,
        xcode: version.trim(),
        simulator: device.name,
        identity,
        processStarted: true,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  if (installed) run('xcrun', ['simctl', 'uninstall', device.udid, identity]);
  if (bootedHere) run('xcrun', ['simctl', 'shutdown', device.udid]);
}

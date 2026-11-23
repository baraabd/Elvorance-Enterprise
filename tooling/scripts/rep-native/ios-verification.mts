import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { repositoryRoot } from '../rep-release/build-proof.mts';
import { capture, run } from './process.mts';

const version = capture('xcodebuild', ['-version']);
if (Number(version.match(/Xcode (\d+)/)?.[1]) < 26 || !version.startsWith('Xcode ')) {
  throw new Error('Capacitor 8 verification requires Xcode 26 or newer.');
}
const list = JSON.parse(capture('xcrun', ['simctl', 'list', 'devices', 'available', '--json'])) as {
  devices: Record<string, Array<{ name: string; udid: string; isAvailable: boolean }>>;
};
const device = Object.entries(list.devices)
  .filter(([runtime]) => /iOS-(?:2[6-9]|[3-9]\d)-/.test(runtime))
  .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
  .flatMap(([, devices]) => devices)
  .find((candidate) => candidate.isAvailable && candidate.name.startsWith('iPhone'));
if (!device)
  throw new Error('An available iOS 26+ iPhone simulator is required for native verification.');
await mkdir(resolve(repositoryRoot, 'dist/rep-native'), { recursive: true });
run('xcodebuild', [
  '-project',
  'apps/rep-mobile/ios/App/App.xcodeproj',
  '-scheme',
  'App',
  '-configuration',
  'Debug',
  '-destination',
  `platform=iOS Simulator,id=${device.udid}`,
  '-derivedDataPath',
  'dist/rep-native/ios-derived',
  '-resultBundlePath',
  'dist/rep-native/ios-verification.xcresult',
  'CODE_SIGN_IDENTITY=-',
  'CODE_SIGNING_ALLOWED=YES',
  'ELVORANCE_BUNDLE_IDENTIFIER=com.elvorance.rep.staging',
  'ELVORANCE_APP_DISPLAY_NAME=Native verification only',
  'test',
]);

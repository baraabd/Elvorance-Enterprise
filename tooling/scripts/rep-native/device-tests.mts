import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { repositoryRoot, sha256 } from '../rep-release/build-proof.mts';
import { repReleaseConfig } from '../rep-release/release-config.mts';
import { assertNativePrepared, writeEvidence } from './provenance.mts';
import { capture, run } from './process.mts';

const platform = process.argv[2];
if (platform !== 'android' && platform !== 'ios') throw new Error('Select android or ios.');
if (repReleaseConfig().environment !== 'staging')
  throw new Error('Device tests are restricted to the isolated staging application.');
const manifest = await assertNativePrepared(platform);
const directory = resolve(repositoryRoot, 'dist/rep-native/physical');
await mkdir(directory, { recursive: true });

if (platform === 'android') {
  const serial = process.env.ANDROID_SERIAL;
  if (!serial || !/^[A-Za-z0-9._:-]+$/.test(serial) || serial.startsWith('emulator-')) {
    throw new Error('ANDROID_SERIAL must explicitly select a connected physical Android device.');
  }
  const adb = (args: string[]) => capture('adb', ['-s', serial, ...args]);
  if (
    adb(['get-state']) !== 'device' ||
    adb(['shell', 'getprop', 'ro.kernel.qemu']) === '1' ||
    adb(['shell', 'getprop', 'ro.boot.qemu']) === '1' ||
    /goldfish|ranchu/i.test(adb(['shell', 'getprop', 'ro.hardware']))
  ) {
    throw new Error('The selected Android target is offline or is an emulator.');
  }
  const nativeRoot = resolve(repositoryRoot, 'apps/rep-mobile/android');
  run(
    'sh',
    ['./gradlew', '--no-daemon', 'assembleStagingDebug', 'assembleStagingDebugAndroidTest'],
    nativeRoot,
  );
  const apk = resolve(nativeRoot, 'app/build/outputs/apk/staging/debug/app-staging-debug.apk');
  const testApk = resolve(
    nativeRoot,
    'app/build/outputs/apk/androidTest/staging/debug/app-staging-debug-androidTest.apk',
  );
  adb(['install', '-r', apk]);
  adb(['install', '-r', '-t', testApk]);
  const result = adb([
    'shell',
    'am',
    'instrument',
    '-w',
    '-r',
    'com.elvorance.rep.staging.test/androidx.test.runner.AndroidJUnitRunner',
  ]);
  const report = resolve(directory, 'android-instrumentation.txt');
  await writeFile(report, result + '\n');
  if (
    !/OK \([1-9]\d* tests?\)/.test(result) ||
    /FAILURES!!!|INSTRUMENTATION_FAILED|INSTRUMENTATION_ABORTED/.test(result)
  ) {
    throw new Error('Physical Android native tests failed; inspect the instrumentation report.');
  }
  await writeEvidence('android-physical-native', manifest, [apk, testApk, report], {
    platform,
    physicalDevice: true,
    deviceIdSha256: sha256(serial),
    deviceModel: adb(['shell', 'getprop', 'ro.product.model']),
    osVersion: adb(['shell', 'getprop', 'ro.build.version.release']),
    nativeSecurityTests: 'passed',
    businessFlowAcceptance: 'pending',
    productionPromotionAllowed: false,
  });
} else {
  const device = process.env.IOS_DEVICE_ID;
  const team = process.env.APPLE_TEAM_ID;
  if (
    process.platform !== 'darwin' ||
    !device ||
    !/^(?:[A-Fa-f0-9]{8}-[A-Fa-f0-9]{16}|[A-Fa-f0-9]{40})$/.test(device) ||
    !team ||
    !/^[A-Z0-9]{10}$/.test(team)
  ) {
    throw new Error(
      'A macOS host, physical IOS_DEVICE_ID and APPLE_TEAM_ID with development signing are required.',
    );
  }
  const resultBundle = resolve(directory, 'ios-native.xcresult');
  // platform=iOS explicitly excludes simulators; no distribution certificate is substituted for device development signing.
  run('xcodebuild', [
    '-project',
    'apps/rep-mobile/ios/App/App.xcodeproj',
    '-scheme',
    'App',
    '-configuration',
    'Debug',
    '-destination',
    `platform=iOS,id=${device}`,
    '-allowProvisioningUpdates',
    '-derivedDataPath',
    resolve(directory, 'ios-derived'),
    '-resultBundlePath',
    resultBundle,
    'ELVORANCE_BUNDLE_IDENTIFIER=com.elvorance.rep.staging',
    'ELVORANCE_APP_DISPLAY_NAME=إلفورانس تجريبي',
    'CODE_SIGN_STYLE=Automatic',
    `DEVELOPMENT_TEAM=${team}`,
    'test',
  ]);
  const report = resolve(directory, 'ios-native-summary.json');
  await writeFile(
    report,
    capture('xcrun', ['xcresulttool', 'get', 'test-results', 'summary', '--path', resultBundle]) +
      '\n',
  );
  await writeEvidence('ios-physical-native', manifest, [report], {
    platform,
    physicalDevice: true,
    deviceIdSha256: sha256(device),
    resultBundle,
    nativeSecurityTests: 'passed',
    businessFlowAcceptance: 'pending',
    productionPromotionAllowed: false,
  });
}
console.log(
  'Physical native tests passed. Complete staging business-flow acceptance before production promotion.',
);

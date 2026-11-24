import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { repositoryRoot } from '../rep-release/build-proof.mts';
import { capture, run } from '../rep-native/process.mts';

// Isolated test harness only. Never ships real configuration, credentials or customer data.
const platform = process.argv[2];
if (platform !== 'android' && platform !== 'ios') throw new Error('Select android or ios.');
const folder = resolve(repositoryRoot, 'apps/client-mobile');
const configPath = resolve(folder, 'capacitor.config.json');
const original = await readFile(configPath);
const fixture = resolve(repositoryRoot, 'dist/client-native/verification');
await mkdir(fixture, { recursive: true });
await writeFile(
  resolve(fixture, 'index.html'),
  `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'">
<title>Client native verification only</title></head><body><h1>Native verification only</h1>
<p>Unsigned test harness; not a customer application release.</p></body></html>\n`,
);
try {
  await writeFile(
    configPath,
    JSON.stringify(
      {
        appId: 'com.elvorance.client.staging',
        appName: 'Native verification only',
        webDir: '../../dist/client-native/verification',
        server: { androidScheme: 'https' },
        android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
        ios: { webContentsDebuggingEnabled: false },
      },
      null,
      2,
    ) + '\n',
  );
  run(
    process.execPath,
    [resolve(repositoryRoot, 'node_modules/@capacitor/cli/bin/capacitor'), 'sync', platform],
    folder,
  );
} finally {
  await writeFile(configPath, original);
}
if (platform === 'ios') {
  const version = capture('xcodebuild', ['-version']);
  if (!version.startsWith('Xcode ') || Number(version.match(/Xcode (\d+)/)?.[1]) < 26)
    throw new Error('Client verification requires Xcode 26 or newer.');
  const list = JSON.parse(
    capture('xcrun', ['simctl', 'list', 'devices', 'available', '--json']),
  ) as {
    devices: Record<string, Array<{ name: string; udid: string; isAvailable: boolean }>>;
  };
  const device = Object.entries(list.devices)
    .filter(([runtime]) => /iOS-(?:2[6-9]|[3-9]\d)-/.test(runtime))
    .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
    .flatMap(([, devices]) => devices)
    .find((candidate) => candidate.isAvailable && candidate.name.startsWith('iPhone'));
  if (!device) throw new Error('An available iOS 26+ iPhone simulator is required.');
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
    'dist/client-native/ios-derived',
    '-resultBundlePath',
    'dist/client-native/ios-verification.xcresult',
    'CODE_SIGN_IDENTITY=-',
    'CODE_SIGNING_ALLOWED=YES',
    'ELVORANCE_BUNDLE_IDENTIFIER=com.elvorance.client.staging',
    'ELVORANCE_APP_DISPLAY_NAME=Native verification only',
    'test',
  ]);
}
console.log(`Client ${platform} verification preparation complete; not a distribution release.`);

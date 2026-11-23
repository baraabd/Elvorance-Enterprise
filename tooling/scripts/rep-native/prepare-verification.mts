import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { repositoryRoot } from '../rep-release/build-proof.mts';
import { syncNative } from './sync.mts';

// Deliberately separate from release preparation: no backend, demo records, tokens or login.
// This harness verifies native code while endpoint provisioning is unavailable.
const platform = process.argv[2];
if (platform !== 'android' && platform !== 'ios') throw new Error('Select android or ios.');
const fixture = resolve(repositoryRoot, 'dist/rep-native/verification');
await mkdir(fixture, { recursive: true });
await writeFile(
  resolve(fixture, 'index.html'),
  `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'">
<title>Native verification only</title></head><body><main><h1>Native verification only</h1>
<p>This unsigned harness tests the native bridge and secure storage. It is not a representative application release.</p>
</main></body></html>\n`,
);
await writeFile(
  resolve(fixture, 'verification-only.json'),
  JSON.stringify({ distribution: false, backend: false, physicalDeviceAcceptance: false }) + '\n',
);
await syncNative(platform, {
  appId: 'com.elvorance.rep.staging',
  appName: 'Native verification only',
  webDir: '../../dist/rep-native/verification',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  ios: { webContentsDebuggingEnabled: false },
});
console.log(`Prepared a non-distributable ${platform} native verification harness.`);

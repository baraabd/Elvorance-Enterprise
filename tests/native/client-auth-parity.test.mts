import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const adapt = (source: string) =>
  source
    .replaceAll('com.elvorance.rep', 'com.elvorance.client')
    .replaceAll('com\\\\.elvorance\\\\.rep', 'com\\\\.elvorance\\\\.client')
    .replaceAll('RepBridgeViewController', 'ClientBridgeViewController');
const read = (path: string) => readFile(path, 'utf8');
test('S03 client native auth is the reviewed rep implementation with only application identity substitutions', async () => {
  for (const name of [
    'AuthRedirect',
    'AuthSecureStore',
    'AuthBrowserSession',
    'ElvoranceAuthBridgePlugin',
  ]) {
    assert.equal(
      await read(
        `apps/client-mobile/android/app/src/main/java/com/elvorance/client/auth/${name}.java`,
      ),
      adapt(
        await read(`apps/rep-mobile/android/app/src/main/java/com/elvorance/rep/auth/${name}.java`),
      ),
      name,
    );
    assert.equal(
      await read(`apps/client-mobile/ios/App/App/Auth/${name}.swift`),
      adapt(await read(`apps/rep-mobile/ios/App/App/Auth/${name}.swift`)),
      name,
    );
  }
});
test('S03 client native hosts register the bridge, disable insecure transport/backup and bind environment-specific callbacks', async () => {
  const manifest = await read('apps/client-mobile/android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(manifest, /android:scheme="\$\{applicationId\}"/);
  assert.match(
    await read('apps/client-mobile/android/app/build.gradle'),
    /applicationIdSuffix "\.staging"/,
  );
  assert.match(
    await read(
      'apps/client-mobile/android/app/src/main/java/com/elvorance/client/MainActivity.java',
    ),
    /registerPlugin\(ElvoranceAuthBridgePlugin.class\)/,
  );
  assert.match(await read('apps/client-mobile/ios/App/App/Info.plist'), /CFBundleURLSchemes/);
  assert.match(
    await read('apps/client-mobile/ios/App/App/ClientBridgeViewController.swift'),
    /registerPluginInstance\(ElvoranceAuthBridgePlugin\(\)\)/,
  );
});

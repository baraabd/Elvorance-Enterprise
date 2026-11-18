import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertRepBuild, repositoryRoot, sha256 } from '../rep-release/build-proof.mts';
import { nativeConfig } from './config.mts';
import { syncNative } from './sync.mts';
import { packagedConfigHash } from './packaged-config.mts';

const platform = process.argv[2];
if (platform !== 'android' && platform !== 'ios')
  throw new Error('Usage: node tooling/scripts/rep-native/prepare.mts android|ios');
const manifest = await assertRepBuild();
const config = nativeConfig();
await syncNative(platform, config);
const nativeRoot = resolve(
  repositoryRoot,
  platform === 'android'
    ? 'apps/rep-mobile/android/app/src/main/assets'
    : 'apps/rep-mobile/ios/App/App',
);
const packagedConfig = JSON.parse(
  await readFile(resolve(nativeRoot, 'capacitor.config.json'), 'utf8'),
) as Record<string, unknown>;
const nativeConfigHash = packagedConfigHash(platform, packagedConfig, config);
await mkdir(resolve(repositoryRoot, 'dist/rep-native'), { recursive: true });
await writeFile(
  resolve(repositoryRoot, `dist/rep-native/${platform}-prepared.json`),
  JSON.stringify(
    {
      schemaVersion: 1,
      platform,
      environment: manifest.environment,
      applicationId: config.appId,
      sourceRevision: manifest.sourceRevision,
      sourceHash: manifest.sourceHash,
      configHash: sha256(JSON.stringify(config)),
      nativeConfigHash,
      preparedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Prepared ${platform} for ${manifest.environment}; server assets and source integrity verified.`,
);

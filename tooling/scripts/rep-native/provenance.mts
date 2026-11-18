import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import {
  assertRepBuild,
  repositoryRoot,
  sha256,
  type RepBuildManifest,
} from '../rep-release/build-proof.mts';
import { nativeConfig } from './config.mts';
import { packagedConfigHash } from './packaged-config.mts';

export async function assertNativePrepared(platform: 'android' | 'ios'): Promise<RepBuildManifest> {
  const manifest = await assertRepBuild();
  const config = nativeConfig();
  const metadata = JSON.parse(
    await readFile(resolve(repositoryRoot, `dist/rep-native/${platform}-prepared.json`), 'utf8'),
  ) as Record<string, unknown>;
  const nativeRoot = resolve(
    repositoryRoot,
    platform === 'android'
      ? 'apps/rep-mobile/android/app/src/main/assets'
      : 'apps/rep-mobile/ios/App/App',
  );
  const packagedConfig = JSON.parse(
    await readFile(resolve(nativeRoot, 'capacitor.config.json'), 'utf8'),
  ) as Record<string, unknown>;
  if (
    metadata.sourceHash !== manifest.sourceHash ||
    metadata.applicationId !== config.appId ||
    metadata.configHash !== sha256(JSON.stringify(config)) ||
    packagedConfigHash(platform, packagedConfig, config) !== metadata.nativeConfigHash
  ) {
    throw new Error(
      'Native assets do not match the selected release; run native preparation again.',
    );
  }
  for (const [file, hash] of Object.entries(manifest.outputs)) {
    if (sha256(await readFile(resolve(nativeRoot, 'public', file))) !== hash) {
      throw new Error(`Native asset integrity failed: ${file}.`);
    }
  }
  return manifest;
}

export async function writeEvidence(
  name: string,
  manifest: RepBuildManifest,
  files: string[],
  details: Record<string, unknown>,
) {
  const artifacts: Record<string, string> = {};
  for (const file of files)
    artifacts[relative(repositoryRoot, file)] = sha256(await readFile(file));
  const directory = resolve(repositoryRoot, 'dist/rep-native');
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, `${name}.json`),
    JSON.stringify(
      {
        schemaVersion: 1,
        environment: manifest.environment,
        sourceRevision: manifest.sourceRevision,
        sourceHash: manifest.sourceHash,
        recordedAt: new Date().toISOString(),
        artifacts,
        ...details,
      },
      null,
      2,
    ) + '\n',
  );
}

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { repositoryRoot } from '../rep-release/build-proof.mts';
import { run } from './process.mts';

export async function syncNative(platform: 'android' | 'ios', config: object): Promise<void> {
  const appRoot = resolve(repositoryRoot, 'apps/rep-mobile');
  const configPath = resolve(appRoot, 'capacitor.config.json');
  const original = await readFile(configPath);
  try {
    await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
    run(
      process.execPath,
      [resolve(repositoryRoot, 'node_modules/@capacitor/cli/bin/capacitor'), 'sync', platform],
      appRoot,
    );
  } finally {
    // Generated native assets retain the selected config; the tracked template is unchanged.
    await writeFile(configPath, original);
  }
}

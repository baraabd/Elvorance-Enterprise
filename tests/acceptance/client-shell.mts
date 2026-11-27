import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertAppBuild } from '../../tooling/scripts/app-build-proof.mts';
import { run } from '../../tooling/scripts/rep-native/process.mts';

const root = resolve(import.meta.dirname, '../..');
export async function prepareClientShell(
  platform: string,
  options: {
    workspaceRoot?: string;
    env?: NodeJS.ProcessEnv;
    checkBuild?: (folder: string, options: { workspaceRoot: string }) => Promise<unknown>;
    sync?: (platform: 'android' | 'ios', folder: string) => void;
  } = {},
) {
  const env = options.env ?? process.env;
  if (env.CI !== 'true' || env.ELVORANCE_DISPOSABLE_ACCEPTANCE !== '1')
    throw new Error('Client demo-shell preparation requires disposable CI acceptance.');
  if (platform !== 'android' && platform !== 'ios') throw new Error('Select android or ios.');
  const workspaceRoot = options.workspaceRoot ?? root;
  await (options.checkBuild ?? assertAppBuild)('client-mobile', { workspaceRoot });
  const folder = resolve(workspaceRoot, 'apps/client-mobile');
  const configPath = resolve(folder, 'capacitor.config.json');
  const original = await readFile(configPath);
  const config = JSON.parse(original.toString()) as Record<string, unknown>;
  if (config.appId !== 'com.elvorance.client' || config.webDir !== 'dist')
    throw new Error('Unexpected client demo-shell configuration; refusing to substitute content.');
  try {
    // Keep the actual, verified demo bundle. Only the isolated installed-app identity changes.
    await writeFile(
      configPath,
      JSON.stringify({ ...config, appId: 'com.elvorance.client.staging' }, null, 2) + '\n',
    );
    if (options.sync) options.sync(platform, folder);
    else
      run(
        process.execPath,
        [resolve(workspaceRoot, 'node_modules/@capacitor/cli/bin/capacitor'), 'sync', platform],
        folder,
      );
  } finally {
    await writeFile(configPath, original);
  }
}

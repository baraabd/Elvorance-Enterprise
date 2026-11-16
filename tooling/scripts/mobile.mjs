import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, apps } from './workspace.mjs';
import { assertAppBuild } from './app-build-proof.mjs';

export async function runMobile(
  args,
  { workspaceRoot = root, checkBuild = assertAppBuild, run = spawnSync } = {},
) {
  const [command = 'sync', target, platform, ...extra] = args;
  if (!['add', 'sync', 'open'].includes(command)) throw new Error('Use add, sync or open.');
  if (extra.length || !['android', 'ios'].includes(platform)) {
    throw new Error(
      'Choose an app and platform explicitly. Example: npm run mobile:sync -- rep-mobile android',
    );
  }
  const selected = apps.filter((app) => app.nativeId && app.folder === target);
  if (!selected.length) throw new Error('Choose rep-mobile or client-mobile.');

  // A partial dist left by a failed build must never be copied into a native project.
  if (command !== 'open') {
    for (const app of selected) await checkBuild(app.folder, { workspaceRoot });
  }
  for (const app of selected) {
    const result = run(
      process.execPath,
      [resolve(workspaceRoot, 'node_modules/@capacitor/cli/bin/capacitor'), command, platform],
      { cwd: resolve(workspaceRoot, `apps/${app.folder}`), stdio: 'inherit' },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        `Capacitor ${command} failed for ${app.folder}: ${result.signal ? `signal ${result.signal}` : `exit ${result.status ?? 'unknown'}`}.`,
      );
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runMobile(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

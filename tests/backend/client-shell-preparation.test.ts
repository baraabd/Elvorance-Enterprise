import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareClientShell } from '../acceptance/client-shell.mts';

test('client demo shell preparation preserves content, requires build proof and restores config on sync failure', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'client-shell-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const folder = join(root, 'apps/client-mobile');
  await mkdir(folder, { recursive: true });
  const path = join(folder, 'capacitor.config.json');
  const original = JSON.stringify({
    appId: 'com.elvorance.client',
    webDir: 'dist',
    appName: 'Demo shell',
  });
  await writeFile(path, original);
  let checked = 0;
  let synced = 0;
  const options = {
    workspaceRoot: root,
    env: { CI: 'true', ELVORANCE_DISPOSABLE_ACCEPTANCE: '1' },
    checkBuild: async (app: string, config: { workspaceRoot: string }) => {
      assert.equal(app, 'client-mobile');
      assert.equal(config.workspaceRoot, root);
      checked++;
    },
    sync: (platform: 'android' | 'ios', directory: string) => {
      assert.equal(directory, folder);
      assert.ok(checked > synced, 'build proof must precede every sync');
      const prepared = JSON.parse(readFileSync(path, 'utf8'));
      assert.equal(prepared.appId, 'com.elvorance.client.staging');
      assert.equal(prepared.webDir, 'dist', 'do not replace the real demo bundle with a stub');
      synced++;
      if (platform === 'ios') throw new Error('synthetic sync failure');
    },
  };
  await assert.rejects(prepareClientShell('android', { ...options, env: {} }), /disposable CI/);
  await assert.rejects(prepareClientShell('unknown', options), /Select android or ios/);
  assert.equal(checked, 0);
  await prepareClientShell('android', options);
  assert.equal(await readFile(path, 'utf8'), original);
  await assert.rejects(prepareClientShell('ios', options), /synthetic sync failure/);
  assert.equal(await readFile(path, 'utf8'), original);
  assert.equal(synced, 2);
  await assert.rejects(
    prepareClientShell('android', {
      ...options,
      checkBuild: async () => {
        throw new Error('stale build');
      },
    }),
    /stale build/,
  );
  assert.equal(synced, 2);
  assert.equal(await readFile(path, 'utf8'), original);
});

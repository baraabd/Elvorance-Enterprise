// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import {
  assertAppBuild,
  buildToolInputs,
  completeAppBuilds,
  invalidateAppBuilds,
  recordAppBuild,
} from '../../tooling/scripts/app-build-proof.mts';
import { apps } from '../../tooling/scripts/workspace.mts';

async function fixture(t) {
  const workspaceRoot = await mkdtemp(resolve(tmpdir(), 'elvorance-build-proof-'));
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  async function write(path, content = path) {
    await mkdir(dirname(resolve(workspaceRoot, path)), { recursive: true });
    await writeFile(resolve(workspaceRoot, path), content);
  }
  for (const path of buildToolInputs) await write(path);
  await write('packages/ui/src/common.ts', 'shared UI');
  const records = [];
  for (const { folder } of apps) {
    const inputs = [
      `apps/${folder}/src/main.ts`,
      `apps/${folder}/index.html`,
      `apps/${folder}/config.example.ts`,
      'packages/ui/src/common.ts',
    ];
    for (const path of inputs) await write(path);
    for (const file of [
      'index.html',
      'config.js',
      'assets/app.js',
      'assets/app.css',
      'assets/app.js.map',
    ]) {
      await write(`apps/${folder}/dist/${file}`);
    }
    records.push(await recordAppBuild(folder, inputs, { workspaceRoot }));
  }
  return { workspaceRoot, records, write };
}

test('native sync proof requires the whole build to finish even when representative files exist', async (t) => {
  const fixtureState = await fixture(t);
  const { records } = fixtureState;
  await assert.rejects(assertAppBuild('rep-mobile', fixtureState), {
    code: 'ELVORANCE_BUILD_REQUIRED',
  });
  await assert.rejects(
    completeAppBuilds(records.slice(0, 1), fixtureState),
    /partial application build/,
  );
  await completeAppBuilds(records, fixtureState);
  for (const { folder } of apps) await assertAppBuild(folder, fixtureState);
  await invalidateAppBuilds(fixtureState);
  // Invalidation precedes any artifact write, so a subsequently failed build cannot use
  // the previous successful representative bundle as proof of current build completion.
  await assert.rejects(assertAppBuild('rep-mobile', fixtureState), /Run npm run build:apps/);
});

test('native sync proof rejects stale source and changed or missing assets', async (t) => {
  const fixtureState = await fixture(t);
  const { records, workspaceRoot, write } = fixtureState;
  await completeAppBuilds(records, fixtureState);
  await write('apps/rep-mobile/dist/assets/app.js', 'tampered output');
  await assert.rejects(assertAppBuild('rep-mobile', fixtureState), /output changed.*app\.js/);
  // A change in one app output does not prevent checking an intact other app.
  await assertAppBuild('client-mobile', fixtureState);
  await rm(resolve(workspaceRoot, 'apps/client-mobile/dist/config.js'));
  await assert.rejects(
    assertAppBuild('client-mobile', fixtureState),
    /output file is unavailable.*config\.js/,
  );
  await write('packages/ui/src/common.ts', 'changed shared source');
  await assert.rejects(assertAppBuild('admin-web', fixtureState), /source changed.*common\.ts/);
});

test('native sync proof rejects truncated manifests and paths outside its workspace', async (t) => {
  const fixtureState = await fixture(t);
  const { records, workspaceRoot, write } = fixtureState;
  await completeAppBuilds(records, fixtureState);
  const manifest = JSON.parse(
    await readFile(resolve(workspaceRoot, 'dist/apps-build.json'), 'utf8'),
  );
  manifest.apps['rep-mobile'].inputs['../outside-workspace'] = 'untrusted';
  await write('dist/apps-build.json', JSON.stringify(manifest));
  await assert.rejects(assertAppBuild('rep-mobile', fixtureState), {
    code: 'ELVORANCE_BUILD_REQUIRED',
  });
  await write('dist/apps-build.json', '{');
  await assert.rejects(
    assertAppBuild('rep-mobile', fixtureState),
    /no readable complete application build/,
  );
});

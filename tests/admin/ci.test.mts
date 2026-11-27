import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { browserCleanup } from './chromium.mts';
import { spawnSync, spawn } from 'node:child_process';

test('S05 browser lane is mandatory, counted, isolated and retains existing runtime gates', async () => {
  const contract = JSON.parse(await readFile('docs/production/full-ci-contract.json', 'utf8')) as {
    requiredJobs: string[];
    lanes: {
      name: string;
      commands: string[];
      countedCommands: string[];
      allowedSkips: string[];
    }[];
  };
  assert.ok(contract.requiredJobs.includes('admin-browser'));
  assert.ok(contract.requiredJobs.includes('runtime'));
  const lane = contract.lanes.find((row) => row.name === 'admin-browser');
  assert.ok(lane);
  assert.deepEqual(lane.commands, ['admin-e2e']);
  assert.deepEqual(lane.countedCommands, ['admin-e2e']);
  assert.deepEqual(lane.allowedSkips, []);
  const workflow = await readFile('.github/workflows/full-ci.yml', 'utf8');
  assert.match(workflow, /ELVORANCE_ADMIN_E2E_STORAGE: postgres/);
  assert.match(workflow, /127\.0\.0\.1:5432\/postgres/);
  assert.doesNotMatch(workflow, /ELVORANCE_ADMIN_E2E_DRIVER: dom|continue-on-error/);
});
for (const [storage, driver] of [
  ['memory', 'chromium'],
  ['postgres', 'dom'],
]) {
  test(`S05 CI rejects ${storage}/${driver} as browser persistence acceptance`, () => {
    const result = spawnSync(process.execPath, ['tests/admin/run-e2e.mts'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: 'true',
        ELVORANCE_ADMIN_E2E_STORAGE: storage,
        ELVORANCE_ADMIN_E2E_DRIVER: driver,
      },
      timeout: 10000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /CI browser acceptance must use PostgreSQL/);
  });
}

for (const ignoreTerm of [false, true]) {
  test(`S05 browser cleanup waits for ${ignoreTerm ? 'forced' : 'normal'} termination and is idempotent`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'elvorance-s05-cleanup-test-'));
    const child = spawn(
      process.execPath,
      [
        '-e',
        `
      const fs = require('node:fs');
      const target = process.argv[1] + '/active-profile';
      if (${ignoreTerm}) process.on('SIGTERM', () => {});
      fs.writeFileSync(target, 'running');
      setInterval(() => fs.writeFileSync(target, 'running'), 5);
      process.stdout.write('ready');
    `,
        directory,
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    const cleanup = browserCleanup(child, directory);
    try {
      assert.ok(child.stdout);
      await once(child.stdout, 'data');
      await Promise.all([cleanup(), cleanup()]);
      assert.ok(child.exitCode !== null || child.signalCode !== null);
      await assert.rejects(access(directory), { code: 'ENOENT' });
      await cleanup();
    } finally {
      await cleanup();
    }
  });
}

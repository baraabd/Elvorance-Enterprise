import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

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

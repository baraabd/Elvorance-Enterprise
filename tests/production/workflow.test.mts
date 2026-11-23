import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import type { FullContract } from '../../tooling/production/gate.mts';
const load = async () =>
  JSON.parse(await readFile('docs/production/full-ci-contract.json', 'utf8')) as FullContract;
test('FULL-CI retains every project suite and all mandatory native/runtime/identity/security lanes', async () => {
  const contract = await load();
  for (const name of [
    'project-linux',
    'project-windows',
    'native-verify',
    'backend-runtime',
    'native-android',
    'native-ios',
    'identity',
    'security',
    'browser',
  ])
    assert.ok(
      contract.lanes.some((lane) => lane.name === name),
      name,
    );
  const preserved = ['types', 'boundaries', 'build', 'tests', 'parity', 'regression'];
  for (const name of ['project-linux', 'project-windows', 'native-verify']) {
    const lane = contract.lanes.find((row) => row.name === name);
    assert.ok(lane);
    for (const id of preserved) assert.ok(lane.commands.includes(id), `${name}: ${id}`);
    for (const id of ['tests', 'parity', 'regression'])
      assert.ok(lane.countedCommands.includes(id));
  }
  for (const name of ['project-linux', 'project-windows']) {
    const lane = contract.lanes.find((row) => row.name === name);
    assert.ok(lane);
    for (const id of ['inventory', 'merged', 'example-build', 'format', 'package'])
      assert.ok(lane.commands.includes(id));
  }
  assert.equal(
    contract.lanes.find((lane) => lane.name === 'project-linux')?.allowedSkips.length,
    0,
  );
  for (const lane of contract.lanes) {
    assert.equal(new Set(lane.commands).size, lane.commands.length);
    assert.ok(lane.commands.length > 0);
    for (const id of lane.countedCommands) assert.ok(lane.commands.includes(id));
  }
});
test('required aggregation always runs and includes every dependency without path or error bypass', async () => {
  const source = await readFile('.github/workflows/full-ci.yml', 'utf8');
  const contract = await load();
  assert.match(source, /merge_group:/);
  assert.match(source, /pull_request:/);
  assert.match(source, /workflow_dispatch:/);
  assert.match(source, /name: FULL-CI \/ required/);
  assert.match(source, /if: \$\{\{ always\(\) \}\}/);
  const dependencies = /needs: \[([^\]]+)\]/
    .exec(source)?.[1]
    ?.split(',')
    .map((name) => name.trim())
    .sort();
  assert.deepEqual(dependencies, [...contract.requiredJobs].sort());
  assert.doesNotMatch(source, /paths(?:-ignore)?:|continue-on-error:|pull_request_target:/);
  assert.match(source, /FULL_CI_NEEDS: \$\{\{ toJSON\(needs\) \}\}/);
});
test('all third-party workflow actions are immutable commits and verification jobs use read-only contents', async () => {
  for (const file of (await readdir('.github/workflows')).filter(
    (file) => file.endsWith('.yml') && !file.startsWith('s01-bootstrap'),
  )) {
    const source = await readFile('.github/workflows/' + file, 'utf8');
    for (const match of source.matchAll(/uses:\s+([^\s#]+)/g)) {
      const reference = match[1];
      assert.ok(reference);
      if (!reference.startsWith('./'))
        assert.match(reference, /@[a-f0-9]{40}$/, file + ': ' + reference);
    }
    assert.match(source, /contents: read/);
    assert.doesNotMatch(source, /continue-on-error:\s*true/);
  }
});

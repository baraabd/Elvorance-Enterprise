import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requiredGates, requiredJobs } from '../../tooling/production/gate.mts';

const read = (path: string): string => readFileSync(path, 'utf8');
const workflowPaths = [
  'full-ci',
  'verify',
  'backend-runtime',
  'rep-native-verification',
  's01-identity',
].map((name) => `.github/workflows/${name}.yml`);
test('S01 workflow policy: the mandatory aggregate runs even when a dependency fails or skips', () => {
  const workflow = read(workflowPaths[0]!);
  assert.match(workflow, /name: FULL-CI\s+if: always\(\)/);
  for (const job of requiredJobs) assert.match(workflow, new RegExp(`^  ${job}:`, 'm'));
  assert.match(workflow, /needs: \[project, distributed, native, identity, security\]/);
  assert.match(workflow, /S01_NEEDS:.*toJSON\(needs\)/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /merge_group:/);
  assert.doesNotMatch(workflow, /paths-ignore:|continue-on-error:|pull_request_target:/);
});
test('S01 workflow policy: every required gate has attempt-qualified evidence and exact-head checkout', () => {
  const workflows = workflowPaths.map(read);
  for (const gate of requiredGates)
    assert.ok(
      workflows.some((value) => value.includes(`s01-${gate}-a`)),
      gate,
    );
  for (const workflow of workflows) {
    assert.match(workflow, /github\.event\.pull_request\.head\.sha \|\| github\.sha/);
    assert.match(workflow, /persist-credentials: false/);
    assert.match(workflow, /if-no-files-found: error/);
    assert.doesNotMatch(workflow, /contents: write|secrets: inherit/);
    for (const action of workflow.matchAll(/uses: ([^\s]+)\s*/g)) {
      if (action[1]!.startsWith('./')) continue;
      assert.match(action[1]!, /^[\w-]+\/[\w-]+@[a-f0-9]{40}$/, action[1]);
    }
  }
});
test('S01 workflow policy: quality execution retains all existing suites and source proof', () => {
  const runner = read('tooling/production/run-quality.mts');
  for (const script of [
    'inventory:check',
    'check:types',
    'check:boundaries',
    'audit:migration:report',
    'build',
    'test',
    'test:parity',
    'test:regression',
    'test:merged',
    'check:format',
    'package',
  ])
    assert.ok(runner.includes(`npmRun('${script}')`), script);
  assert.ok(runner.includes('examples/instant-close/build.mts'));
  assert.ok(runner.includes('tooling/production/source-proof.mts'));
  assert.match(read('.github/workflows/verify.yml'), /ELVORANCE_TEST_POSTGRES_URL:/);
  assert.match(
    read('.github/workflows/s01-identity.yml'),
    /node tooling\/scripts\/test-local-identity\.mts/,
  );
});
test('S01 workflow policy: dependency-free aggregate does not need a successful package install', () => {
  for (const path of [
    'tooling/production/gate.mts',
    'tooling/production/evidence.mts',
    'tooling/production/values.mts',
  ]) {
    const imports = [...read(path).matchAll(/from ['"]([^'"]+)['"]/g)].map((match) => match[1]!);
    assert.ok(
      imports.every(
        (value) => value.startsWith('node:') || ['./values.mts', './evidence.mts'].includes(value),
      ),
      path,
    );
  }
});

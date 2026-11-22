import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  evaluate,
  requiredGates,
  requiredMetrics,
  requiredJobs,
  verifyEvidenceFiles,
  type GateInput,
} from '../../tooling/production/gate.mts';
import { parseTap, parseJUnit, type GateEvidence } from '../../tooling/production/evidence.mts';
import { digest } from '../../tooling/production/source.mts';

function fixture(): GateInput {
  const sourceSha = 'a'.repeat(40),
    sourceTree = 'b'.repeat(40),
    repository = 'owner/repo',
    runId = '123',
    attempt = 2;
  const reports: GateEvidence[] = requiredGates.map((gate) => ({
    schemaVersion: 1,
    gate,
    sourceSha,
    sourceTree,
    repository,
    runId,
    attempt,
    runUrl: 'https://github.com/owner/repo/actions/runs/123/attempts/2',
    execution: 'github-actions',
    lockSha256: 'c'.repeat(64),
    status: 'PASS',
    blockers: [],
    metrics: requiredMetrics[gate].map((name) => ({
      name,
      totals: { tests: 1, passed: 1, failed: 0, skipped: 0, cancelled: 0, todo: 0 },
    })),
    files: [{ path: 'dist/results.log', bytes: 4, sha256: digest('pass') }],
  }));
  return {
    sourceSha,
    sourceTree,
    repository,
    runId,
    attempt,
    needs: Object.fromEntries(requiredJobs.map((job) => [job, { result: 'success' }])),
    evidence: reports,
    artifacts: [
      ...requiredGates.map((gate) => `s01-${gate}-a2`),
      'elvorance-enterprise-source-a2',
      'elvorance-enterprise-source-windows-a2',
    ].map((name, i) => ({
      id: i + 1,
      name,
      expired: false,
      digest: `sha256:${'d'.repeat(64)}`,
      workflow_run: { head_sha: sourceSha },
      size_in_bytes: 4,
      created_at: '2026-11-22T00:00:00Z',
    })),
  };
}
test('S01 gate: only complete matching source/run/attempt evidence passes', () => {
  assert.deepEqual(evaluate(fixture()), { status: 'PASS', blockers: [] });
});
for (const result of ['failure', 'cancelled', 'skipped', 'pending', 'neutral', 'timed_out'])
  test(`S01 gate: ${result} is BLOCKED, never success`, () => {
    const input = fixture();
    input.needs.project = { result };
    assert.equal(evaluate(input).status, 'BLOCKED');
  });
test('S01 gate: missing mandatory dependency is BLOCKED', () => {
  const input = fixture();
  delete input.needs.native;
  assert.equal(evaluate(input).status, 'BLOCKED');
});
test('S01 gate: missing or duplicate reports cannot pass', () => {
  const input = fixture();
  input.evidence.pop();
  assert.equal(evaluate(input).status, 'BLOCKED');
  const duplicate = fixture();
  duplicate.evidence.push(duplicate.evidence[0]!);
  assert.equal(evaluate(duplicate).status, 'BLOCKED');
});
test('S01 gate: evidence from an old commit, tree or attempt cannot pass', () => {
  for (const field of ['sourceSha', 'sourceTree', 'attempt', 'runId'] as const) {
    const input = fixture();
    const first = input.evidence[0]!;
    if (field === 'attempt') first.attempt = 1;
    else first[field] = 'old';
    assert.equal(evaluate(input).status, 'BLOCKED', field);
  }
});
test('S01 gate: missing, expired, wrong-source or undigested artifacts cannot pass', () => {
  for (const mutate of [
    (input: GateInput) => {
      input.artifacts.pop();
    },
    (input: GateInput) => {
      input.artifacts[0]!.expired = true;
    },
    (input: GateInput) => {
      delete input.artifacts[0]!.digest;
    },
    (input: GateInput) => {
      input.artifacts[0]!.workflow_run!.head_sha = 'f'.repeat(40);
    },
  ]) {
    const input = fixture();
    mutate(input);
    assert.equal(evaluate(input).status, 'BLOCKED');
  }
});
test('S01 gate: passing job status cannot mask failing test totals or new skips', () => {
  const input = fixture();
  input.evidence[0]!.metrics[0]!.totals!.failed = 1;
  assert.equal(evaluate(input).status, 'BLOCKED');
  const skipped = fixture();
  skipped.evidence[0]!.metrics[0]!.totals = {
    tests: 1,
    passed: 0,
    failed: 0,
    skipped: 1,
    cancelled: 0,
    todo: 0,
  };
  assert.equal(evaluate(skipped).status, 'BLOCKED');
});
test('S01 gate: local results are not a GitHub FULL-CI attestation', () => {
  const input = fixture();
  input.evidence[0]!.execution = 'local-not-remote-attestation';
  assert.equal(evaluate(input).status, 'BLOCKED');
});
test('S01 gate: absent TAP summary remains unknown, not zero tests passed', () => {
  assert.equal(parseTap('build succeeded'), null);
  assert.deepEqual(
    parseTap('# tests 3\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n'),
    { tests: 3, passed: 2, failed: 0, cancelled: 0, skipped: 1, todo: 0 },
  );
});
test('S01 gate: native JUnit totals retain failures and skips', () => {
  assert.deepEqual(
    parseJUnit(
      '<testsuite name="device" tests="3" failures="1" errors="0" skipped="1"></testsuite>',
    ),
    { tests: 3, passed: 1, failed: 1, cancelled: 0, skipped: 1, todo: 0 },
  );
  assert.equal(parseJUnit('<not-results/>'), null);
});
test('S01 gate: changed artifact bytes and path traversal are rejected', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 's01-evidence-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const artifactRoot = join(directory, 'artifact');
  mkdirSync(join(artifactRoot, 'dist'), { recursive: true });
  writeFileSync(join(artifactRoot, 'dist/results.log'), 'pass');
  const report = fixture().evidence[0]!;
  assert.deepEqual(verifyEvidenceFiles(directory, [{ report, artifactRoot }]), []);
  writeFileSync(join(artifactRoot, 'dist/results.log'), 'fail');
  assert.match(
    verifyEvidenceFiles(directory, [{ report, artifactRoot }]).join(),
    /digest mismatch/,
  );
  report.files[0]!.path = '../../secret';
  assert.match(verifyEvidenceFiles(directory, [{ report, artifactRoot }]).join(), /escaped/);
});

test('S01 gate: arbitrary or missing mandatory metric sections cannot satisfy a gate', () => {
  const input = fixture();
  input.evidence[0]!.metrics = [
    {
      name: 'unrelated-success',
      totals: { tests: 1, passed: 1, failed: 0, skipped: 0, cancelled: 0, todo: 0 },
    },
  ];
  assert.equal(evaluate(input).status, 'BLOCKED');
  const empty = fixture();
  empty.evidence[0]!.metrics[0]!.totals = null;
  assert.equal(evaluate(empty).status, 'BLOCKED');
});

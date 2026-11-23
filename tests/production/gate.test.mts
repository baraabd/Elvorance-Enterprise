import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import {
  evaluate,
  parseTap,
  type FullContract,
  type GateContext,
  type LaneReport,
} from '../../tooling/production/gate.mts';
import {
  verifyBundle,
  selectArtifact,
  type Artifact,
} from '../../tooling/production/aggregate.mts';
import { hash } from '../../tooling/production/evidence.mts';
const context: GateContext = {
  sourceSha: 'a'.repeat(40),
  sourceTree: 'b'.repeat(40),
  runId: '123',
  runAttempt: '2',
  repository: 'owner/repo',
  lockSha256: 'c'.repeat(64),
};
const contract: FullContract = {
  schemaVersion: 1,
  requiredJobs: ['project'],
  lanes: [
    {
      name: 'project-linux',
      commands: ['tests'],
      countedCommands: ['tests'],
      allowedSkips: [],
      scope: 'isolated gate regression fixture',
    },
  ],
};
function first<T>(values: T[]): T {
  const value = values[0];
  if (value === undefined) throw new Error('Missing fixture entry');
  return value;
}
const log =
  'TAP version 13\n1..1\nok 1 - sample\n# tests 1\n# pass 1\n# fail 0\n# skipped 0\n# todo 0\n';
function passing(): LaneReport {
  return {
    schemaVersion: 1,
    lane: 'project-linux',
    status: 'PASS',
    ...context,
    platform: 'linux',
    node: 'v24.22.1',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:01.000Z',
    commands: [
      {
        id: 'tests',
        argv: ['node', '--test'],
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T00:00:01.000Z',
        exitCode: 0,
        status: 'PASS',
        log: 'logs/tests.log',
        logSha256: hash(log),
        tests: { total: 1, passed: 1, failed: 0, skipped: 0, skipNames: [], unit: 'fixture' },
      },
    ],
    artifacts: [{ path: 'logs/tests.log', sha256: hash(log), bytes: Buffer.byteLength(log) }],
    blockers: [],
    sourceUnchanged: true,
    scope: 'unit fixture, never real CI evidence',
  };
}
test('FULL-CI accepts complete same-SHA same-attempt evidence with bound logs', () => {
  assert.equal(
    evaluate(contract, context, [passing()], { project: { result: 'success' } }).status,
    'PASS',
  );
});
for (const status of [
  'failure',
  'cancelled',
  'skipped',
  'timed_out',
  'pending',
  'queued',
  'in_progress',
  'neutral',
  'action_required',
]) {
  test(`FULL-CI rejects mandatory job result ${status}`, () => {
    assert.equal(
      evaluate(contract, context, [passing()], { project: { result: status } }).status,
      'BLOCKED',
    );
  });
}
test('FULL-CI rejects missing jobs and missing or duplicate lane reports', () => {
  assert.equal(evaluate(contract, context, [passing()], {}).status, 'BLOCKED');
  assert.equal(
    evaluate(contract, context, [], { project: { result: 'success' } }).status,
    'BLOCKED',
  );
  assert.equal(
    evaluate(contract, context, [passing(), passing()], { project: { result: 'success' } }).status,
    'BLOCKED',
  );
});
for (const field of [
  'sourceSha',
  'sourceTree',
  'runId',
  'runAttempt',
  'repository',
  'lockSha256',
] as const) {
  test(`FULL-CI rejects stale ${field}`, () => {
    const report = passing();
    report[field] = 'wrong';
    assert.equal(
      evaluate(contract, context, [report], { project: { result: 'success' } }).status,
      'BLOCKED',
    );
  });
}
test('FULL-CI rejects command failure, missing command, unbound log, source changes and blockers', () => {
  const mutations: Array<(report: LaneReport) => void> = [
    (report) => {
      first(report.commands).exitCode = 1;
    },
    (report) => {
      report.commands = [];
    },
    (report) => {
      report.artifacts = [];
    },
    (report) => {
      first(report.commands).logSha256 = '0'.repeat(64);
    },
    (report) => {
      report.sourceUnchanged = false;
    },
    (report) => {
      report.blockers = ['provider missing'];
    },
    (report) => {
      first(report.commands).finishedAt = 'not-a-time';
    },
    (report) => {
      first(report.commands).startedAt = '2025-01-01T00:00:00.000Z';
    },
  ];
  for (const mutate of mutations) {
    const report = passing();
    mutate(report);
    assert.equal(
      evaluate(contract, context, [report], { project: { result: 'success' } }).status,
      'BLOCKED',
    );
  }
});
test('FULL-CI rejects missing, zero, failed and skipped mandatory test totals', () => {
  for (const counts of [
    null,
    { total: 0, passed: 0, failed: 0, skipped: 0, skipNames: [], unit: 'fixture' },
    { total: 1, passed: 0, failed: 1, skipped: 0, skipNames: [], unit: 'fixture' },
    { total: 1, passed: 0, failed: 0, skipped: 1, skipNames: ['mandatory'], unit: 'fixture' },
  ]) {
    const report = passing();
    first(report.commands).tests = counts;
    assert.equal(
      evaluate(contract, context, [report], { project: { result: 'success' } }).status,
      'BLOCKED',
    );
  }
});
test('only the exact declared redundant matrix skip is accepted; no wildcard skip budget', () => {
  const scoped = structuredClone(contract);
  first(scoped.lanes).allowedSkips = ['redundant platform fixture'];
  const report = passing();
  first(report.commands).tests = {
    total: 2,
    passed: 1,
    failed: 0,
    skipped: 1,
    skipNames: ['redundant platform fixture'],
    unit: 'fixture',
  };
  assert.equal(
    evaluate(scoped, context, [report], { project: { result: 'success' } }).status,
    'PASS',
  );
  const command = first(report.commands);
  assert.ok(command.tests);
  command.tests.skipNames = ['different skipped test'];
  assert.equal(
    evaluate(scoped, context, [report], { project: { result: 'success' } }).status,
    'BLOCKED',
  );
});
test('TAP parser requires real totals and rejects TODO, unreported skips and truncation', () => {
  assert.equal(parseTap(log)?.total, 1);
  assert.equal(parseTap('Everything passed'), null);
  assert.equal(parseTap(log.replace('# todo 0', '# todo 1')), null);
  assert.equal(parseTap(log.replace('# skipped 0', '# skipped 1')), null);
  assert.equal(parseTap(log.replace('# tests 1\n', '')), null);
});
test('artifact verifier binds ZIP, report manifest and exact log bytes', () => {
  const report = passing();
  const bytes = zipSync({
    'report.json': strToU8(JSON.stringify(report)),
    'logs/tests.log': strToU8(log),
  });
  assert.equal(verifyBundle(bytes, 'sha256:' + hash(bytes)).sourceSha, context.sourceSha);
  assert.throws(() => verifyBundle(bytes, 'sha256:' + '0'.repeat(64)), /digest mismatch/);
  const tampered = zipSync({
    'report.json': strToU8(JSON.stringify(report)),
    'logs/tests.log': strToU8('changed'),
  });
  assert.throws(() => verifyBundle(tampered, 'sha256:' + hash(tampered)), /tampered/);
  const absent = zipSync({ 'report.json': strToU8(JSON.stringify(report)) });
  assert.throws(() => verifyBundle(absent, 'sha256:' + hash(absent)), /missing from ZIP/);
});
test('artifact verifier rejects traversal, unmanifested content and missing report', () => {
  const report = passing();
  for (const entries of [
    { '../escape': strToU8('bad') },
    { 'logs/tests.log': strToU8(log) },
    {
      'report.json': strToU8(JSON.stringify(report)),
      'logs/tests.log': strToU8(log),
      unlisted: strToU8('bad'),
    },
  ]) {
    const bytes = zipSync(entries);
    assert.throws(() => verifyBundle(bytes, 'sha256:' + hash(bytes)));
  }
});
test('artifact selection rejects expired, foreign-run, duplicate and missing digest evidence', () => {
  const artifact: Artifact = {
    id: 1,
    name: 'exact',
    digest: 'sha256:' + 'a'.repeat(64),
    expired: false,
    workflow_run: { id: 123, head_sha: context.sourceSha },
  };
  assert.equal(selectArtifact([artifact], 'exact', '123').id, 1);
  assert.throws(() => selectArtifact([], 'exact', '123'));
  assert.throws(() => selectArtifact([artifact, artifact], 'exact', '123'));
  assert.throws(() => selectArtifact([{ ...artifact, expired: true }], 'exact', '123'));
  assert.throws(() => selectArtifact([artifact], 'exact', '124'));
  assert.throws(() => selectArtifact([{ ...artifact, digest: '' }], 'exact', '123'));
});

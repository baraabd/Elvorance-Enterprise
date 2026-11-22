import test from 'node:test';
import assert from 'node:assert/strict';
import { gapReport, reasonCategory } from '../../tooling/production/gap-report.mts';
import type { Feature, Inventory } from '../../tooling/production/model.mts';
function row(id: string, unresolved: string[]): Feature {
  return {
    id,
    key: id,
    kind: 'form',
    apps: [],
    mode: 'server',
    source: {
      path: 'apps/rep-mobile/src/form.ts',
      line: 1,
      endLine: 1,
      fingerprint: 'a'.repeat(64),
    },
    owningService: null,
    targetService: null,
    endpoints: [],
    authorization: { status: 'UNKNOWN', controls: [], roles: [], evidence: [] },
    persistenceEvent: { status: 'UNKNOWN', tables: [], events: [], evidence: [] },
    currentStatus: 'REVIEW_REQUIRED',
    targetSprint: 'S02',
    categories: [],
    tests: { contract: [], integration: [], e2e: [], related: [], verification: 'NOT_EXECUTED' },
    requiredTests: [],
    presentationOnly: null,
    unresolved,
  };
}
function sample(features: Feature[]): Inventory {
  return {
    schemaVersion: 1,
    methodology: 'fixture',
    sourceDigest: 'f'.repeat(64),
    sourceFiles: [],
    runtimeRegistrations: [],
    features,
    tests: [],
    totals: {},
    limitations: [],
  };
}
const testDebt =
  'No source-reference test mapping discovered; required tests remain planned, not executed.';
const dynamic = 'Dynamic URL/method requires runtime contract validation.';
test('gap classification separates semantic uncertainty from test-only debt without dropping IDs', () => {
  const report = gapReport(
    sample([row('a', [testDebt]), row('b', [dynamic, testDebt]), row('c', [])]),
  );
  assert.equal(report.status, 'BLOCKED');
  assert.deepEqual(report.totals, {
    unresolvedRecords: 2,
    recordsWithSemanticGaps: 1,
    recordsWithOnlyTestMappingDebt: 1,
    workflowsWithoutTestCandidates: 3,
  });
  assert.deepEqual(report.byCategory['test-mapping'], ['a', 'b']);
  assert.deepEqual(report.byCategory['endpoint-dynamic'], ['b']);
  assert.deepEqual(
    report.records.map((r) => r.featureId),
    ['a', 'b'],
  );
});
test('new unrecognized extractor warnings are retained and block semantic acceptance', () => {
  assert.equal(reasonCategory('unrecognized warning'), 'unknown-warning');
  const report = gapReport(sample([row('a', ['unrecognized warning'])]));
  assert.equal(report.status, 'BLOCKED');
  assert.deepEqual(report.byCategory['unknown-warning'], ['a']);
  assert.equal(report.totals.recordsWithSemanticGaps, 1);
});
test('zero extractor warnings never upgrades an inventory to verified business acceptance', () => {
  const report = gapReport(sample([row('a', [])]));
  assert.equal(report.status, 'NO_EXTRACTOR_GAPS_NOT_ACCEPTANCE');
  assert.equal(report.totals.workflowsWithoutTestCandidates, 1);
  assert.ok(report.scope.includes('not completeness certification'));
});
test('multiple reasons in the same category count the feature once but preserve every reason', () => {
  const report = gapReport(sample([row('a', ['new warning A', 'new warning B'])]));
  assert.equal(report.categoryCounts['unknown-warning'], 1);
  assert.equal(report.records[0]?.reasons.length, 2);
});

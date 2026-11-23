import type { Inventory } from './model.mts';

/** Closed taxonomy: a new extractor warning cannot silently disappear from the review queue. */
const reasonCategories = new Map([
  [
    'No source-reference test mapping discovered; required tests remain planned, not executed.',
    'test-mapping',
  ],
  [
    'No literal endpoint resolved; inspect shared/dynamic dispatch before claiming backend completion.',
    'endpoint-unresolved',
  ],
  ['Dynamic URL/method requires runtime contract validation.', 'endpoint-dynamic'],
  [
    'Native source is inventoried per adapter; method-level platform/security review remains required.',
    'native-policy',
  ],
]);
export function reasonCategory(reason: string): string {
  if (reason.startsWith('Runtime registration exists but declaration is shared/dynamic'))
    return 'registration-anchor';
  if (reason.startsWith('Multiple compatible source declarations')) return 'registration-anchor';
  return reasonCategories.get(reason) ?? 'unknown-warning';
}
/** Records source gaps separately from test debt. Neither a plan nor a source link is acceptance. */
export function gapReport(inventory: Inventory) {
  const records = inventory.features
    .filter((row) => row.unresolved.length > 0)
    .map((row) => ({
      featureId: row.id,
      source: row.source,
      owningService: row.owningService,
      targetService: row.targetService,
      mode: row.mode,
      targetSprint: row.targetSprint,
      reasons: row.unresolved.map((reason) => ({ category: reasonCategory(reason), reason })),
      requiredTests: row.requiredTests,
      disposition: 'OPEN_NOT_ACCEPTED',
    }));
  const byCategory: Record<string, string[]> = {};
  for (const record of records) {
    for (const category of new Set(record.reasons.map((entry) => entry.category))) {
      (byCategory[category] ??= []).push(record.featureId);
    }
  }
  const semantic = records.filter((record) =>
    record.reasons.some((entry) => entry.category !== 'test-mapping'),
  );
  const testOnly = records.filter((record) =>
    record.reasons.every((entry) => entry.category === 'test-mapping'),
  );
  return {
    schemaVersion: 1,
    sourceDigest: inventory.sourceDigest,
    status: records.length ? 'BLOCKED' : 'NO_EXTRACTOR_GAPS_NOT_ACCEPTANCE',
    semanticStatus: semantic.length ? 'BLOCKED' : 'SOURCE_TRACE_COMPLETE_NOT_RUNTIME_ACCEPTANCE',
    sourceBoundDecisions: inventory.features.filter((row) => row.sourceTrace).length,
    scope:
      'Extractor warning classification, not completeness certification, test execution or workflow coverage.',
    unknownWarningsFailClosed: true,
    totals: {
      unresolvedRecords: records.length,
      recordsWithSemanticGaps: semantic.length,
      recordsWithOnlyTestMappingDebt: testOnly.length,
      workflowsWithoutTestCandidates: inventory.features.filter(
        (row) =>
          ['route', 'action', 'form', 'background-job'].includes(row.kind) &&
          row.tests.related.length === 0,
      ).length,
    },
    categoryCounts: Object.fromEntries(
      Object.entries(byCategory)
        .sort()
        .map(([category, ids]) => [category, ids.length]),
    ),
    byCategory,
    records,
    acceptancePrerequisites: [
      'Resolve every semantic gap with source-bound evidence; an empty warning set alone does not certify exhaustiveness.',
      'Keep unmapped workflows and planned tests as debt; do not count a candidate link as executed coverage.',
      'Reconcile the accompanying contract, named ownership and actual enforced repository protection.',
      'Execute and validate FULL-CI on the final published source SHA and merge candidate.',
    ],
  };
}

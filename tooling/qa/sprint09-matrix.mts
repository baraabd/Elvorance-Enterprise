import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import prettier from 'prettier';
import type { Inventory } from '../production/model.mts';

// Candidate links are traceability, never per-feature execution or coverage evidence.
const inventory = JSON.parse(
  await readFile('docs/production/feature-matrix.json', 'utf8'),
) as Inventory;
const matrix = {
  schemaVersion: 1,
  sourceDigest: inventory.sourceDigest,
  scope:
    'Every discovered source feature, including all three applications and services. Execution belongs to exact-SHA CI artifacts, not inferred links.',
  individualFeatureAcceptance: 'NOT_ESTABLISHED',
  features: inventory.features.map((row) => ({
    id: row.id,
    apps: row.apps,
    service: row.owningService ?? row.targetService,
    kind: row.kind,
    mode: row.mode,
    source: row.source,
    endpoints: row.endpoints,
    authorization: row.authorization,
    persistence: row.persistenceEvent,
    candidateTests: row.tests,
    requiredTests: row.requiredTests,
    observedImplementation: row.currentStatus,
    executionStatus: 'NOT_INDIVIDUALLY_VERIFIED',
    remainingGaps: row.unresolved,
  })),
};
const path = resolve('docs/qa/sprint09/test-matrix.json');
const text = await prettier.format(JSON.stringify(matrix), {
  ...(await prettier.resolveConfig('package.json')),
  parser: 'json',
});
if (process.argv.includes('--write')) {
  await mkdir(resolve('docs/qa/sprint09'), { recursive: true });
  await writeFile(path, text);
} else if ((await readFile(path, 'utf8')) !== text) {
  throw new Error('Sprint09 matrix drift: regenerate from the reviewed feature inventory.');
}
console.log(
  JSON.stringify({
    features: matrix.features.length,
    sourceDigest: matrix.sourceDigest,
    status: 'TRACEABILITY_PASS_NOT_FEATURE_ACCEPTANCE',
  }),
);

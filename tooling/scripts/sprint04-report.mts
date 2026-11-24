import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { format, resolveConfig } from 'prettier';
interface Endpoint {
  service: string;
  method: string;
  gatewayPath: string;
  servicePath: string;
  roles: string[];
  summary: string;
}
interface Feature {
  id: string;
  key: string;
  kind: string;
  apps: string[];
  mode: string;
  source: { path: string; line: number };
  currentStatus: string;
  targetService: string | null;
  owningService: string | null;
  endpoints: unknown[];
  unresolved: string[];
}
const routes = JSON.parse(
  await readFile('packages/contracts/route-inventory.json', 'utf8'),
) as Endpoint[];
const source = JSON.parse(await readFile('docs/production/feature-matrix.json', 'utf8')) as {
  sourceDigest: string;
  totals: Record<string, number>;
  features: Feature[];
};
const additions = JSON.parse(
  await readFile('packages/contracts/sprint04-additions.json', 'utf8'),
) as { operations: Endpoint[] };
const added = new Set(additions.operations.map((row) => row.method + ' ' + row.gatewayPath));
const services = ['identity', 'crm', 'sales', 'delivery', 'billing', 'tracking', 'communications'];
assert.equal(new Set(routes.map((row) => row.service)).size, 7);
let table =
  '# Sprint 04 endpoint inventory\n\nGenerated from the source-bound API contracts. Seven domain services; API Gateway owns no business database. Registration and contract tests verify both directions. Counts do not prove UI integration or product acceptance.\n\n';
table += '| Service | Before | After |\n|---|---:|---:|\n';
for (const service of services) {
  const rows = routes.filter((row) => row.service === service);
  table += `| ${service} | ${rows.filter((row) => !added.has(row.method + ' ' + row.gatewayPath)).length} | ${rows.length} |\n`;
}
table +=
  '\n| Method | Gateway endpoint | Roles, with server-side owner scope | Change |\n|---|---|---|---|\n';
for (const row of routes)
  table += `| ${row.method} | \`${row.gatewayPath}\` | ${row.roles.join(', ')} | ${added.has(row.method + ' ' + row.gatewayPath) ? 'Added in Sprint 04' : 'Preserved'} |\n`;
await writeFile(
  'docs/sprint04/ENDPOINTS.md',
  await format(table, {
    ...(await resolveConfig('docs/sprint04/ENDPOINTS.md')),
    parser: 'markdown',
  }),
);
const cell = (value: unknown) => String(value ?? '').replace(/[\t\r\n]+/g, ' ');
const header = [
  'featureId',
  'apps',
  'mode',
  'kind',
  'key',
  'source',
  'observedStatus',
  'owningService',
  'targetService',
  'endpointCandidates',
  'unresolvedReasons',
];
const records = source.features.map((row) => [
  row.id,
  row.apps.join(','),
  row.mode,
  row.kind,
  row.key,
  row.source.path + ':' + row.source.line,
  row.currentStatus,
  row.owningService,
  row.targetService,
  JSON.stringify(row.endpoints),
  row.unresolved.join(' | '),
]);
await writeFile(
  'docs/sprint04/FEATURE-COMPARISON.tsv',
  [header, ...records].map((row) => row.map(cell).join('\t')).join('\n') + '\n',
);
const report = {
  schemaVersion: 1,
  sourceDigest: source.sourceDigest,
  totals: source.totals,
  interpretation:
    'Source observations across Admin, Client, Representative and shared/backend code. Demo and unresolved observations are not completed journeys. This is not a signed product requirements catalog or measured coverage percentage.',
  domainServices: services,
  gatewayHasDatabase: false,
  apiOperations: routes.length,
  newOperations: additions.operations.length,
  productAcceptance: 'INCOMPLETE',
  unresolved: source.features
    .filter((row) => row.unresolved.length || row.mode === 'demo')
    .map((row) => ({
      featureId: row.id,
      apps: row.apps,
      mode: row.mode,
      source: row.source,
      reasons: row.unresolved,
    })),
};
await writeFile(
  'docs/sprint04/GAPS.json',
  await format(JSON.stringify(report), {
    ...(await resolveConfig('docs/sprint04/GAPS.json')),
    parser: 'json',
  }),
);
console.log(
  `Reported all ${routes.length} endpoints and ${records.length} source features; product acceptance remains incomplete.`,
);

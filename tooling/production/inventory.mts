import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import prettier from 'prettier';
import { discover } from './discover.mts';
import { runtimeRegistrations } from './runtime.mts';
import { measureDebt, debtRegressions, type Debt } from './debt.mts';
import { workspace, sha256, strings, visit, type Workspace } from './source.mts';
import { kinds, type Inventory } from './model.mts';
import { gapReport } from './gap-report.mts';

export function validateInventory(inventory: Inventory): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const tests = new Set(inventory.tests.map((test) => test.id));
  if (inventory.schemaVersion !== 1 || !inventory.sourceFiles.length || !inventory.features.length)
    errors.push('Empty/unsupported inventory');
  if (inventory.sourceDigest !== sha256(JSON.stringify(inventory.sourceFiles)))
    errors.push('Source digest mismatch');
  for (const row of inventory.features) {
    if (ids.has(row.id)) errors.push(`Duplicate feature ID: ${row.id}`);
    ids.add(row.id);
    if (
      !row.id ||
      !kinds.includes(row.kind) ||
      !row.source.path ||
      !/^[a-f0-9]{64}$/.test(row.source.fingerprint) ||
      row.source.line < 1 ||
      row.source.endLine < row.source.line
    )
      errors.push(`Invalid feature/source: ${row.id}`);
    if (!/^S(?:0[1-9]|10)$/.test(row.targetSprint)) errors.push(`Invalid sprint: ${row.id}`);
    if (!row.authorization.status || !row.persistenceEvent.status || !row.currentStatus)
      errors.push(`Missing status: ${row.id}`);
    for (const id of [
      ...row.tests.contract,
      ...row.tests.integration,
      ...row.tests.e2e,
      ...row.tests.related,
    ])
      if (!tests.has(id)) errors.push(`Unknown test ${id} on ${row.id}`);
    if (
      row.presentationOnly &&
      (row.presentationOnly.reviewedSourceFingerprint !== row.source.fingerprint ||
        !row.presentationOnly.reason)
    )
      errors.push(`Unbound presentation exception: ${row.id}`);
    if (
      row.requiredTests.length !== 3 ||
      row.requiredTests.some(
        (test) =>
          !test.id.startsWith('PLANNED:') ||
          test.implementationStatus !== 'REVIEW_REQUIRED_NOT_EXECUTED',
      )
    )
      errors.push(`Planned test status is not explicit: ${row.id}`);
    for (const endpoint of row.endpoints)
      if (!endpoint.method || !endpoint.path) errors.push(`Incomplete endpoint: ${row.id}`);
  }
  for (const registration of inventory.runtimeRegistrations) {
    const id = `${registration.kind}:${registration.owner}:${registration.mode}:${registration.key}`;
    if (!ids.has(id)) errors.push(`Uninventoried runtime registration: ${id}`);
  }
  const registrations = new Set(
    inventory.runtimeRegistrations.map((row) => `${row.kind}:${row.owner}:${row.mode}:${row.key}`),
  );
  for (const row of inventory.features.filter((row) =>
    ['route', 'action', 'api-route'].includes(row.kind),
  ))
    if (!registrations.has(row.id)) errors.push(`Stale registration: ${row.id}`);
  return errors;
}
export async function canonical(root: string, value: unknown): Promise<string> {
  return prettier.format(JSON.stringify(value), {
    ...(await prettier.resolveConfig(resolve(root, 'package.json'))),
    parser: 'json',
  });
}
export async function architecture(
  ws: Workspace,
  inventory: Inventory,
): Promise<Record<string, unknown>> {
  const workspaces = [];
  for (const path of ws.files.filter((path) =>
    /^(?:apps|packages|services)\/[^/]+\/package\.json$/.test(path),
  )) {
    const json: unknown = JSON.parse(await readFile(resolve(ws.root, path), 'utf8'));
    if (!json || typeof json !== 'object' || !('name' in json) || typeof json.name !== 'string')
      throw new Error(`Invalid workspace ${path}`);
    const dependencies =
      'dependencies' in json && typeof json.dependencies === 'object' && json.dependencies
        ? json.dependencies
        : {};
    workspaces.push({ name: json.name, path, dependencies });
  }
  const imports: Array<{ source: string; specifier: string }> = [];
  for (const source of ws.sources.values())
    visit(source.ast, (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteralLike(node.moduleSpecifier)
      )
        imports.push({ source: source.path, specifier: node.moduleSpecifier.text });
    });
  const services = [
    ...new Set(
      inventory.runtimeRegistrations
        .filter((row) => row.kind === 'api-route')
        .map((row) => row.owner),
    ),
  ].sort();
  const owned = services.map((service) => ({
    service,
    sourceRoot: `services/${service}`,
    proposedAccountableRole: `${service === 'api-gateway' ? 'platform' : service + ' domain'} maintainer (named owner UNASSIGNED)`,
    databaseOwnership:
      service === 'api-gateway'
        ? 'none: HTTP routing only'
        : 'separate owned database/role; migrations in service infrastructure; verified execution recorded separately',
    migrationFiles: ws.files.filter((path) =>
      path.startsWith(`services/${service}/src/infrastructure/migrations/`),
    ),
    routeIds: inventory.features
      .filter((row) => row.kind === 'api-route' && row.owningService === service)
      .map((row) => row.id),
  }));
  const bindings = ws.sources.get('packages/events/src/topology.ts');
  return {
    schemaVersion: 1,
    sourceDigest: inventory.sourceDigest,
    workspaces,
    imports,
    services: owned,
    eventTopology: {
      source: 'packages/events/src/topology.ts',
      eventTypes: bindings ? strings(bindings.ast).filter((value) => /\.v\d+$/.test(value)) : [],
      delivery:
        'transactional outbox/inbox + RabbitMQ; source design is not measured delivery reliability',
    },
    entrypoints: ws.files.filter((path) =>
      /^(?:apps|services)\/[^/]+\/src\/(?:main|server-main)\.ts$/.test(path),
    ),
    deploymentDefinitions: ws.files.filter(
      (path) => path.startsWith('infra/') && /\.(?:yaml|yml|json|mts|sh)$/.test(path),
    ),
    sourceOnly: true,
  };
}
export function dataFlows(inventory: Inventory): Record<string, unknown> {
  return {
    schemaVersion: 1,
    sourceDigest: inventory.sourceDigest,
    trustBoundaries: [
      {
        id: 'TB1',
        from: 'untrusted browser/native client',
        to: 'gateway',
        control: 'OIDC access token, TLS, exact CORS; deployment evidence required',
      },
      {
        id: 'TB2',
        from: 'gateway',
        to: 'independent domain services',
        control: 'service authentication and tenant/role/ownership authorization',
      },
      {
        id: 'TB3',
        from: 'domain service',
        to: 'owned PostgreSQL',
        control: 'role isolation + tenant RLS + owned migrations',
      },
      {
        id: 'TB4',
        from: 'outbox publisher',
        to: 'broker/inbox consumer',
        control: 'durable topology, idempotency, retry/dead-letter',
      },
      {
        id: 'TB5',
        from: 'native auth bridge',
        to: 'OS/browser/identity provider',
        control: 'PKCE/state/nonce + native storage + verified token claims',
      },
    ],
    edges: inventory.features
      .filter(
        (row) =>
          row.endpoints.length ||
          row.persistenceEvent.events.length ||
          row.persistenceEvent.tables.length,
      )
      .map((row) => ({
        featureId: row.id,
        source: row.source.path,
        mode: row.mode,
        owner: row.owningService,
        endpoints: row.endpoints,
        authorization: row.authorization,
        tables: row.persistenceEvent.tables,
        events: row.persistenceEvent.events,
        sourceTrace: row.sourceTrace ?? null,
        resolution: row.unresolved.length ? 'REVIEW_REQUIRED' : 'SOURCE_OBSERVED_NOT_EXECUTION',
      })),
    warnings: [
      'Endpoint/source references are not proof of an end-to-end persisted journey.',
      'Demo/local-storage flows never satisfy production persistence.',
      'Actual event ordering, duplication, poison messages, restore and capacity require measured tests.',
    ],
  };
}
export function workflowDebt(inventory: Inventory): Record<string, unknown> {
  const workflows = inventory.features.filter((row) =>
    ['route', 'action', 'form', 'background-job'].includes(row.kind),
  );
  return {
    schemaVersion: 1,
    measurement:
      'Static mapping only; unknown coverage is not zero code coverage and is not a pass.',
    workflowCount: workflows.length,
    unmappedIds: workflows.filter((row) => !row.tests.related.length).map((row) => row.id),
    noContractCandidateIds: workflows
      .filter((row) => !row.tests.contract.length)
      .map((row) => row.id),
    noIntegrationCandidateIds: workflows
      .filter((row) => !row.tests.integration.length)
      .map((row) => row.id),
    noE2ECandidateIds: workflows.filter((row) => !row.tests.e2e.length).map((row) => row.id),
    demoOnlyIds: workflows.filter((row) => row.mode === 'demo').map((row) => row.id),
    unresolvedIds: inventory.features.filter((row) => row.unresolved.length).map((row) => row.id),
    coveragePercentage: null,
    coverageStatus: 'NOT_MEASURED',
  };
}
export async function generate(
  root: string,
): Promise<{ files: Map<string, unknown>; inventory: Inventory; debt: Debt }> {
  const ws = await workspace(root);
  const inventory = await discover(ws, await runtimeRegistrations(ws));
  const errors = validateInventory(inventory);
  if (errors.length) throw new Error(errors.join('\n'));
  const debt = measureDebt(ws);
  const structure = await architecture(ws, inventory);
  return {
    inventory,
    debt,
    files: new Map<string, unknown>([
      ['feature-matrix.json', inventory],
      ['architecture-inventory.json', structure],
      [
        'ownership-dependency-map.json',
        {
          schemaVersion: 1,
          sourceDigest: inventory.sourceDigest,
          accountability:
            'Proposed roles only; named service/on-call owners are UNASSIGNED. CODEOWNERS routes review to the repository owner, not proof of independent approval.',
          services: structure.services,
          workspaceDependencies: structure.workspaces,
          sourceImports: structure.imports,
          externalDependencies:
            'See blockers.json; source presence never proves provider readiness.',
        },
      ],
      ['data-flow-inventory.json', dataFlows(inventory)],
      ['workflow-debt.json', workflowDebt(inventory)],
      ['semantic-review.json', gapReport(inventory)],
    ]),
  };
}
export interface QualityBaseline {
  schemaVersion: 1;
  registrationIds: string[];
  testIds: string[];
  uncoveredWorkflowIds: string[];
}
export function qualityBaseline(inventory: Inventory): QualityBaseline {
  return {
    schemaVersion: 1,
    registrationIds: inventory.features
      .filter((row) => ['route', 'action', 'api-route'].includes(row.kind))
      .map((row) => row.id)
      .sort(),
    testIds: inventory.tests.map((row) => row.id).sort(),
    uncoveredWorkflowIds: inventory.features
      .filter(
        (row) =>
          ['route', 'action', 'form', 'background-job'].includes(row.kind) &&
          !row.tests.related.length,
      )
      .map((row) => row.id)
      .sort(),
  };
}
export function qualityRegressions(baseline: QualityBaseline, current: QualityBaseline): string[] {
  return [
    ...baseline.registrationIds
      .filter((id) => !current.registrationIds.includes(id))
      .map((id) => 'Removed registered feature: ' + id),
    ...baseline.testIds
      .filter((id) => !current.testIds.includes(id))
      .map((id) => 'Removed test catalog entry: ' + id),
    ...current.uncoveredWorkflowIds
      .filter((id) => !baseline.uncoveredWorkflowIds.includes(id))
      .map((id) => 'New unmapped workflow: ' + id),
  ];
}
export async function checkOrWrite(root: string, write: boolean, baseline: boolean): Promise<void> {
  if (baseline && !write) throw new Error('Baseline creation requires explicit --write --baseline');
  const result = await generate(root);
  const folder = resolve(root, 'docs/production');
  await mkdir(folder, { recursive: true });
  for (const [name, value] of result.files) {
    const content = await canonical(root, value);
    const path = resolve(folder, name);
    if (write) await writeFile(path, content);
    else if ((await readFile(path, 'utf8')) !== content)
      throw new Error(
        `Inventory drift: ${name}. Run npm run inventory:write, review every changed mapping, and rerun FULL-CI.`,
      );
  }
  const debtPath = resolve(folder, 'debt-baseline.json');
  const qualityPath = resolve(folder, 'quality-baseline.json');
  const currentQuality = qualityBaseline(result.inventory);
  if (baseline) {
    await writeFile(debtPath, await canonical(root, result.debt), { flag: 'wx' });
    await writeFile(qualityPath, await canonical(root, currentQuality), { flag: 'wx' });
  } else {
    const quality = JSON.parse(await readFile(qualityPath, 'utf8')) as QualityBaseline;
    const gaps = qualityRegressions(quality, currentQuality);
    if (gaps.length)
      throw new Error(
        'Quality baseline regression (reviewed disposition required):\n' + gaps.join('\n'),
      );
    const accepted = JSON.parse(await readFile(debtPath, 'utf8')) as Debt;
    const regressions = debtRegressions(accepted, result.debt);
    if (regressions.length)
      throw new Error(
        `Debt regression (not offset by unrelated removals):\n${regressions.map((row) => row.id).join('\n')}`,
      );
  }
  console.log(
    JSON.stringify({
      status: 'PASS',
      scope:
        'inventory integrity/drift and measured suppression baseline ONLY, not exhaustive semantic acceptance',
      sourceDigest: result.inventory.sourceDigest,
      ...result.inventory.totals,
      debt: result.debt.counts,
    }),
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkOrWrite(
    process.cwd(),
    process.argv.includes('--write'),
    process.argv.includes('--baseline'),
  );
}

import ts from 'typescript';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { format } from 'prettier';
import {
  digest,
  files,
  isCode,
  isProduction,
  json,
  location,
  name,
  parse,
  read,
  walk,
} from './source.mts';
import { extract, type Surface } from './extract.mts';
import { SourceGraph, type Effect } from './graph.mts';
import { runtimeCensus, type RuntimeCensus } from './runtime-census.mts';
import { measureDebt, debtRegressions, type Debt } from './debt.mts';

interface Contract {
  service: string;
  method: string;
  gatewayPath: string;
  servicePath: string;
  roles: string[];
}
export interface TestEntry {
  id: string;
  path: string;
  line: number;
  title: string;
  category: string;
  disposition: string;
}
export interface Feature extends Surface {
  owner: string;
  endpoint: string[];
  authorization: { state: string; declaredRoles: string[]; sourceRefs: string[] };
  persistence: { state: string; operations: string[]; events: string[]; sourceRefs: string[] };
  status: string;
  targetSprint: string;
  tests: {
    contract: string[];
    integration: string[];
    e2e: string[];
    required: Record<string, string>;
    evidence: 'not-measured';
  };
  presentationOnly: { verified: boolean; rationale: string | null };
  unresolvedEffects: string[];
}
export function templateMatches(template: string, value: string): boolean {
  const escaped = template
    .replace(/^`|`$/g, '')
    .split(/\$\{[^}]+\}/g)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]+');
  return new RegExp(`^${escaped}$`).test(value);
}
export function validateRuntime(
  surfaces: Surface[],
  runtime: RuntimeCensus,
  contracts: Contract[],
): string[] {
  const errors: string[] = [];
  for (const app of runtime.demo)
    for (const key of ['routes', 'actions'] as const) {
      const observed = surfaces
        .filter(
          (item) =>
            item.app === app.app &&
            item.mode === 'demo' &&
            item.kind === (key === 'routes' ? 'route' : 'action'),
        )
        .map((item) => item.name)
        .sort();
      if (json(observed) !== json(app[key]))
        errors.push(
          `Runtime/static ${key} mismatch for ${app.app}: actual ${app[key].join(',')}; extracted ${observed.join(',')}`,
        );
    }
  const actual = runtime.http.filter(
    (route) =>
      route.service !== 'api-gateway' && route.path.startsWith('/v1/') && !route.automaticHead,
  );
  const routeKey = (service: string, method: string, path: string): string =>
    `${service} ${method} ${path.replace(/\{([^}]+)\}/g, ':$1')}`;
  const actualKeys = new Set(
    actual.map((route) => routeKey(route.service, route.method, route.path)),
  );
  const contractKeys = new Set(
    contracts.map((route) => routeKey(route.service, route.method, route.servicePath)),
  );
  for (const key of actualKeys)
    if (!contractKeys.has(key)) errors.push(`Undocumented runtime operation: ${key}`);
  for (const key of contractKeys)
    if (!actualKeys.has(key)) errors.push(`Documented but unregistered operation: ${key}`);
  for (const route of actual)
    if (
      !surfaces.some(
        (item) =>
          item.kind === 'http' &&
          item.app === route.service &&
          item.method === route.method &&
          item.path &&
          templateMatches(item.path, route.path),
      )
    )
      errors.push(`Unlocated HTTP handler: ${routeKey(route.service, route.method, route.path)}`);
  return errors;
}
export function catalogTests(root: string, paths: string[]): TestEntry[] {
  const tests: TestEntry[] = [];
  for (const path of paths.filter((path) =>
    /(?:\.test\.[cm]?tsx?$|\/tests\/.*\.mts$)/.test(path),
  )) {
    const source = parse(path, read(root, path));
    const seen = new Map<string, number>();
    walk(source, (node) => {
      if (
        !ts.isCallExpression(node) ||
        !/^(test|it|describe)(\.(skip|todo|only))?$/.test(node.expression.getText(source))
      )
        return;
      const title = name(node.arguments[0]) ?? node.arguments[0]?.getText(source) ?? 'unnamed';
      const key = `${path}:${title}`;
      const nth = (seen.get(key) ?? 0) + 1;
      seen.set(key, nth);
      tests.push({
        id: `test.${digest(key).slice(0, 16)}.${nth}`,
        path,
        line: location(source, node).line,
        title,
        category: /api-contract|production\/inventory/.test(path)
          ? 'contract'
          : /integration|backend/.test(path)
            ? 'integration'
            : /regression|runtime|native/.test(path)
              ? 'journey-or-platform'
              : 'unit',
        disposition: node.expression.getText(source).split('.')[1] ?? 'declared',
      });
    });
  }
  return tests.sort((a, b) => a.id.localeCompare(b.id, 'en'));
}
export interface WorkflowGap {
  id: string;
  missingTestKinds: string[];
}
export function workflowGapRegressions(baseline: WorkflowGap[], current: WorkflowGap[]): string[] {
  const permitted = new Map(baseline.map((item) => [item.id, new Set(item.missingTestKinds)]));
  return current.flatMap((item) =>
    item.missingTestKinds
      .filter((kind) => !permitted.get(item.id)?.has(kind))
      .map((kind) => `Uncovered workflow regression: ${item.id} (${kind})`),
  );
}
function enrich(
  item: Surface,
  effects: Effect[],
  contracts: Contract[],
  tests: TestEntry[],
): Feature {
  const matching =
    item.kind === 'http'
      ? contracts.filter(
          (c) =>
            c.service === item.app &&
            c.method === item.method &&
            item.path &&
            templateMatches(item.path, c.servicePath.replace(/\{([^}]+)\}/g, ':$1')),
        )
      : [];
  const endpoints = [
    ...new Set([
      ...matching.map((c) => `${c.method} ${c.gatewayPath}`),
      ...effects.filter((e) => e.kind === 'endpoint').map((e) => e.value),
    ]),
  ].sort();
  const services = [
    ...new Set(
      endpoints.flatMap((value) => {
        const result = /\/v1\/([^/`]+)\//.exec(value);
        return result?.[1] ? [result[1]] : [];
      }),
    ),
  ];
  const demo = item.mode === 'demo';
  // These two handlers have explicit DOM-only bodies in the dispatcher. Other controls remain unverified.
  const presentation =
    item.kind === 'action' &&
    item.app === 'app-runtime' &&
    ['close-modal', 'skip-content'].includes(item.name);
  const sourceRefs = (kind: Effect['kind']): string[] =>
    effects.filter((e) => e.kind === kind).map((e) => `${e.source.path}:${e.source.line}`);
  const plan = (category: string): string => `planned.${category}.${item.id}`;
  const domain = `${item.tags.join(' ')} ${item.source.path} ${item.name}`;
  const targetSprint = /account|identity|permission|profile|auth/.test(domain)
    ? 'S02'
    : /customer|discovery|crm/.test(domain)
      ? 'S04'
      : /quote|contract|discount|visit|task|opportunit|territory|planning|sales/.test(domain)
        ? 'S05'
        : /billing|invoice|finance/.test(domain)
          ? 'S07'
          : /delivery|project/.test(domain)
            ? 'S06'
            : /communication|message|notification|support|tracking|location|privacy/.test(domain)
              ? 'S08'
              : /admin|dashboard|config/.test(domain)
                ? 'S03'
                : /native|mobile|rep/.test(domain)
                  ? 'S09'
                  : 'S03';
  return {
    ...item,
    owner:
      item.mode === 'backend'
        ? item.app
        : demo
          ? `${item.app}:local-demo`
          : services.length
            ? services.join('+')
            : `${item.app}:frontend-or-shared`,
    endpoint: endpoints,
    authorization: {
      state: demo
        ? 'client-side-demo-not-security'
        : matching.length
          ? 'declared-contract-roles-plus-handler-evidence-review-required'
          : 'not-proven-per-action',
      declaredRoles: [...new Set(matching.flatMap((c) => c.roles))].sort(),
      sourceRefs: sourceRefs('authorization'),
    },
    persistence: {
      state: presentation
        ? 'none-dom-only'
        : demo
          ? 'local-demo-not-server-persistence'
          : effects.some((e) => e.kind === 'storage')
            ? 'static-reachable-operations-not-runtime-proof'
            : 'not-proven-per-action',
      operations: [...new Set(effects.filter((e) => e.kind === 'storage').map((e) => e.value))],
      events: [...new Set(effects.filter((e) => e.kind === 'event').map((e) => e.value))],
      sourceRefs: [...sourceRefs('storage'), ...sourceRefs('event')],
    },
    status: presentation
      ? 'presentation-only'
      : demo
        ? 'demo-only-needs-server-migration'
        : endpoints.length
          ? 'implementation-present-needs-acceptance'
          : 'observed-needs-semantic-review',
    targetSprint,
    tests: {
      contract: matching.length
        ? tests
            .filter(
              (t) =>
                /tests\/backend\/api-contracts.test.ts$/.test(t.path) &&
                t.title.startsWith('every documented'),
            )
            .map((t) => t.id)
        : [],
      integration: [],
      e2e: [],
      required: { contract: plan('contract'), integration: plan('integration'), e2e: plan('e2e') },
      evidence: 'not-measured',
    },
    presentationOnly: {
      verified: presentation,
      rationale: presentation
        ? item.name === 'skip-content'
          ? 'Focuses the main content DOM element; no data mutation, network request or domain event.'
          : 'Closes the dialog and restores focus; no persisted domain mutation. UI state only.'
        : null,
    },
    unresolvedEffects: effects.filter((e) => e.kind === 'unresolved').map((e) => e.value),
  };
}
export async function generateInventory(root: string): Promise<Record<string, unknown>> {
  const all = files(root);
  const code = all.filter(isCode);
  const production = code.filter(isProduction);
  const extracted = production.map((path) => extract(path, read(root, path)));
  const surfaces = extracted.flatMap((result) => result.items);
  const diagnostics = extracted.flatMap((result) => result.diagnostics);
  const runtime = await runtimeCensus(root);
  const contracts = JSON.parse(read(root, 'packages/contracts/route-inventory.json')) as Contract[];
  diagnostics.push(...validateRuntime(surfaces, runtime, contracts));
  const tests = catalogTests(root, code);
  const graph = new SourceGraph(root);
  const entries = surfaces.map((item) =>
    enrich(
      item,
      graph.effects(item.source.path, item.source.line, item.source.column),
      contracts,
      tests,
    ),
  );
  for (const section of runtime.live) {
    const path = 'packages/api-client/src/live-workspace.ts';
    const item: Surface = {
      id: `${section.app}.shared-server.route.${section.name}`,
      kind: 'route',
      app: section.app,
      mode: 'server',
      name: section.name,
      source: {
        path,
        line: 1,
        column: 1,
        symbol: 'sectionsForRole',
        sha256: digest(read(root, path)),
      },
      expression: `sectionsForRole(${section.role}).${section.name}`,
      handler: 'section.load',
      method: 'GET',
      path: null,
      tags: ['runtime-section-registration'],
    };
    const entry = enrich(item, [], [], tests);
    entry.endpoint = section.endpoint.map((endpoint) => `GET ${endpoint}`);
    entry.owner = section.endpoint.map((endpoint) => endpoint.split('/')[2]).join('+');
    entry.authorization = {
      state: 'role-filtered-UI-server-authorization-required',
      declaredRoles: [section.role],
      sourceRefs: [`${path}:sectionsForRole`],
    };
    entry.status =
      section.role === 'rep'
        ? 'compatibility-workspace-not-active-rep-entry'
        : 'implementation-present-needs-acceptance';
    entries.push(entry);
  }
  // Record each resolved dynamic operation separately, including service health and gateway proxy expansions.
  for (const route of runtime.http) {
    const original = entries.find(
      (item) =>
        item.kind === 'http' &&
        item.app === route.service &&
        item.method === route.method &&
        item.path &&
        templateMatches(item.path, route.path),
    );
    if (original?.path === route.path) continue;
    const path =
      original?.source.path ??
      (route.service === 'api-gateway'
        ? 'services/api-gateway/src/app.ts'
        : 'packages/service-kit/src/http.ts');
    const item: Surface = {
      id: `${route.service}.runtime.http.${route.method}.${digest(route.path).slice(0, 16)}`,
      kind: 'http',
      app: route.service,
      mode: 'backend',
      name: `${route.method} ${route.path}`,
      source: original?.source ?? {
        path,
        line: 1,
        column: 1,
        symbol: 'createService',
        sha256: digest(read(root, path)),
      },
      expression: 'observed Fastify onRoute registration',
      handler: original?.handler ?? null,
      method: route.method,
      path: route.path,
      tags: [
        route.automaticHead ? 'automatic-head' : 'runtime-resolved',
        ...(original ? [`expansion-of:${original.id}`] : ['shared-infrastructure']),
      ],
    };
    entries.push(
      enrich(
        item,
        original ? graph.effects(path, original.source.line, original.source.column) : [],
        contracts,
        tests,
      ),
    );
  }
  const linksPath = 'docs/production/feature-test-links.json';
  if (!existsSync(resolve(root, linksPath)))
    diagnostics.push('Missing reviewed feature-test-links.json');
  else {
    const links = JSON.parse(read(root, linksPath)) as {
      links: {
        featureId: string;
        kind: 'contract' | 'integration' | 'e2e';
        testId: string;
        rationale: string;
      }[];
    };
    const used = new Set<string>();
    for (const link of links.links) {
      const entry = entries.find((item) => item.id === link.featureId);
      const test = tests.find((item) => item.id === link.testId);
      const key = `${link.featureId}:${link.kind}:${link.testId}`;
      if (
        !entry ||
        !test ||
        !['contract', 'integration', 'e2e'].includes(link.kind) ||
        !link.rationale?.trim() ||
        test.disposition !== 'declared' ||
        used.has(key)
      )
        diagnostics.push(`Invalid or duplicate reviewed feature/test link: ${key}`);
      else if (!entry.tests[link.kind].includes(link.testId))
        entry.tests[link.kind].push(link.testId);
      used.add(key);
    }
  }
  const workflowGaps: WorkflowGap[] = entries
    .filter((item) => ['route', 'action', 'form', 'job'].includes(item.kind))
    .map((item) => ({
      id: item.id,
      missingTestKinds: (['contract', 'integration', 'e2e'] as const).filter(
        (kind) => !item.tests[kind].length,
      ),
    }))
    .filter((item) => item.missingTestKinds.length)
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const parityPath = 'tests/design-parity/baseline-v1.1.json';
  const parity = JSON.parse(read(root, parityPath)) as {
    cases: { id: string; app: string; route: string }[];
  };
  const appAliases: Record<string, string> = {
    'admin-web': 'admin',
    'client-mobile': 'client',
    'rep-mobile': 'rep',
  };
  const parityGaps = runtime.demo.flatMap((app) =>
    app.routes
      .filter(
        (route) =>
          !parity.cases.some((item) => item.app === appAliases[app.app] && item.route === route),
      )
      .map((route) => ({
        app: app.app,
        route,
        status: 'missing-frozen-parity-case-not-proof-of-zero-other-tests',
      })),
  );
  const sourceManifest = production.map((path) => ({ path, sha256: digest(read(root, path)) }));
  const manifestDigest = digest(json(sourceManifest));
  const imports: { from: string; to: string; line: number; typeOnly: boolean }[] = [];
  const events: { kind: string; name: string; source: Surface['source']; owner: string }[] = [];
  for (const path of production) {
    const source = parse(path, read(root, path));
    walk(source, (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier))
        imports.push({
          from: path,
          to: node.moduleSpecifier.text,
          line: location(source, node).line,
          typeOnly: node.importClause?.isTypeOnly ?? false,
        });
    });
  }
  for (const item of entries.filter((item) => item.kind === 'event'))
    events.push({
      kind: item.tags.includes('subscription') ? 'subscription' : 'publication',
      name: item.name,
      source: item.source,
      owner: item.owner,
    });
  const manifests = [
    'package.json',
    ...all.filter((path) => path.endsWith('/package.json') && !/\/(android|ios)\//.test(path)),
  ].map((path) => ({ path, manifest: JSON.parse(read(root, path)) as unknown }));
  const counts = (key: keyof Feature): Record<string, number> =>
    Object.fromEntries(
      [...new Set(entries.map((item) => String(item[key])))]
        .sort()
        .map((value) => [value, entries.filter((item) => String(item[key]) === value).length]),
    );
  const native = all
    .filter(
      (path) => /\/(android|ios)\//.test(path) && /\.(java|swift|xml|plist|gradle)$/.test(path),
    )
    .map((path) => ({
      path,
      sha256: digest(read(root, path)),
      permissions: [
        ...read(root, path).matchAll(
          /android\.permission\.[A-Z_]+|NS(?:Location|Camera|Microphone)[A-Za-z]+UsageDescription/g,
        ),
      ].map((m) => m[0]),
    }));
  const matrix = {
    schemaVersion: 1,
    sourceManifestSha256: manifestDigest,
    scope: {
      method: 'TypeScript AST plus isolated actual registrations; conservative static reachability',
      exhaustiveRegistrationChecks: diagnostics.length === 0,
      businessSemanticCompleteness:
        'BLOCKED-pending-human-review-of-symbolic-controls-and-unmapped-journeys',
      excludes: [
        'dependencies/generated bundles',
        'historical counts as limits',
        'runtime test success inference from test names',
      ],
      nativeScope:
        'native source/configuration manifest and permission strings; physical-device behavior is not inferred',
    },
    summary: {
      entries: entries.length,
      byKind: counts('kind'),
      byApp: counts('app'),
      byStatus: counts('status'),
      demoRoutes: runtime.demo.reduce((sum, app) => sum + app.routes.length, 0),
      demoAppActions: runtime.demo.reduce((sum, app) => sum + app.actions.length, 0),
      uncoveredWorkflowLinks: entries.filter(
        (item) => ['route', 'action', 'form', 'job'].includes(item.kind) && !item.tests.e2e.length,
      ).length,
      measuredWorkflowCoveragePercent: null,
      evidenceLinkedWorkflowCoveragePercent: 0,
    },
    diagnostics,
    entries: entries.sort((a, b) => a.id.localeCompare(b.id, 'en')),
  };
  return {
    'feature-matrix.json': matrix,
    'coverage-gaps.json': {
      schemaVersion: 1,
      measurement: 'static-test-link-gaps-not-instrumented-coverage',
      workflowGaps,
      frozenParity: {
        path: parityPath,
        sha256: digest(read(root, parityPath)),
        caseCount: parity.cases.length,
        missingCurrentRoutes: parityGaps,
      },
      instrumentedCoverage: null,
      note: 'Existing tests still execute. Empty links are not equivalent to absent test implementations. Frozen parity intentionally covers its original routes, not all current routes.',
    },
    'runtime-registrations.json': { schemaVersion: 1, ...runtime },
    'test-catalog.json': {
      schemaVersion: 1,
      note: 'Declarations and IDs, not execution results. Dynamic subtests and native tests require runtime reports.',
      tests,
    },
    'architecture-inventory.json': {
      schemaVersion: 1,
      sourceManifestSha256: manifestDigest,
      sourceManifest,
      workspaces: manifests,
      native,
      migrations: all
        .filter((path) => /\/migrations\//.test(path) && isCode(path))
        .map((path) => ({ path, sha256: digest(read(root, path)) })),
      runtimeModes: {
        demo: 'local state/localStorage; not production backend',
        adminAndClientServer: 'OIDC authenticated shared live workspace',
        repServer: 'dedicated server entry, foreground tracking, no offline write synchronization',
      },
      infrastructureFiles: all
        .filter((path) => path.startsWith('infra/') && !path.endsWith('.env'))
        .map((path) => ({ path, sha256: digest(read(root, path)) })),
    },
    'ownership-dependencies.json': {
      schemaVersion: 1,
      accountableRepositoryOwner: 'baraabd',
      domainTeamAssignments: 'UNASSIGNED-proposals-not-existing-teams',
      imports,
      owners: Object.keys(counts('owner')),
    },
    'data-flow-inventory.json': {
      schemaVersion: 1,
      events,
      jobs: entries
        .filter((item) => item.kind === 'job')
        .map((item) => ({ id: item.id, owner: item.owner, source: item.source, name: item.name })),
      eventTopology: {
        path: 'packages/events/src/topology.ts',
        sha256: digest(read(root, 'packages/events/src/topology.ts')),
        text: read(root, 'packages/events/src/topology.ts'),
      },
      boundaries: [
        'browser/native -> OIDC provider',
        'browser/native -> HTTPS gateway -> independently authorizing service',
        'service -> owned PostgreSQL transaction/RLS/outbox',
        'outbox -> RabbitMQ -> consumer inbox -> owned transaction',
        'sales/communications -> CRM ownership API',
      ],
      caveat:
        'Static effects do not establish deployed network isolation, running workers, retention, delivery SLOs or recoverability.',
    },
  };
}
export async function runInventory(root: string, check: boolean, baseline: boolean): Promise<void> {
  const directory = resolve(root, 'docs/production');
  mkdirSync(directory, { recursive: true });
  const output = await generateInventory(root);
  const errors: string[] = [];
  for (const [name, value] of Object.entries(output)) {
    const path = resolve(directory, name);
    if (check) {
      if (
        !existsSync(path) ||
        json(JSON.parse(readFileSync(path, 'utf8')) as unknown) !== json(value)
      )
        errors.push(`Inventory drift: ${name}; run npm run inventory:write and review the diff.`);
    } else writeFileSync(path, await format(json(value), { parser: 'json', printWidth: 100 }));
  }
  const measured = measureDebt(root);
  const path = resolve(directory, 'debt-baseline.json');
  if (baseline) {
    if (existsSync(path))
      throw new Error(
        'Refusing to overwrite the debt baseline. Reductions require reviewed explicit edits; increases are not a regeneration operation.',
      );
    writeFileSync(path, await format(json(measured), { parser: 'json', printWidth: 100 }));
  } else if (!existsSync(path)) errors.push('Missing debt-baseline.json');
  else errors.push(...debtRegressions(JSON.parse(readFileSync(path, 'utf8')) as Debt, measured));
  const gapBaselinePath = resolve(directory, 'workflow-gap-baseline.json');
  const currentGaps = (output['coverage-gaps.json'] as { workflowGaps: WorkflowGap[] })
    .workflowGaps;
  if (baseline) {
    if (existsSync(gapBaselinePath))
      throw new Error('Refusing to overwrite the workflow-gap baseline.');
    writeFileSync(
      gapBaselinePath,
      await format(
        json({
          schemaVersion: 1,
          note: 'Initial static missing-link baseline; not a coverage achievement. New missing links fail.',
          items: currentGaps,
        }),
        { parser: 'json', printWidth: 100 },
      ),
    );
  } else if (!existsSync(gapBaselinePath)) errors.push('Missing workflow-gap-baseline.json');
  else
    errors.push(
      ...workflowGapRegressions(
        (JSON.parse(readFileSync(gapBaselinePath, 'utf8')) as { items: WorkflowGap[] }).items,
        currentGaps,
      ),
    );
  const matrix = output['feature-matrix.json'] as { diagnostics: string[]; summary: unknown };
  errors.push(...matrix.diagnostics);
  console.log(
    json({
      inventory: errors.length ? 'BLOCKED' : 'PASS',
      summary: matrix.summary,
      debt: measured.totals,
      errors,
    }),
  );
  if (errors.length) throw new Error(errors.join('\n'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runInventory(
    process.cwd(),
    process.argv.includes('--check'),
    process.argv.includes('--initialize-debt'),
  );
}

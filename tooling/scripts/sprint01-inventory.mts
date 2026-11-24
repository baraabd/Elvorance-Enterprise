import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { registeredSources } from '../production/registration-source.mts';
import type { Workspace } from '../production/source.mts';

// Source-only inventory. Static registration is not end-to-end acceptance or a security proof.
const root = resolve(process.argv[2] ?? '.');
const output = resolve(process.argv[3] ?? 'sprint01-inventory.json');
const revision = process.argv[4] ?? 'unverified-working-tree';
const excluded = new Set(['node_modules', 'dist', '.git', 'android', 'ios', 'preview', 'baseline']);
const walk = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (excluded.has(entry.name) || entry.isSymbolicLink()) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
const files = ['apps', 'packages', 'services', 'tests', 'tooling', 'infra', '.github']
  .flatMap((name) => (existsSync(resolve(root, name)) ? walk(resolve(root, name)) : []))
  .sort();
const pathOf = (path: string): string => relative(root, path).replaceAll('\\', '/');
const ownerOf = (path: string): string => {
  const owner = path.split('/')[1];
  if (!owner) throw new Error(`Missing workspace owner: ${path}`);
  return owner;
};
const textOf = (path: string): string => readFileSync(path, 'utf8');
const nameOf = (node: ts.PropertyName | ts.BindingName | undefined): string => {
  if (!node) return '<anonymous>';
  return ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)
    ? node.text
    : node.getText();
};
interface Evidence {
  path: string;
  line: number;
  endLine: number;
}
interface SymbolRow extends Evidence {
  name: string;
  kind: string;
  guards: string[];
}
interface RouteRow extends Evidence {
  service: string;
  method: string;
  pattern: string;
  calls: string[];
}
interface UiRow extends Evidence {
  app: string;
  kind: string;
  key: string;
  mode: string;
  status: string;
}
const symbols: SymbolRow[] = [];
const registrations: RouteRow[] = [];
const ui: UiRow[] = [];
const sources: Array<{
  path: string;
  sha256: string;
  lines: number;
  disabledTypeChecking: boolean;
}> = [];
const guards = /\b(requireRole|requireOwner|hasRole|isOwner|canReadQuote|authorize\w*)\s*\(/;
const codeFiles = files.filter(
  (path) => /\.(?:ts|mts|cts|tsx)$/.test(path) && !path.endsWith('.d.ts'),
);
const program = ts.createProgram(codeFiles, {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  allowImportingTsExtensions: true,
  noEmit: true,
  skipLibCheck: true,
});
const ws: Workspace = {
  root,
  files: files.map(pathOf),
  sources: new Map(),
  checker: program.getTypeChecker(),
};
const rawRegistrations: Array<{ node: ts.CallExpression; path: string; line: number }> = [];
for (const file of codeFiles) {
  const text = textOf(file);
  const path = pathOf(file);
  const source = program.getSourceFile(file);
  if (!source) throw new Error(`Unable to parse source: ${path}`);
  ws.sources.set(path, {
    path,
    text,
    ast: source,
    digest: createHash('sha256').update(text).digest('hex'),
  });
  const location = (node: ts.Node): Evidence => ({
    path,
    line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    endLine: source.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
  });
  sources.push({
    path,
    sha256: createHash('sha256').update(text).digest('hex'),
    lines: text.split('\n').length,
    disabledTypeChecking: /^\s*\/\/\s*@ts\u002dnocheck\b/m.test(text),
  });
  const visit = (node: ts.Node): void => {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessor(node) ||
      ts.isSetAccessor(node) ||
      ts.isConstructorDeclaration(node)
    ) {
      const ownName = 'name' in node ? node.name : undefined;
      const parentName =
        ts.isVariableDeclaration(node.parent) || ts.isPropertyAssignment(node.parent)
          ? node.parent.name
          : undefined;
      symbols.push({
        ...location(node),
        name: nameOf(ownName ?? parentName),
        kind: ts.SyntaxKind[node.kind],
        guards: node
          .getText(source)
          .split('\n')
          .filter((line) => guards.test(line))
          .map((line) => line.trim()),
      });
    }
    if (
      path.startsWith('services/') &&
      path.includes('/transport/') &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(source) === 'app' &&
      /^(get|post|patch|put|delete|options|head|route)$/.test(node.expression.name.text)
    ) {
      rawRegistrations.push({ node, path, line: location(node).line });
    }
    if (
      path.startsWith('apps/') &&
      (path.includes('/src/features/') || path.endsWith('/src/state/local-demo.ts')) &&
      ts.isPropertyAssignment(node) &&
      ['routes', 'actions'].includes(nameOf(node.name)) &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const property of node.initializer.properties) {
        if (!property.name) continue;
        ui.push({
          ...location(property),
          app: ownerOf(path),
          kind: nameOf(node.name),
          key: nameOf(property.name),
          mode: 'legacy-demo',
          status:
            path === 'apps/admin-web/src/features/configuration/index.ts'
              ? 'partial-optional-configuration-api-sync'
              : 'unconnected-to-server-workspace',
        });
      }
    }
    if (
      path.endsWith('/server/workspace.ts') &&
      ts.isVariableDeclaration(node) &&
      nameOf(node.name) === 'pages' &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const property of node.initializer.properties)
        if (property.name)
          ui.push({
            ...location(property),
            app: 'rep-mobile',
            kind: 'server-page',
            key: nameOf(property.name),
            mode: 'server',
            status: 'partial-hosted-acceptance-unverified',
          });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
const resolvedNodes = new Set<ts.Node>();
const services = [
  ...new Set([...ws.sources.keys()].filter((path) => path.startsWith('services/')).map(ownerOf)),
];
for (const service of services) {
  for (const row of registeredSources(ws, service)) {
    if (!row.source.path.startsWith(`services/${service}/`)) continue;
    resolvedNodes.add(row.node);
    const calls = new Set<string>();
    const collect = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression))
        calls.add(node.expression.text);
      ts.forEachChild(node, collect);
    };
    row.node.arguments.slice(1).forEach(collect);
    registrations.push({
      service,
      method: row.method,
      pattern: row.path,
      calls: [...calls].sort(),
      path: row.source.path,
      line: row.source.ast.getLineAndCharacterOfPosition(row.node.getStart()).line + 1,
      endLine: row.source.ast.getLineAndCharacterOfPosition(row.node.getEnd()).line + 1,
    });
  }
}
const unresolvedRegistrations = rawRegistrations
  .filter((row) => !resolvedNodes.has(row.node))
  .map((row) => ({
    path: row.path,
    line: row.line,
    expression: row.node.getText(),
    status: 'UNRESOLVED_NOT_VERIFIED',
  }));
interface DeclaredRoute {
  service: string;
  method: string;
  gatewayPath: string;
  servicePath: string;
  roles: string[];
  summary: string;
}
const declared = JSON.parse(
  textOf(resolve(root, 'packages/contracts/route-inventory.json')),
) as DeclaredRoute[];
const canonical = (path: string): string => path.replace(/\{([^}]+)\}/g, ':$1');
const matches = (pattern: string, target: string): boolean => pattern === target;
const operations = declared.map((route) => {
  const sourceRoutes = registrations.filter(
    (row) =>
      row.service === route.service &&
      row.method === route.method &&
      matches(row.pattern, canonical(route.servicePath)),
  );
  const refs = new Set(sourceRoutes.flatMap((row) => row.calls));
  return {
    ...route,
    registrationVerified: sourceRoutes.length > 0,
    sourceRoutes,
    policyEvidence: symbols.filter(
      (row) => row.path.startsWith(`services/${route.service}/src/`) && refs.has(row.name),
    ),
    accessEvidence:
      'roles are declared contract; source locations and guards are static evidence, not an exhaustive authorization proof',
    status: 'partial-end-to-end-acceptance-unverified',
  };
});
const undocumentedRegistrations = registrations.filter(
  (row) =>
    row.service !== 'api-gateway' &&
    row.path.includes('/transport/') &&
    row.pattern.startsWith('/v1/') &&
    !declared.some(
      (route) =>
        route.service === row.service &&
        route.method === row.method &&
        matches(row.pattern, canonical(route.servicePath)),
    ),
);
const manifests = files
  .filter((path) =>
    /\/(apps|packages|services)\/[^/]+\/package\.json$/.test(path.replaceAll('\\', '/')),
  )
  .map((path) => ({
    path: pathOf(path),
    ...(JSON.parse(textOf(path)) as Record<string, unknown>),
  }));
const result = {
  schemaVersion: 1,
  revision,
  scope: 'source snapshot; generated/native platform output excluded',
  limitations: [
    'No hosted staging or physical-device acceptance.',
    'Anonymous functions are listed but not individually certified.',
    'Only finite compiler-bound registrations match; unresolved dynamic calls fail closed. Role declarations require behavioral tests.',
    'Legacy demo actions are not server integration.',
    'Gateway forwarding registrations are listed separately, not compared to domain-service operations.',
  ],
  counts: {
    workspaces: manifests.length,
    sourceFiles: sources.length,
    symbols: symbols.length,
    legacyScreens: ui.filter((row) => row.kind === 'routes').length,
    legacyActions: ui.filter((row) => row.kind === 'actions').length,
    representativeServerPages: ui.filter((row) => row.kind === 'server-page').length,
    documentedOperations: operations.length,
    gatewayProxyRegistrations: registrations.filter((row) => row.service === 'api-gateway').length,
    unmatchedOperations: operations.filter((row) => !row.registrationVerified).length,
    undocumentedRegistrations: undocumentedRegistrations.length,
    unresolvedRegistrations: unresolvedRegistrations.length,
  },
  manifests,
  sources,
  ui,
  operations,
  registrations,
  undocumentedRegistrations,
  unresolvedRegistrations,
  symbols,
  migrations: files
    .filter((path) => path.endsWith('.sql') || path.includes('/migrations/'))
    .map(pathOf),
  tests: files
    .filter(
      (path) =>
        /\.(test|spec)\.(ts|mts|cts|tsx)$/.test(path) || path.includes('/tests/regression/'),
    )
    .map(pathOf),
  workflows: files.filter((path) => path.includes('/.github/workflows/')).map(pathOf),
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result.counts, null, 2));
if (
  result.counts.unmatchedOperations ||
  undocumentedRegistrations.length ||
  unresolvedRegistrations.length
)
  process.exitCode = 1;

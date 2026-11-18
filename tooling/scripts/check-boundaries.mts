// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import fs from 'node:fs';
import path from 'node:path';
import { builtinModules, createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require(process.env.ELVORANCE_TYPESCRIPT_PATH || 'typescript');
const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
const codeExtensions = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx']);
const frontendPackages = new Set([
  'ui',
  'design-system',
  'app-runtime',
  'demo-data',
  'api-client',
  'mobile-platform',
  'mobile-auth',
  'questionnaire',
]);
const backendPackages = new Set(['contracts', 'service-kit', 'events', 'questionnaire']);
const packageRules = {
  contracts: [],
  'service-kit': ['contracts'],
  events: ['contracts', 'service-kit'],
  ui: [...frontendPackages, 'contracts'],
  'design-system': [],
  'app-runtime': [...frontendPackages, 'contracts'],
  'demo-data': ['contracts', 'questionnaire'],
  questionnaire: ['contracts'],
  'api-client': ['contracts', 'mobile-platform', 'mobile-auth'],
  'mobile-platform': ['contracts'],
  'mobile-auth': [],
};
const relative = (root, file) => path.relative(root, file).split(path.sep).join('/');
/** Compare native paths, including the forward slashes returned by TypeScript on Windows. */
export function isPathWithin(directory, file, pathApi = path) {
  const relativePath = pathApi.relative(directory, file);
  return (
    relativePath === '' ||
    (relativePath !== '..' &&
      !relativePath.startsWith(`..${pathApi.sep}`) &&
      !pathApi.isAbsolute(relativePath))
  );
}
const within = isPathWithin;
const real = (file) => {
  try {
    return fs.realpathSync(file);
  } catch {
    return path.resolve(file);
  }
};
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** Source/import and manifest policy only. This does not inspect SQL access at runtime. */
export function auditRepository(inputRoot) {
  const root = real(inputRoot);
  const violations = [],
    edges = [],
    workspaces = [],
    seen = new Set();
  const add = (code, file, message, line) => {
    const issue = { code, file: relative(root, file), ...(line ? { line } : {}), message };
    const key = JSON.stringify(issue);
    if (!seen.has(key)) {
      seen.add(key);
      violations.push(issue);
    }
  };
  for (const group of ['apps', 'services', 'packages']) {
    const parent = path.join(root, group);
    if (!fs.existsSync(parent)) continue;
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const directory = real(path.join(parent, entry.name));
      const manifest = path.join(directory, 'package.json');
      if (!within(root, directory)) {
        add('workspace-outside-root', manifest, 'Workspace symlink leaves the repository.');
        continue;
      }
      if (!fs.existsSync(manifest)) {
        add(
          'missing-manifest',
          manifest,
          'Every app, service and shared package needs its own package.json.',
        );
        continue;
      }
      try {
        const json = readJSON(manifest);
        if (!json.name) add('missing-name', manifest, 'Workspace package name is required.');
        workspaces.push({ group, folder: entry.name, directory, manifest, json, name: json.name });
      } catch (error) {
        add('invalid-manifest', manifest, error.message);
      }
    }
  }
  const byName = new Map();
  for (const workspace of workspaces) {
    if (byName.has(workspace.name))
      add('duplicate-workspace', workspace.manifest, `Duplicate package name ${workspace.name}.`);
    byName.set(workspace.name, workspace);
    if (workspace.group === 'packages' && !packageRules[workspace.folder])
      add(
        'unclassified-package',
        workspace.manifest,
        'Add an explicit dependency policy before introducing a new shared package.',
      );
  }
  const ownerOf = (file) =>
    workspaces
      .filter((ws) => within(ws.directory, real(file)))
      .sort((a, b) => b.directory.length - a.directory.length)[0];
  const allowed = (from, to) => {
    if (from === to) return true;
    if (to.group !== 'packages') return false;
    if (from.group === 'apps') return frontendPackages.has(to.folder) || to.folder === 'contracts';
    if (from.group === 'services') return backendPackages.has(to.folder);
    return (packageRules[from.folder] || []).includes(to.folder);
  };
  const checkEdge = (from, to, file, specifier, line, via) => {
    if (from === to) return;
    edges.push({ from: from.name, to: to.name, file: relative(root, file), specifier, via });
    if (!allowed(from, to))
      add(
        'forbidden-dependency',
        file,
        `${from.name} cannot depend on ${to.name} (${specifier}, ${via}).`,
        line,
      );
  };
  function dependencyTarget(name, version, from) {
    if (byName.has(name)) return byName.get(name);
    if (/^(file:|link:)/.test(version))
      return ownerOf(path.resolve(from.directory, version.replace(/^(file:|link:)/, '')));
    if (version.startsWith('npm:')) {
      const aliased = version.slice(4).match(/^(@[^/]+\/[^@]+|[^@]+)/)?.[1];
      return byName.get(aliased);
    }
  }
  for (const workspace of workspaces) {
    for (const field of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      for (const [name, version] of Object.entries(workspace.json[field] || {})) {
        const target = dependencyTarget(name, String(version), workspace);
        if (target) checkEdge(workspace, target, workspace.manifest, name, undefined, field);
        else if (name.startsWith('@elvorance/'))
          add(
            'unknown-internal-package',
            workspace.manifest,
            `Unknown internal dependency ${name}.`,
          );
      }
    }
  }
  const configCache = new Map();
  function compilerOptions(file) {
    const start = path.dirname(file);
    if (configCache.has(start)) return configCache.get(start);
    const config = ts.findConfigFile(start, fs.existsSync, 'tsconfig.json');
    let options = {
      allowJs: true,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      module: ts.ModuleKind.NodeNext,
      resolveJsonModule: true,
    };
    if (config && within(root, config)) {
      const loaded = ts.readConfigFile(config, ts.sys.readFile);
      if (loaded.error)
        add(
          'invalid-tsconfig',
          config,
          ts.flattenDiagnosticMessageText(loaded.error.messageText, '\n'),
        );
      else
        options = {
          ...options,
          ...ts.parseJsonConfigFileContent(loaded.config, ts.sys, path.dirname(config)).options,
        };
    }
    configCache.set(start, options);
    return options;
  }
  const packageName = (specifier) =>
    specifier.startsWith('@')
      ? specifier.split('/').slice(0, 2).join('/')
      : specifier.split('/')[0];
  const conditionTarget = (value) =>
    typeof value === 'string'
      ? value
      : value && !Array.isArray(value) && typeof value === 'object'
        ? conditionTarget(value.import || value.node || value.default || Object.values(value)[0])
        : undefined;
  function resolvedImport(specifier, file, workspace, depth = 0) {
    if (depth > 8) return null;
    const resolved = ts.resolveModuleName(specifier, file, compilerOptions(file), ts.sys)
      .resolvedModule?.resolvedFileName;
    if (resolved) return real(resolved);
    if (specifier.startsWith('#')) {
      const replacement = conditionTarget(workspace.json.imports?.[specifier]);
      if (replacement)
        return resolvedImport(
          replacement.startsWith('.')
            ? path.resolve(workspace.directory, replacement)
            : replacement,
          file,
          workspace,
          depth + 1,
        );
    }
    if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
      const base = path.resolve(path.dirname(file), specifier);
      return [
        base,
        ...['.mjs', '.js', '.cjs', '.ts', '.json'].map((ext) => base + ext),
        ...['index.mjs', 'index.js', 'index.ts'].map((name) => path.join(base, name)),
      ].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    }
    return null;
  }
  function checkImport(workspace, file, specifier, line) {
    if (builtins.has(specifier) || specifier.startsWith('node:')) return;
    const resolved = resolvedImport(specifier, file, workspace);
    const resolvedOwner = resolved && ownerOf(resolved);
    const bare =
      !specifier.startsWith('.') && !specifier.startsWith('#') && !path.isAbsolute(specifier);
    const dependency = packageName(specifier);
    const declared = [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ].some((field) => Object.hasOwn(workspace.json[field] || {}, dependency));
    const internal = byName.get(dependency);
    if (resolvedOwner) {
      checkEdge(workspace, resolvedOwner, file, specifier, line, 'source');
      const ownsDeclaration = [
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies',
      ].some((field) =>
        Object.entries(workspace.json[field] || {}).some(
          ([name, version]) => dependencyTarget(name, String(version), workspace) === resolvedOwner,
        ),
      );
      if (resolvedOwner !== workspace && !ownsDeclaration)
        add(
          'undeclared-dependency',
          file,
          `Declare ${resolvedOwner.name} in this workspace, including when importing through a path alias.`,
          line,
        );
      return;
    }
    if (internal) {
      checkEdge(workspace, internal, file, specifier, line, 'source');
      if (internal !== workspace && !declared)
        add('undeclared-dependency', file, `Declare ${dependency} in this workspace.`, line);
      if (specifier.split('/').includes('..'))
        add(
          'package-path-traversal',
          file,
          `Package import must not contain '..': ${specifier}.`,
          line,
        );
      return;
    }
    if (bare) {
      if (/^(https?:|data:|file:)/.test(specifier))
        add(
          'remote-or-file-import',
          file,
          'Source imports cannot bypass workspace policy through URL loaders.',
          line,
        );
      else if (!declared)
        add(
          'undeclared-dependency',
          file,
          `External import ${dependency} must be declared in ${workspace.name}.`,
          line,
        );
      return;
    }
    if (resolved)
      add(
        'unowned-source',
        file,
        `Import resolves outside an owned workspace: ${specifier}.`,
        line,
      );
    else
      add(
        'unresolved-import',
        file,
        `Cannot resolve ${specifier}; aliases must be declared and resolvable.`,
        line,
      );
  }
  let sourceFiles = 0;
  function inspect(file, workspace) {
    sourceFiles++;
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const error of source.parseDiagnostics)
      add(
        'syntax-error',
        file,
        ts.flattenDiagnosticMessageText(error.messageText, '\n'),
        source.getLineAndCharacterOfPosition(error.start || 0).line + 1,
      );
    const requireNames = new Set(['require']);
    const createRequireNames = new Set(['createRequire']);
    function aliases(node) {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        ['module', 'node:module'].includes(node.moduleSpecifier.text)
      ) {
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings))
          for (const item of bindings.elements)
            if ((item.propertyName?.text || item.name.text) === 'createRequire')
              createRequireNames.add(item.name.text);
      }
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        createRequireNames.has(node.initializer.expression.text)
      )
        requireNames.add(node.name.text);
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isIdentifier(node.initializer) &&
        requireNames.has(node.initializer.text)
      )
        requireNames.add(node.name.text);
      ts.forEachChild(node, aliases);
    }
    aliases(source);
    function record(node, argument) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      if (
        argument &&
        (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
      )
        checkImport(workspace, file, argument.text, line);
      else
        add(
          'dynamic-import',
          file,
          'Module loading requires a literal specifier; computed module paths bypass the architecture graph.',
          line,
        );
    }
    function visit(node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier) record(node, node.moduleSpecifier);
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      )
        record(node, node.moduleReference.expression);
      else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
        record(node, node.argument.literal);
      else if (ts.isCallExpression(node)) {
        const expression = node.expression;
        if (
          expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(expression) && requireNames.has(expression.text)) ||
          (ts.isPropertyAccessExpression(expression) &&
            ((ts.isIdentifier(expression.expression) &&
              requireNames.has(expression.expression.text) &&
              expression.name.text === 'resolve') ||
              (expression.expression.getText(source) === 'module' &&
                expression.name.text === 'require')))
        )
          record(node, node.arguments[0]);
        if (ts.isIdentifier(expression) && expression.text === 'eval')
          add(
            'runtime-code-loader',
            file,
            'eval is not permitted in workspace source; it evades static dependency checks.',
            source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          );
      } else if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'Function'
      )
        add(
          'runtime-code-loader',
          file,
          'Function constructor is not permitted in workspace source.',
          source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        );
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  for (const workspace of workspaces) {
    const visitedDirectories = new Set();
    function walk(directory) {
      const actual = real(directory);
      if (visitedDirectories.has(actual)) return;
      visitedDirectories.add(actual);
      if (!within(workspace.directory, actual)) {
        add(
          'workspace-source-symlink',
          directory,
          'Workspace source symlinks must stay within their owner.',
        );
        return;
      }
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (
            directory === workspace.directory &&
            ['node_modules', 'dist', 'build', 'coverage'].includes(entry.name)
          )
            continue;
          if (entry.name === '.git') continue;
          walk(file);
        } else if (entry.isSymbolicLink()) {
          if (!within(workspace.directory, real(file)))
            add(
              'workspace-source-symlink',
              file,
              'Workspace source symlinks must stay within their owner.',
            );
          else if (fs.statSync(file).isDirectory()) walk(file);
          else if (codeExtensions.has(path.extname(file)) && !file.endsWith('.d.ts'))
            inspect(file, workspace);
        } else if (codeExtensions.has(path.extname(file)) && !file.endsWith('.d.ts'))
          inspect(file, workspace);
      }
    }
    walk(workspace.directory);
  }
  const graph = new Map(workspaces.map((ws) => [ws.name, new Set()]));
  for (const edge of edges) graph.get(edge.from)?.add(edge.to);
  const done = new Set(),
    active = [];
  function cycle(name) {
    if (active.includes(name)) {
      add(
        'dependency-cycle',
        byName.get(name).manifest,
        `Workspace cycle: ${[...active.slice(active.indexOf(name)), name].join(' -> ')}.`,
      );
      return;
    }
    if (done.has(name)) return;
    active.push(name);
    for (const next of graph.get(name) || []) cycle(next);
    active.pop();
    done.add(name);
  }
  for (const name of graph.keys()) cycle(name);
  if (!workspaces.length)
    add(
      'empty-workspace-graph',
      path.join(root, 'package.json'),
      'No owned workspaces were found.',
    );
  return {
    ok: violations.length === 0,
    workspaces: workspaces.length,
    sourceFiles,
    edgeCount: edges.length,
    violations,
    edges,
    scope:
      'Static workspace manifests and JS/TS module graph; no claim of runtime SQL, network, authentication or database isolation.',
  };
}

if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  const index = process.argv.indexOf('--root');
  const root =
    index >= 0 ? process.argv[index + 1] : fileURLToPath(new URL('../../', import.meta.url));
  const report = auditRepository(root);
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(
      `Architecture: ${report.workspaces} workspaces, ${report.sourceFiles} source files, ${report.edgeCount} internal edges, ${report.violations.length} violations.`,
    );
    for (const issue of report.violations)
      console.error(
        `${issue.code}: ${issue.file}${issue.line ? ':' + issue.line : ''} — ${issue.message}`,
      );
    console.log(report.scope);
  }
  if (!report.ok) process.exitCode = 1;
}

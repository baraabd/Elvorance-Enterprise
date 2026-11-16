// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditRepository, isPathWithin } from '../../tooling/scripts/check-boundaries.mts';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'elvorance-boundaries-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, content) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  write(
    'package.json',
    JSON.stringify({ private: true, workspaces: ['apps/*', 'services/*', 'packages/*'] }),
  );
  const workspace = (group, name, dependencies = {}, extra = {}) => {
    const folder = `${group}/${name}`;
    write(
      `${folder}/package.json`,
      JSON.stringify({
        name: `@elvorance/${name}`,
        private: true,
        type: 'module',
        dependencies,
        ...extra,
      }),
    );
    write(`${folder}/src/index.mjs`, 'export const value = 1;');
    return folder;
  };
  const report = () => auditRepository(root);
  return { root, write, workspace, report };
}
const has = (report, code) => report.violations.some((issue) => issue.code === code);

test('permitted frontend and backend contract edges pass', (t) => {
  const f = fixture(t);
  f.workspace('packages', 'contracts');
  f.workspace('packages', 'design-system');
  f.workspace('packages', 'ui', { '@elvorance/design-system': '*' });
  f.workspace('packages', 'service-kit', { '@elvorance/contracts': '*' });
  f.workspace('packages', 'events', { '@elvorance/contracts': '*', '@elvorance/service-kit': '*' });
  f.workspace('apps', 'rep-mobile', { '@elvorance/ui': '*' });
  f.workspace('services', 'sales', { '@elvorance/service-kit': '*', '@elvorance/events': '*' });
  f.write('apps/rep-mobile/src/index.mjs', "import '@elvorance/ui';");
  f.write('services/sales/src/index.mjs', "import '@elvorance/service-kit'; import('@elvorance/events');");
  assert.deepEqual(f.report().violations, []);
});

test('app-to-app package dependency is rejected before any import', (t) => {
  const f = fixture(t);
  f.workspace('apps', 'client-mobile');
  f.workspace('apps', 'rep-mobile', { '@elvorance/client-mobile': '*' });
  assert(has(f.report(), 'forbidden-dependency'));
});

test('relative app-to-service import is rejected', (t) => {
  const f = fixture(t);
  f.workspace('apps', 'admin-web');
  f.workspace('services', 'crm');
  f.write('apps/admin-web/src/index.mjs', "import '../../../services/crm/src/index.mjs';");
  assert(has(f.report(), 'forbidden-dependency'));
});

test('service-to-service re-export is rejected', (t) => {
  const f = fixture(t);
  f.workspace('services', 'sales');
  f.workspace('services', 'billing');
  f.write('services/sales/src/index.mjs', "export { value } from '../../billing/src/index.mjs';");
  assert(has(f.report(), 'forbidden-dependency'));
});

test('service-kit cannot import a business service', (t) => {
  const f = fixture(t);
  f.workspace('packages', 'service-kit');
  f.workspace('services', 'identity');
  f.write(
    'packages/service-kit/src/index.mjs',
    "import '../../../services/identity/src/index.mjs';",
  );
  assert(has(f.report(), 'forbidden-dependency'));
});

test('service cannot depend on UI via a devDependency exception', (t) => {
  const f = fixture(t);
  f.workspace('packages', 'ui');
  f.workspace('services', 'crm', {}, { devDependencies: { '@elvorance/ui': '*' } });
  assert(has(f.report(), 'forbidden-dependency'));
});

test('file dependency alias cannot hide a sibling service', (t) => {
  const f = fixture(t);
  f.workspace('services', 'billing');
  f.workspace('services', 'sales', { innocent: 'file:../billing' });
  assert(has(f.report(), 'forbidden-dependency'));
});

test('npm dependency alias cannot hide a sibling service', (t) => {
  const f = fixture(t);
  f.workspace('services', 'billing');
  f.workspace('services', 'sales', { innocent: 'npm:@elvorance/billing@2.0.0' });
  assert(has(f.report(), 'forbidden-dependency'));
});

test('tsconfig paths cannot hide an app-to-service edge', (t) => {
  const f = fixture(t);
  f.workspace('apps', 'admin-web');
  f.workspace('services', 'crm');
  f.write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: { '@hidden/*': ['services/*/src/index.mjs'] },
        allowJs: true,
      },
    }),
  );
  f.write('apps/admin-web/src/index.mjs', "import '@hidden/crm';");
  assert(has(f.report(), 'forbidden-dependency'));
});

test('Windows containment accepts TypeScript paths without admitting another directory or drive', () => {
  const root = 'C:\\Elvorance';
  for (const file of [
    'C:/Elvorance/tsconfig.json',
    'c:/elvorance/apps/admin-web/tsconfig.json',
    'C:\\Elvorance\\apps/admin-web/tsconfig.json',
    'C:/Elvorance/..cache/tsconfig.json',
    'C:/Elvorance/',
  ]) {
    assert.equal(isPathWithin(root, file, path.win32), true, file);
  }
  for (const file of [
    'C:/Elvorance-other/tsconfig.json',
    'C:/Elvorance/../other/tsconfig.json',
    'C:/',
    'D:/Elvorance/tsconfig.json',
    '//server/share/Elvorance/tsconfig.json',
  ]) {
    assert.equal(isPathWithin(root, file, path.win32), false, file);
  }
  assert.equal(
    isPathWithin(
      '\\\\server\\share\\Elvorance',
      '//server/share/Elvorance/tsconfig.json',
      path.win32,
    ),
    true,
  );
  assert.equal(
    isPathWithin(
      '\\\\server\\share\\Elvorance',
      '//server/other/Elvorance/tsconfig.json',
      path.win32,
    ),
    false,
  );
  assert.equal(isPathWithin('/repo', '/Repo/tsconfig.json', path.posix), false);
  assert.equal(isPathWithin('/repo', '/repo-other/tsconfig.json', path.posix), false);
});

test('a declared external package cannot conceal a tsconfig alias into a service', (t) => {
  const f = fixture(t);
  f.workspace('apps', 'admin-web', { '@hidden/crm': '*' });
  f.workspace('services', 'crm');
  f.write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: { '@hidden/*': ['services/*/src/index.mjs'] },
        allowJs: true,
      },
    }),
  );
  f.write('apps/admin-web/src/index.mjs', "import '@hidden/crm';");
  const report = f.report();
  assert(has(report, 'forbidden-dependency'));
  assert(has(report, 'undeclared-dependency'));
  assert(
    report.edges.some(
      (edge) =>
        edge.from === '@elvorance/admin-web' && edge.to === '@elvorance/crm' && edge.via === 'source',
    ),
  );
});

test('package imports aliases cannot hide a service dependency', (t) => {
  const f = fixture(t);
  f.workspace('services', 'billing');
  f.workspace('services', 'sales', {}, { imports: { '#hidden': '../billing/src/index.mjs' } });
  f.write('services/sales/src/index.mjs', "import '#hidden';");
  assert(has(f.report(), 'forbidden-dependency'));
});

test('literal dynamic imports are checked', (t) => {
  const f = fixture(t);
  f.workspace('apps', 'client-mobile');
  f.workspace('apps', 'rep-mobile');
  f.write('apps/rep-mobile/src/index.mjs', "await import('../../client-mobile/src/index.mjs');");
  assert(has(f.report(), 'forbidden-dependency'));
});

test('computed dynamic imports fail closed', (t) => {
  const f = fixture(t);
  f.workspace('apps', 'rep-mobile');
  f.write('apps/rep-mobile/src/index.mjs', "const file = 'client'; import('./' + file + '.js');");
  assert(has(f.report(), 'dynamic-import'));
});

test('CommonJS require and require.resolve are checked', (t) => {
  const f = fixture(t);
  f.workspace('services', 'sales');
  f.workspace('services', 'billing');
  f.write(
    'services/sales/src/index.cjs',
    "require('../../billing/src/index.mjs'); require.resolve('../../billing/src/index.mjs');",
  );
  assert(has(f.report(), 'forbidden-dependency'));
});

test('createRequire alias cannot bypass the check', (t) => {
  const f = fixture(t);
  f.workspace('services', 'sales');
  f.workspace('services', 'billing');
  f.write(
    'services/sales/src/index.mjs',
    "import { createRequire as makeRequire } from 'node:module'; const loader = makeRequire(import.meta.url); loader('../../billing/src/index.mjs');",
  );
  assert(has(f.report(), 'forbidden-dependency'));
});

test('require variable alias cannot bypass the check', (t) => {
  const f = fixture(t);
  f.workspace('services', 'sales');
  f.workspace('services', 'billing');
  f.write(
    'services/sales/src/index.cjs',
    "const loader = require; loader('../../billing/src/index.mjs');",
  );
  assert(has(f.report(), 'forbidden-dependency'));
});

test('TypeScript type-only imports remain architectural dependencies', (t) => {
  const f = fixture(t);
  f.workspace('apps', 'admin-web');
  f.workspace('services', 'crm');
  f.write(
    'apps/admin-web/src/types.ts',
    "type Internal = import('../../../services/crm/src/index.mjs').value;",
  );
  assert(has(f.report(), 'forbidden-dependency'));
});

test('allowed internal import still requires its own workspace declaration', (t) => {
  const f = fixture(t);
  f.workspace('apps', 'rep-mobile');
  f.workspace('packages', 'ui');
  f.write('apps/rep-mobile/src/index.mjs', "import '@elvorance/ui';");
  assert(has(f.report(), 'undeclared-dependency'));
});

test('unrelated string literals and comments are not imports', (t) => {
  const f = fixture(t);
  f.workspace('apps', 'rep-mobile');
  f.write(
    'apps/rep-mobile/src/index.mjs',
    "// import '../../services/crm/src/index.mjs';\nconst text = \"require('hidden')\"; const regex = /import\\(.+\\)/;",
  );
  assert.deepEqual(f.report().violations, []);
});

test('external imports need declared dependencies', (t) => {
  const f = fixture(t);
  f.workspace('services', 'crm');
  f.write('services/crm/src/index.mjs', "import 'not-declared';");
  assert(has(f.report(), 'undeclared-dependency'));
});

test('workspace dependency cycles are rejected', (t) => {
  const f = fixture(t);
  f.workspace('packages', 'ui', { '@elvorance/app-runtime': '*' });
  f.workspace('packages', 'app-runtime', { '@elvorance/ui': '*' });
  assert(has(f.report(), 'dependency-cycle'));
});

test('unknown shared package requires explicit classification', (t) => {
  const f = fixture(t);
  f.workspace('packages', 'business-global-state');
  assert(has(f.report(), 'unclassified-package'));
});

test('source symlink to another owner is rejected', (t) => {
  const f = fixture(t);
  f.workspace('services', 'sales');
  f.workspace('services', 'billing');
  try {
    fs.symlinkSync(
      path.join(f.root, 'services/billing/src/index.mjs'),
      path.join(f.root, 'services/sales/src/hidden.mjs'),
    );
  } catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) {
      t.skip('Creating symbolic links is unavailable for this Windows account.');
      return;
    }
    throw error;
  }
  assert(has(f.report(), 'workspace-source-symlink'));
});

test('runtime code loaders fail rather than silently bypass the graph', (t) => {
  const f = fixture(t);
  f.workspace('apps', 'rep-mobile');
  f.write('apps/rep-mobile/src/index.mjs', "eval('import(\"hidden\")'); new Function('return 1');");
  assert(has(f.report(), 'runtime-code-loader'));
});

test('a parse error is reported and cannot produce a clean audit', (t) => {
  const f = fixture(t);
  f.workspace('apps', 'rep-mobile');
  f.write('apps/rep-mobile/src/index.mjs', 'export const = ;');
  assert(has(f.report(), 'syntax-error'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { roots, workspace } from '../../tooling/production/source.mts';
import {
  registeredSources,
  liveSectionSources,
  sourceString,
} from '../../tooling/production/registration-source.mts';
import { discover } from '../../tooling/production/discover.mts';
import ts from 'typescript';
async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(resolve(tmpdir(), 's01-registration-'));
  await Promise.all(roots.map((name) => mkdir(resolve(root, name), { recursive: true })));
  for (const [path, text] of Object.entries(files)) {
    await mkdir(resolve(root, path, '..'), { recursive: true });
    await writeFile(resolve(root, path), text);
  }
  return { root, dispose: () => rm(root, { recursive: true, force: true }) };
}
test('finite registrations expand literal object loops and retain exact handler bindings', async () => {
  const f = await fixture({
    'services/sales/src/app.ts': `for (const domain of [{path:'tasks',table:'tasks'},{path:'opportunities',table:'opportunities'}]) {app.get(\`/v1/\${domain.path}\`,()=>tx.list(domain.table));}`,
  });
  try {
    const ws = await workspace(f.root),
      rows = registeredSources(ws, 'sales');
    assert.deepEqual(
      rows.map((row) => row.path),
      ['/v1/tasks', '/v1/opportunities'],
    );
    for (const row of rows) {
      let table: string | undefined;
      const walk = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && node.expression.getText() === 'tx.list')
          table = sourceString(ws, node.arguments[0], row.bindings);
        ts.forEachChild(node, walk);
      };
      walk(row.node);
      assert.equal(table, row.path.slice(4));
    }
  } finally {
    await f.dispose();
  }
});
test('gateway object registrations expand imported finite arrays, not guessed service names', async () => {
  const f = await fixture({
    'services/api-gateway/src/names.ts': `export const services=['one','two'] as const;`,
    'services/api-gateway/src/app.ts': `import {services} from './names.ts'; for(const name of services) app.route({method:['GET','POST'],url:\`/v1/\${name}/*\`,handler:()=>{}});`,
  });
  try {
    const rows = registeredSources(await workspace(f.root), 'api-gateway');
    assert.deepEqual(
      rows.map((r) => r.method + ' ' + r.path),
      ['GET /v1/one/*', 'POST /v1/one/*', 'GET /v1/two/*', 'POST /v1/two/*'],
    );
  } finally {
    await f.dispose();
  }
});
test('unknown runtime loops do not manufacture literal routes', async () => {
  const f = await fixture({
    'services/sales/src/app.ts': `for(const domain of loadRemoteRegistry()) app.get(\`/v1/\${domain.path}\`,()=>{});`,
  });
  try {
    assert.deepEqual(registeredSources(await workspace(f.root), 'sales'), []);
  } finally {
    await f.dispose();
  }
});
test('role-selected live sections distinguish client and administrator copies', async () => {
  const f = await fixture({
    'packages/api-client/src/live-workspace.ts': `export function sectionsForRole(role,api){const shared=[{id:'quotes',load:api.quotes}];if(role==='client')return [{id:'invoices',label:'client'},...shared];if(role==='rep')return shared;return [...shared,{id:'invoices',label:'admin'}];}`,
  });
  try {
    const ws = await workspace(f.root);
    for (const role of ['client', 'admin']) {
      const sections = liveSectionSources(ws, role);
      assert.equal(sections.length, 2);
      assert.ok(sections.some((node) => node.getText().includes("label:'" + role + "'")));
    }
    assert.equal(liveSectionSources(ws, 'rep').length, 1);
  } finally {
    await f.dispose();
  }
});
test('gateway health registration belongs to the gateway, not an unrelated shared factory', async () => {
  const f = await fixture({
    'services/api-gateway/src/app.ts': `app.get('/health',()=>({service:'gateway'}));`,
    'packages/service-kit/http.ts': `app.get('/health',()=>({service:'domain'}));`,
  });
  try {
    const inventory = await discover(await workspace(f.root), [
      {
        owner: 'api-gateway',
        kind: 'api-route',
        mode: 'backend',
        key: 'GET /health',
        method: 'GET',
        path: '/health',
      },
    ]);
    const row = inventory.features.find(
      (item) => item.id === 'api-route:api-gateway:backend:GET /health',
    );
    assert.equal(row?.source.path, 'services/api-gateway/src/app.ts');
    assert.ok(!row?.unresolved.some((text) => text.includes('Multiple compatible')));
  } finally {
    await f.dispose();
  }
});
test('finite source route binding resolves dynamic registration anchors without calling production APIs', async () => {
  const f = await fixture({
    'services/sales/src/app.ts': `for(const kind of ['accept','reject'])app.post(\`/v1/quotes/:id/\${kind}\`,()=>{});`,
  });
  try {
    const inventory = await discover(await workspace(f.root), [
      {
        owner: 'sales',
        kind: 'api-route',
        mode: 'backend',
        key: 'POST /v1/quotes/:id/accept',
        method: 'POST',
        path: '/v1/quotes/:id/accept',
      },
    ]);
    const row = inventory.features.find((item) => item.kind === 'api-route');
    assert.ok(row);
    assert.ok(!row.unresolved.some((text) => text.includes('declaration is shared/dynamic')));
  } finally {
    await f.dispose();
  }
});
test('HTTP HEAD registrations are protocol operations, never presentation-only UI exemptions', async () => {
  const f = await fixture({ 'services/crm/src/app.ts': `app.get('/v1/customers',()=>{});` });
  try {
    const inventory = await discover(await workspace(f.root), [
      {
        owner: 'crm',
        kind: 'api-route',
        mode: 'backend',
        key: 'HEAD /v1/customers',
        method: 'HEAD',
        path: '/v1/customers',
        automatic: true,
      },
    ]);
    assert.equal(
      inventory.features.find((row) => row.kind === 'api-route')?.presentationOnly,
      null,
    );
  } finally {
    await f.dispose();
  }
});
test('mutable variable initializers are not treated as authoritative registration constants', async () => {
  const f = await fixture({
    'services/crm/src/app.ts': `let path='/before';path=readConfiguration();app.get(path,()=>{});`,
  });
  try {
    assert.deepEqual(
      registeredSources(await workspace(f.root), 'crm').map((row) => row.path),
      [],
    );
  } finally {
    await f.dispose();
  }
});
test('loop bindings never leak into a shadowed function parameter with the same identifier', async () => {
  const f = await fixture({
    'services/sales/src/app.ts': `for(const path of ['/known']) {function register(path){app.get(path,()=>{});}}`,
  });
  try {
    assert.deepEqual(
      registeredSources(await workspace(f.root), 'sales').map((row) => row.path),
      [],
    );
  } finally {
    await f.dispose();
  }
});
test('cyclic aliases and cyclic array spreads terminate without inventing registrations', async () => {
  const f = await fixture({
    'services/crm/src/app.ts': `const a=b,b=a;app.get(a,()=>{});const values=[...values];for(const path of values)app.get(path,()=>{});`,
  });
  try {
    assert.deepEqual(
      registeredSources(await workspace(f.root), 'crm').map((row) => row.path),
      [],
    );
  } finally {
    await f.dispose();
  }
});
test('object spread or duplicate member overrides cannot bind a misleading first property', async () => {
  const f = await fixture({
    'services/crm/src/app.ts': `for(const domain of [{path:'/before',...remote},{path:'/before',path:remote}])app.get(domain.path,()=>{});`,
  });
  try {
    assert.deepEqual(
      registeredSources(await workspace(f.root), 'crm').map((row) => row.path),
      [],
    );
  } finally {
    await f.dispose();
  }
});
test('mutable shorthand values cannot bypass literal-resolution safeguards', async () => {
  const f = await fixture({
    'services/crm/src/app.ts': `let path='/before';path=readConfiguration();const domain={path};app.get(domain.path,()=>{});`,
  });
  try {
    assert.deepEqual(
      registeredSources(await workspace(f.root), 'crm').map((row) => row.path),
      [],
    );
  } finally {
    await f.dispose();
  }
});
test('ambiguous route option spreads and duplicate URLs stay unresolved', async () => {
  const f = await fixture({
    'services/crm/src/app.ts': `app.route({method:'GET',url:'/before',...remote});app.route({method:'GET',url:'/before',url:remote});`,
  });
  try {
    assert.deepEqual(
      registeredSources(await workspace(f.root), 'crm').map((row) => row.path),
      [],
    );
  } finally {
    await f.dispose();
  }
});

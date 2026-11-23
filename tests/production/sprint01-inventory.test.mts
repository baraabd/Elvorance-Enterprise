import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

for (const matched of [true, false]) {
  test(`source inventory ${matched ? 'matches registered operations' : 'fails on a missing operation'}`, async (t) => {
    const root = await mkdtemp(resolve(tmpdir(), 'elvorance-inventory-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const put = async (path: string, content: string): Promise<void> => {
      const destination = resolve(root, path);
      await mkdir(resolve(destination, '..'), { recursive: true });
      await writeFile(destination, content);
    };
    await put('services/sales/package.json', JSON.stringify({ name: '@test/sales' }));
    await put(
      'services/sales/src/transport/routes.ts',
      'for (const response of ["accept"]) app.post(`/v1/quotes/:id/${response}`, handler);',
    );
    await put(
      'apps/rep-mobile/src/features/quotes/index.ts',
      'const feature = { routes: { quotes: {} }, actions: { send() {} } };',
    );
    await put(
      'apps/rep-mobile/src/server/workspace.ts',
      "const pages = { routes: { label: 'Routes', view: routes } };",
    );
    await put(
      'packages/contracts/route-inventory.json',
      JSON.stringify([
        {
          service: 'sales',
          method: 'POST',
          gatewayPath: '/v1/sales/quotes/{id}/accept',
          servicePath: matched ? '/v1/quotes/{id}/accept' : '/v1/missing',
          roles: ['client'],
          summary: 'Fixture',
        },
      ]),
    );
    const output = resolve(root, 'inventory.json');
    const child = spawnSync(
      process.execPath,
      [resolve('tooling/scripts/sprint01-inventory.mts'), root, output, 'fixture'],
      { encoding: 'utf8', timeout: 15_000 },
    );
    assert.equal(child.error, undefined);
    assert.equal(child.status, matched ? 0 : 1, child.stderr);
    const result = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(result.counts.legacyScreens, 1);
    assert.equal(result.counts.legacyActions, 1);
    assert.equal(result.counts.representativeServerPages, 1);
    assert.equal(result.counts.unmatchedOperations, matched ? 0 : 1);
    assert.equal(result.operations[0].sourceRoutes.length, matched ? 1 : 0);
    assert.equal(result.revision, 'fixture');
  });
}

// Inventory tooling fixtures must not become business-workflow coverage candidates.
for (const scenario of [
  {
    name: 'rejects an unresolved dynamic route instead of wildcard matching',
    source: 'app.post(`/v1/quotes/:id/${unknownDecision}`, handler);',
    paths: ['/v1/quotes/{id}/accept'],
    status: 1,
    unresolved: 1,
    undocumented: 0,
  },
  {
    name: 'reports every undocumented finite branch',
    source:
      'for (const decision of ["accept", "reject"]) app.post(`/v1/quotes/:id/${decision}`, handler);',
    paths: ['/v1/quotes/{id}/accept'],
    status: 1,
    unresolved: 0,
    undocumented: 1,
  },
  {
    name: 'resolves a complete finite registration without losing branches',
    source:
      'for (const decision of ["accept", "reject"]) app.post(`/v1/quotes/:id/${decision}`, handler);',
    paths: ['/v1/quotes/{id}/accept', '/v1/quotes/{id}/reject'],
    status: 0,
    unresolved: 0,
    undocumented: 0,
  },
  {
    name: 'does not confuse GET with POST',
    source: 'app.get("/v1/quotes/:id/accept", handler);',
    paths: ['/v1/quotes/{id}/accept'],
    status: 1,
    unresolved: 0,
    undocumented: 1,
  },
]) {
  test(`supplementary inventory ${scenario.name}`, async (t) => {
    const root = await mkdtemp(resolve(tmpdir(), 'elvorance-inventory-negative-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const routeFile = resolve(root, 'services/sales/src/transport/routes.ts');
    const contractFile = resolve(root, 'packages/contracts/route-inventory.json');
    await mkdir(resolve(routeFile, '..'), { recursive: true });
    await mkdir(resolve(contractFile, '..'), { recursive: true });
    await writeFile(routeFile, scenario.source);
    await writeFile(
      contractFile,
      JSON.stringify(
        scenario.paths.map((path) => ({
          service: 'sales',
          method: 'POST',
          gatewayPath: '/v1/sales' + path.slice(3),
          servicePath: path,
          roles: ['client'],
          summary: 'Synthetic source-only fixture',
        })),
      ),
    );
    const output = resolve(root, 'inventory.json');
    const child = spawnSync(
      process.execPath,
      [resolve('tooling/scripts/sprint01-inventory.mts'), root, output, 'fixture'],
      { encoding: 'utf8', timeout: 15_000 },
    );
    assert.equal(child.error, undefined);
    assert.equal(child.status, scenario.status, child.stderr);
    const result = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(result.counts.unresolvedRegistrations, scenario.unresolved);
    assert.equal(result.counts.undocumentedRegistrations, scenario.undocumented);
    if (scenario.status === 0) assert.equal(result.counts.unmatchedOperations, 0);
    if (scenario.unresolved > 0) assert.equal(result.operations[0].registrationVerified, false);
  });
}

test('supplementary inventory rejects malformed route contracts', async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), 'elvorance-inventory-contract-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const contractFile = resolve(root, 'packages/contracts/route-inventory.json');
  await mkdir(resolve(contractFile, '..'), { recursive: true });
  await writeFile(contractFile, JSON.stringify([{ service: 'sales', method: 42 }]));
  const child = spawnSync(
    process.execPath,
    [
      resolve('tooling/scripts/sprint01-inventory.mts'),
      root,
      resolve(root, 'inventory.json'),
      'fixture',
    ],
    { encoding: 'utf8', timeout: 15_000 },
  );
  assert.equal(child.error, undefined);
  assert.equal(child.status, 1);
  assert.match(child.stderr, /Invalid route-inventory contract/);
});

for (const namespace of ['sales', 'unknown']) {
  test(`supplementary inventory classifies ${namespace} gateway namespace without hiding unknown proxies`, async (t) => {
    const root = await mkdtemp(resolve(tmpdir(), 'elvorance-inventory-proxy-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const put = async (path: string, text: string) => {
      const destination = resolve(root, path);
      await mkdir(resolve(destination, '..'), { recursive: true });
      await writeFile(destination, text);
    };
    await put(
      'services/api-gateway/src/transport/routes.ts',
      `app.route({ method: ['GET', 'POST'], url: '/v1/${namespace}/*', handler });`,
    );
    await put('services/sales/src/transport/routes.ts', 'app.post("/v1/quotes", handler);');
    await put(
      'packages/contracts/route-inventory.json',
      JSON.stringify([
        {
          service: 'sales',
          method: 'POST',
          gatewayPath: '/v1/sales/quotes',
          servicePath: '/v1/quotes',
          roles: ['rep'],
          summary: 'Synthetic proxy fixture',
        },
      ]),
    );
    const output = resolve(root, 'inventory.json');
    const child = spawnSync(
      process.execPath,
      [resolve('tooling/scripts/sprint01-inventory.mts'), root, output, 'fixture'],
      { encoding: 'utf8', timeout: 15_000 },
    );
    assert.equal(child.error, undefined);
    assert.equal(child.status, namespace === 'sales' ? 0 : 1, child.stderr);
    const result = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(result.counts.gatewayProxyRegistrations, 2);
    assert.equal(result.counts.documentedOperations, 1);
    assert.equal(result.counts.unmatchedOperations, 0);
    assert.equal(result.counts.undocumentedRegistrations, namespace === 'sales' ? 0 : 2);
    assert.equal(result.gatewayProxyRegistrations[0].namespaceMapped, namespace === 'sales');
  });
}

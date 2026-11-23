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
      'app.post(`/v1/quotes/:id/${response}`, handler);',
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

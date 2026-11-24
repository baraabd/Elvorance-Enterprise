import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fingerprint } from '@elvorance/service-kit';

test('Sprint 04 adds eight operations without changing the prior 84 public operation contracts or existing schemas', async () => {
  const baseline = JSON.parse(
    await readFile('docs/sprint04/public-contract-baseline.json', 'utf8'),
  ) as {
    operations: Record<string, string>;
    schemas: Record<string, string>;
  };
  const api = JSON.parse(await readFile('packages/contracts/openapi.json', 'utf8')) as {
    paths: Record<string, Record<string, unknown>>;
    components: { schemas: Record<string, unknown> };
  };
  const inventory = JSON.parse(
    await readFile('packages/contracts/route-inventory.json', 'utf8'),
  ) as Array<{
    service: string;
    method: string;
    servicePath: string;
    gatewayPath: string;
  }>;
  assert.equal(Object.keys(baseline.operations).length, 84);
  assert.equal(inventory.length, 92);
  for (const [key, hash] of Object.entries(baseline.operations)) {
    const split = key.indexOf(' ');
    const method = key.slice(0, split).toLowerCase(),
      path = key.slice(split + 1);
    assert.equal(fingerprint(api.paths[path]?.[method]), hash, `Public contract changed: ${key}`);
  }
  for (const [name, hash] of Object.entries(baseline.schemas))
    assert.equal(
      fingerprint(api.components.schemas[name]),
      hash,
      `Existing schema changed: ${name}`,
    );
  const actual = JSON.parse(await readFile('docs/production/feature-matrix.json', 'utf8')) as {
    runtimeRegistrations: Array<{
      owner: string;
      mode: string;
      kind: string;
      method?: string;
      path?: string;
      automatic?: boolean;
    }>;
  };
  const routes = actual.runtimeRegistrations.filter(
    (row) =>
      row.mode === 'backend' &&
      row.kind === 'api-route' &&
      row.owner !== 'api-gateway' &&
      !row.automatic &&
      row.path?.startsWith('/v1/'),
  );
  const key = (service: string, method: string, path: string) =>
    `${service} ${method} ${path.replace(/:([^/]+)/g, '{$1}')}`;
  assert.deepEqual(
    new Set(routes.map((row) => key(row.owner, row.method ?? '', row.path ?? ''))),
    new Set(inventory.map((row) => key(row.service, row.method, row.servicePath))),
    'Every actual Fastify operation must appear in the API inventory, not only the reverse',
  );
});

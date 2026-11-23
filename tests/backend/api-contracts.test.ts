import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { FastifyInstance, HTTPMethods } from 'fastify';
import { MemoryRepository } from '@elvorance/service-kit';
import { createApp as deliveryApp } from '../../services/delivery/src/app.ts';
import { createApp as billingApp } from '../../services/billing/src/app.ts';
import { createApp as trackingApp } from '../../services/tracking/src/app.ts';
import { tables as deliveryTables } from '../../services/delivery/src/infrastructure/migrations/001_initial.ts';
import { tables as billingTables } from '../../services/billing/src/infrastructure/migrations/001_initial.ts';
import { tables as trackingTables } from '../../services/tracking/src/infrastructure/migrations/001_initial.ts';
import { serviceBindings } from '@elvorance/events';
import { subscriptions as communicationsSubscriptions } from '../../services/communications/src/application/events.ts';
import { repFixture } from './rep-fixture.ts';
import { auth } from './helpers.ts';

test('every documented service operation is registered and all OpenAPI references resolve', async (t) => {
  const f = await repFixture(t);
  const extra = {
    delivery: deliveryApp({ repository: new MemoryRepository('delivery', deliveryTables), auth }),
    billing: billingApp({ repository: new MemoryRepository('billing', billingTables), auth }),
    tracking: trackingApp({ repository: new MemoryRepository('tracking', trackingTables), auth }),
  };
  t.after(async () => {
    await Promise.all(Object.values(extra).map((app) => app.close()));
  });
  const apps: Record<string, FastifyInstance> = {
    crm: f.crm,
    sales: f.sales,
    identity: f.identity,
    communications: f.communications,
    ...extra,
  };
  await Promise.all(Object.values(apps).map((app) => app.ready()));
  const inventory = JSON.parse(
    await readFile('packages/contracts/route-inventory.json', 'utf8'),
  ) as { service: string; method: HTTPMethods; servicePath: string; gatewayPath: string }[];
  const api = JSON.parse(await readFile('packages/contracts/openapi.json', 'utf8')) as Record<
    string,
    unknown
  >;
  const paths = api.paths as Record<string, Record<string, unknown>>;
  for (const entry of inventory) {
    assert.ok(
      apps[entry.service]?.hasRoute({
        method: entry.method,
        url: entry.servicePath.replace(/\{([^}]+)\}/g, ':$1'),
      }),
      `${entry.method} ${entry.service} ${entry.servicePath}`,
    );
    assert.ok(
      paths[entry.gatewayPath]?.[entry.method.toLowerCase()],
      `OpenAPI operation: ${entry.method} ${entry.gatewayPath}`,
    );
  }
  function references(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(references);
      return;
    }
    const object = value as Record<string, unknown>;
    if (typeof object.$ref === 'string') {
      assert.ok(object.$ref.startsWith('#/'), 'Contracts use local versioned references');
      let target: unknown = api;
      for (const part of object.$ref.slice(2).split('/'))
        target = (target as Record<string, unknown> | undefined)?.[
          part.replaceAll('~1', '/').replaceAll('~0', '~')
        ];
      assert.notEqual(target, undefined, object.$ref);
    }
    Object.values(object).forEach(references);
  }
  references(api);
  assert.deepEqual(
    [...communicationsSubscriptions].sort(),
    [...serviceBindings.communications!].sort(),
    'Producer-provisioned durable bindings match the actual communications consumer',
  );
});

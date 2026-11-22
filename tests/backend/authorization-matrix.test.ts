import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SignJWT } from 'jose';
import type { FastifyInstance, HTTPMethods } from 'fastify';
import type {
  CatalogDirectory,
  CatalogSnapshot,
  CustomerContext,
  CustomerDirectory,
  Role,
} from '@elvorance/contracts';
import { AppError, authFromEnv, MemoryRepository } from '@elvorance/service-kit';
import { createApp as gatewayApp } from '../../services/api-gateway/src/app.ts';
import type { Upstreams } from '../../services/api-gateway/src/domain/routes.ts';
import { createApp as identityApp } from '../../services/identity/src/app.ts';
import { tables as identityTables } from '../../services/identity/src/infrastructure/migrations/001_initial.ts';
import { createApp as crmApp } from '../../services/crm/src/app.ts';
import { tables as crmTables } from '../../services/crm/src/infrastructure/migrations/001_initial.ts';
import { createApp as salesApp } from '../../services/sales/src/app.ts';
import { tables as salesTables } from '../../services/sales/src/infrastructure/migrations/001_initial.ts';
import { createApp as deliveryApp } from '../../services/delivery/src/app.ts';
import { tables as deliveryTables } from '../../services/delivery/src/infrastructure/migrations/001_initial.ts';
import { createApp as billingApp } from '../../services/billing/src/app.ts';
import { tables as billingTables } from '../../services/billing/src/infrastructure/migrations/001_initial.ts';
import { createApp as trackingApp } from '../../services/tracking/src/app.ts';
import { tables as trackingTables } from '../../services/tracking/src/infrastructure/migrations/001_initial.ts';
import { createApp as communicationsApp } from '../../services/communications/src/app.ts';
import { tables as communicationsTables } from '../../services/communications/src/infrastructure/migrations/001_initial.ts';

type Operation = {
  service: string;
  method: HTTPMethods;
  servicePath: string;
  gatewayPath: string;
  roles: Role[];
};
type Observation = {
  operation: string;
  path: string;
  transport: string;
  scenario: string;
  actor: string;
  expected: string;
  status: number;
  code: string | null;
  passed: boolean;
};
const roleNames: Role[] = ['admin', 'rep', 'client', 'finance', 'delivery', 'support'];
const fixtureId = 'acceptance-record';
const tenant = 'acceptance-tenant-a';
const marker = 'PRIVATE_ACCEPTANCE_FIXTURE_A';
const inventory = JSON.parse(
  await readFile(resolve('packages/contracts/route-inventory.json'), 'utf8'),
) as Operation[];

// This is a synthetic in-process security test, NOT a hosted environment or user login.
// It exercises real JWT verification and real gateway/service handlers; storage is in memory.
test('authorization matrix: all catalogued operations reject invalid identities and isolate roles/tenants/owners', async (t) => {
  const secret = randomBytes(48);
  const issuer = 'https://acceptance.invalid/issuer';
  const audience = 'elvorance-api';
  const auth = authFromEnv({
    NODE_ENV: 'test',
    AUTH_MODE: 'dev-hs256',
    DEV_JWT_SECRET: secret.toString('hex'),
    OIDC_ISSUER: issuer,
    OIDC_AUDIENCE: audience,
  });
  const key = new TextEncoder().encode(secret.toString('hex'));
  async function token(
    roles: string[],
    overrides: Record<string, unknown> = {},
    signatureKey: Uint8Array = key,
  ) {
    return new SignJWT({
      sub: 'actor-' + roles.join('-'),
      tenant_id: tenant,
      roles,
      rep_id: 'rep-a',
      client_id: fixtureId,
      ...overrides,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(typeof overrides.iss === 'string' ? overrides.iss : issuer)
      .setAudience(typeof overrides.aud === 'string' ? overrides.aud : audience)
      .setIssuedAt()
      .setExpirationTime(typeof overrides.exp === 'number' ? overrides.exp : '5m')
      .sign(signatureKey);
  }
  const repositories: Record<string, MemoryRepository> = {
    identity: new MemoryRepository('identity', identityTables),
    crm: new MemoryRepository('crm', crmTables),
    sales: new MemoryRepository('sales', salesTables),
    delivery: new MemoryRepository('delivery', deliveryTables),
    billing: new MemoryRepository('billing', billingTables),
    tracking: new MemoryRepository('tracking', trackingTables),
    communications: new MemoryRepository('communications', communicationsTables),
  };
  const apps: Record<string, FastifyInstance> = {};
  const directory: CustomerDirectory & CatalogDirectory = {
    async getCatalog(authorization): Promise<CatalogSnapshot> {
      const response = await apps.crm!.inject({
        method: 'GET',
        url: '/v1/catalog',
        headers: { authorization },
      });
      if (response.statusCode !== 200)
        throw new AppError(response.statusCode, 'CATALOG_SCOPE', 'Catalog not accessible');
      return response.json() as CatalogSnapshot;
    },
    async getCustomer(id, authorization): Promise<CustomerContext> {
      const response = await apps.crm!.inject({
        method: 'GET',
        url: '/v1/customers/' + encodeURIComponent(id) + '/context',
        headers: { authorization },
      });
      if (response.statusCode !== 200)
        throw new AppError(response.statusCode, 'CUSTOMER_SCOPE', 'Customer not accessible');
      return response.json() as CustomerContext;
    },
  };
  apps.identity = identityApp({ repository: repositories.identity!, auth });
  apps.crm = crmApp({ repository: repositories.crm!, auth });
  apps.sales = salesApp({ repository: repositories.sales!, auth, customerDirectory: directory });
  apps.delivery = deliveryApp({ repository: repositories.delivery!, auth });
  apps.billing = billingApp({ repository: repositories.billing!, auth });
  apps.tracking = trackingApp({ repository: repositories.tracking!, auth });
  apps.communications = communicationsApp({
    repository: repositories.communications!,
    auth,
    customerDirectory: directory,
  });
  const upstreams = Object.fromEntries(
    Object.keys(apps).map((name) => [name, 'https://' + name + '.acceptance.invalid']),
  ) as Upstreams;
  let forwards = 0;
  const fetcher: typeof fetch = async (input, init) => {
    forwards++;
    const u = new URL(String(input));
    const name = u.hostname.split('.')[0]!;
    assert.ok(apps[name], 'Gateway must never forward outside this fixture');
    const response = await apps[name]!.inject({
      method: (init?.method ?? 'GET') as HTTPMethods,
      url: u.pathname + u.search,
      headers: Object.fromEntries(new Headers(init?.headers)),
      ...(typeof init?.body === 'string' ? { payload: init.body } : {}),
    });
    return new Response(response.body, {
      status: response.statusCode,
      headers: { 'content-type': 'application/json' },
    });
  };
  const gateway = gatewayApp({ auth, upstreams, fetcher });
  t.after(async () => {
    await gateway.close();
    await Promise.all(Object.values(apps).map((app) => app.close()));
  });
  for (const [name, repository] of Object.entries(repositories)) {
    await repository.transaction(tenant, async (tx) => {
      for (const table of repository.tables) {
        await tx.insert(table, {
          id: fixtureId,
          name: marker,
          title: marker,
          subject: marker,
          notes: marker,
          body: marker,
          repId: 'rep-a',
          clientId: fixtureId,
          contractId: fixtureId,
          quoteId: fixtureId,
          visitId: fixtureId,
          status: table === 'quotes' ? 'sent' : table === 'tracking_sessions' ? 'active' : 'open',
          doNotContact: false,
          consentVersion: 1,
          phone: '',
          email: '',
          regionId: null,
          readBy: [],
          messages: [],
          milestones: [],
          deliverables: [],
          items: [],
          paymentPlan: [],
          totalMinor: 10000,
          currency: 'SAR',
          sequence: 0,
          latest: null,
          deviceId: 'acceptance-device-0001',
          lastMessageSequence: 0,
          visitIds: [],
          stops: [],
          profile: {},
          service: name,
        });
      }
    });
  }
  async function snapshot() {
    const result: Record<string, unknown> = {};
    for (const [name, repo] of Object.entries(repositories))
      result[name] = await repo.transaction(tenant, async (tx) =>
        Object.fromEntries(
          await Promise.all(repo.tables.map(async (table) => [table, await tx.list(table)])),
        ),
      );
    return result;
  }
  const positiveControls: string[] = [];
  for (const [service, path, role] of [
    ['crm', '/v1/customers/', 'rep'],
    ['sales', '/v1/visits/', 'rep'],
    ['sales', '/v1/quotes/', 'client'],
    ['sales', '/v1/contracts/', 'admin'],
    ['sales', '/v1/tasks/', 'rep'],
    ['sales', '/v1/opportunities/', 'rep'],
    ['sales', '/v1/routes/', 'rep'],
    ['delivery', '/v1/projects/', 'delivery'],
    ['billing', '/v1/invoices/', 'finance'],
    ['tracking', '/v1/sessions/', 'admin'],
    ['communications', '/v1/tickets/', 'support'],
  ] as const) {
    const response = await apps[service]!.inject({
      method: 'GET',
      url: path + fixtureId,
      headers: { authorization: 'Bearer ' + (await token([role])) },
    });
    assert.equal(
      response.statusCode,
      200,
      `Positive fixture control ${service} ${path}: ${response.body}`,
    );
    positiveControls.push(service + ' ' + path + fixtureId + ' ' + role);
  }
  const before = await snapshot();
  const observations: Observation[] = [];
  const body = {
    expectedVersion: 1,
    clientId: fixtureId,
    visitId: fixtureId,
    repId: 'rep-a',
    name: 'Acceptance fixture',
    reason: 'Synthetic authorization verification',
    decision: 'approve',
    consent: true,
    signature: 'Synthetic test only',
    state: 'stopped',
    message: 'Synthetic message',
    subject: 'Synthetic test',
    category: 'general',
    status: 'resolved',
    title: 'Synthetic task',
    deviceId: 'acceptance-device-0001',
  };
  function pathFor(path: string) {
    return path.replace(/\{[^}]+\}/g, fixtureId);
  }
  async function request(
    op: Operation,
    transport: 'service' | 'gateway',
    authorization: string | undefined,
  ) {
    return (transport === 'gateway' ? gateway : apps[op.service]!).inject({
      method: op.method,
      url: pathFor(transport === 'gateway' ? op.gatewayPath : op.servicePath),
      headers: {
        ...(authorization ? { authorization } : {}),
        'idempotency-key': randomUUID(),
        'x-tenant-id': tenant,
        'x-roles': 'admin',
        ...(op.method === 'GET' ? {} : { 'content-type': 'application/json' }),
      },
      ...(op.method === 'GET' ? {} : { payload: JSON.stringify(body) }),
    });
  }
  function record(
    op: Operation,
    transport: string,
    scenario: string,
    actor: string,
    expected: string,
    response: Awaited<ReturnType<typeof request>>,
    passed: boolean,
  ) {
    const parsed = response.json() as { error?: { code?: string } };
    observations.push({
      operation: op.service + ' ' + op.method + ' ' + op.servicePath,
      path: pathFor(op.gatewayPath),
      transport,
      scenario,
      actor,
      expected,
      status: response.statusCode,
      code: parsed.error?.code ?? null,
      passed,
    });
  }
  const badIdentities: [string, string | undefined][] = [
    ['missing', undefined],
    ['malformed', 'Bearer not-a-jwt'],
    ['bad-signature', 'Bearer ' + (await token(['admin'], {}, randomBytes(48)))],
    ['expired', 'Bearer ' + (await token(['admin'], { exp: 1 }))],
    ['wrong-issuer', 'Bearer ' + (await token(['admin'], { iss: 'https://wrong.invalid' }))],
    ['wrong-audience', 'Bearer ' + (await token(['admin'], { aud: 'another-api' }))],
    ['unknown-role', 'Bearer ' + (await token(['super-admin']))],
    ['empty-roles', 'Bearer ' + (await token([]))],
    ['missing-rep-scope', 'Bearer ' + (await token(['rep'], { rep_id: null }))],
    ['missing-client-scope', 'Bearer ' + (await token(['client'], { client_id: null }))],
    ['invalid-tenant', 'Bearer ' + (await token(['admin'], { tenant_id: '../tenant-b' }))],
  ];
  for (const op of inventory)
    for (const transport of ['service', 'gateway'] as const)
      for (const [label, identity] of badIdentities) {
        const sentBefore = forwards;
        const response = await request(op, transport, identity);
        record(
          op,
          transport,
          'invalid-identity',
          label,
          '401; no gateway forwarding',
          response,
          response.statusCode === 401 && (transport !== 'gateway' || forwards === sentBefore),
        );
      }
  const roleTokens = Object.fromEntries(
    await Promise.all(roleNames.map(async (role) => [role, 'Bearer ' + (await token([role]))])),
  );
  for (const op of inventory)
    for (const role of roleNames.filter((role) => !op.roles.includes(role))) {
      const response = await request(op, 'gateway', roleTokens[role]);
      const parsed = response.json() as { items?: unknown[]; nextCursor?: unknown };
      // A deliberately filtered collection is a denial of data, not a permission to mutate.
      const filtered =
        op.method === 'GET' &&
        !op.servicePath.includes('{') &&
        response.statusCode === 200 &&
        Array.isArray(parsed.items) &&
        parsed.items.length === 0 &&
        parsed.nextCursor == null;
      const denied = [403, 404].includes(response.statusCode);
      record(
        op,
        'gateway',
        'forbidden-role',
        role,
        '403/404 or an explicitly empty scoped collection',
        response,
        (denied || filtered) && !response.body.includes(marker),
      );
    }
  // Existing fixture IDs are used. A 400/409 is never counted as authorization proof.
  for (const op of inventory.filter((op) => op.servicePath.includes('{id}'))) {
    for (const role of op.roles) {
      const identity = 'Bearer ' + (await token([role], { tenant_id: 'acceptance-tenant-b' }));
      const response = await request(op, 'gateway', identity);
      record(
        op,
        'gateway',
        'cross-tenant',
        role,
        '403/404 and no foreign marker',
        response,
        [403, 404].includes(response.statusCode) && !response.body.includes(marker),
      );
    }
    for (const role of op.roles.filter((role) => role === 'rep' || role === 'client')) {
      const identity =
        'Bearer ' + (await token([role], { rep_id: 'rep-b', client_id: 'client-b' }));
      const response = await request(op, 'gateway', identity);
      record(
        op,
        'gateway',
        'wrong-owner',
        role,
        '403/404 and no foreign marker',
        response,
        [403, 404].includes(response.statusCode) && !response.body.includes(marker),
      );
    }
  }
  const unchanged = JSON.stringify(before) === JSON.stringify(await snapshot());
  const failures = observations.filter((row) => !row.passed);
  const report = {
    scope:
      'Synthetic in-process handlers, verified development JWTs and memory storage; not hosted OIDC or complete business-state coverage',
    sourceSha: process.env.GITHUB_SHA ?? 'local-pr4-derived',
    operations: inventory.length,
    roleNames,
    positiveControls,
    checks: observations.length,
    passed: observations.length - failures.length,
    failed: failures.length,
    businessRowsUnchanged: unchanged,
    observations,
  };
  const output = process.env.ELVORANCE_ACCEPTANCE_REPORT_DIR;
  if (output) {
    await mkdir(output, { recursive: true });
    await writeFile(
      resolve(output, 'authorization-matrix.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
  }
  t.diagnostic(
    JSON.stringify({
      operations: inventory.length,
      checks: observations.length,
      failed: failures.length,
      businessRowsUnchanged: unchanged,
    }),
  );
  assert.deepEqual(failures, [], JSON.stringify(failures.slice(0, 20), null, 2));
  assert.ok(unchanged, 'Denied requests must not change business records');
});

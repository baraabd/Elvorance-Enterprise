import { catalogPrices } from './helpers.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import type { CustomerContext, Entity } from '@elvorance/contracts';
import { PgRepository, type Migration } from '@elvorance/service-kit';
import { consumeEvent } from '@elvorance/events';
import {
  tables as identityTables,
  migrations as identityMigrations,
} from '../../services/identity/src/infrastructure/migrations/001_initial.ts';
import {
  tables as crmTables,
  migrations as crmMigrations,
} from '../../services/crm/src/infrastructure/migrations/001_initial.ts';
import {
  tables as salesTables,
  migrations as salesMigrations,
} from '../../services/sales/src/infrastructure/migrations/001_initial.ts';
import {
  tables as deliveryTables,
  migrations as deliveryMigrations,
} from '../../services/delivery/src/infrastructure/migrations/001_initial.ts';
import {
  tables as billingTables,
  migrations as billingMigrations,
} from '../../services/billing/src/infrastructure/migrations/001_initial.ts';
import {
  tables as trackingTables,
  migrations as trackingMigrations,
} from '../../services/tracking/src/infrastructure/migrations/001_initial.ts';
import {
  tables as communicationsTables,
  migrations as communicationsMigrations,
} from '../../services/communications/src/infrastructure/migrations/001_initial.ts';
import { createApp as crmApp } from '../../services/crm/src/app.ts';
import { createApp as salesApp } from '../../services/sales/src/app.ts';
import {
  createApp as deliveryApp,
  handleEvent as deliveryEvent,
} from '../../services/delivery/src/app.ts';
import {
  createApp as billingApp,
  handleEvent as billingEvent,
} from '../../services/billing/src/app.ts';
import { auth, call, principals } from './helpers.ts';
import { createLiveDataApi } from '../../packages/api-client/src/live-data.ts';
import type { EventEnvelope } from '@elvorance/contracts';
import { verifyRepPostgres } from './rep-postgres-scenarios.ts';

const adminUrl = process.env.ELVORANCE_TEST_POSTGRES_URL;
const configs: { name: string; tables: readonly string[]; migrations: Migration[] }[] = [
  { name: 'identity', tables: identityTables, migrations: identityMigrations },
  { name: 'crm', tables: crmTables, migrations: crmMigrations },
  { name: 'sales', tables: salesTables, migrations: salesMigrations },
  { name: 'delivery', tables: deliveryTables, migrations: deliveryMigrations },
  { name: 'billing', tables: billingTables, migrations: billingMigrations },
  { name: 'tracking', tables: trackingTables, migrations: trackingMigrations },
  { name: 'communications', tables: communicationsTables, migrations: communicationsMigrations },
];

test(
  'PostgreSQL: seven owned databases, 42 denied cross-service connections, forced tenant RLS, atomic outbox/inbox and full contract provisioning',
  { skip: !adminUrl, timeout: 120000 },
  async (t) => {
    const administrator = new pg.Client({
      connectionString: adminUrl!,
      connectionTimeoutMillis: 5000,
    });
    await administrator.connect();
    const version = (await administrator.query<{ server_version: string }>('SHOW server_version'))
      .rows[0]!.server_version;
    t.diagnostic(
      `Real PostgreSQL server version: ${version}; no RabbitMQ broker was used in this test.`,
    );
    const prefix = `elvorance_test_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
    const provisioned: {
      name: string;
      db: string;
      role: string;
      password: string;
      url: string;
      repository: PgRepository;
    }[] = [];
    const apps: { close(): Promise<void> }[] = [];
    // Keep track of raw SQL clients so an early assertion cannot leave them connected
    // while DROP DATABASE WITH (FORCE) is running in test cleanup.
    const rawClients = new Set<pg.Client>();
    t.after(async () => {
      await Promise.all([...rawClients].map((client) => client.end().catch(() => {})));
      await Promise.all(apps.map((app) => app.close()));
      for (const service of provisioned) await service.repository.close();
      for (const service of provisioned) {
        await administrator.query(`DROP DATABASE IF EXISTS ${service.db} WITH (FORCE)`);
        await administrator.query(`DROP ROLE IF EXISTS ${service.role}`);
      }
      await administrator.end();
    });
    for (const config of configs) {
      const role = `${prefix}_${config.name}`;
      const db = role;
      const password = randomBytes(24).toString('hex');
      await administrator.query(
        `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`,
      );
      await administrator.query(`CREATE DATABASE ${db} OWNER ${role}`);
      await administrator.query(`REVOKE ALL ON DATABASE ${db} FROM PUBLIC`);
      await administrator.query(`GRANT CONNECT ON DATABASE ${db} TO ${role}`);
      const parsed = new URL(adminUrl!);
      parsed.username = role;
      parsed.password = password;
      parsed.pathname = `/${db}`;
      const url = parsed.toString();
      const repository = new PgRepository(config.name, url, config.tables, config.migrations);
      provisioned.push({ name: config.name, db, role, password, url, repository });
      await repository.migrate();
      await repository.migrate();
      await repository.ping();
      const owner = new pg.Client({ connectionString: url });
      rawClients.add(owner);
      await owner.connect();
      const flags = await owner.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        'SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname=ANY($1::text[])',
        [[...config.tables, 'inbox', 'idempotency_keys']],
      );
      assert.equal(flags.rows.length, config.tables.length + 2);
      for (const row of flags.rows)
        assert.ok(
          row.relrowsecurity && row.relforcerowsecurity,
          `Forced row-level isolation: ${config.name}.${row.relname}`,
        );
      await owner.end();
      rawClients.delete(owner);
    }
    let rejectedConnections = 0;
    for (const source of provisioned)
      for (const target of provisioned)
        if (source.name !== target.name) {
          const url = new URL(source.url);
          url.pathname = `/${target.db}`;
          const forbidden = new pg.Client({
            connectionString: url.toString(),
            connectionTimeoutMillis: 2000,
          });
          try {
            await assert.rejects(
              forbidden.connect(),
              (error) =>
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                error.code === '42501',
            );
            rejectedConnections += 1;
          } finally {
            await forbidden.end().catch(() => {});
          }
        }
    assert.equal(rejectedConnections, 42);
    t.diagnostic(
      'Database isolation: 7 own-role connections succeeded; all 42 cross-service connections were denied.',
    );
    const byName = (name: string) => provisioned.find((service) => service.name === name)!;
    const crmRepository = byName('crm').repository;
    await assert.rejects(
      crmRepository.transaction('tenant-a', async (tx) => {
        await tx.insert<Entity>('customers', { id: 'rolled-back', name: 'Never committed' });
        await tx.emit('crm.test.v1', 'rolled-back', 1, {});
        throw new Error('Rollback test');
      }),
    );
    assert.equal(
      (await crmRepository.transaction('tenant-a', (tx) => tx.list('customers'))).length,
      0,
    );
    assert.equal((await crmRepository.leaseOutbox()).length, 0);
    await crmRepository.transaction('tenant-a', async (tx) => {
      await tx.insert<Entity>('customers', {
        id: 'rls-probe',
        name: 'Tenant A',
        repId: 'rep-a',
        regionId: null,
        phone: '',
        email: '',
        notes: '',
        doNotContact: false,
      });
    });
    assert.equal(
      await crmRepository.transaction('tenant-b', (tx) => tx.get('customers', 'rls-probe')),
      undefined,
    );
    const rawOwner = new pg.Client({ connectionString: byName('crm').url });
    rawClients.add(rawOwner);
    await rawOwner.connect();
    assert.equal(
      (await rawOwner.query('SELECT * FROM customers')).rowCount,
      0,
      'FORCE RLS applies even to the owning service role without a tenant context',
    );
    const flags = await rawOwner.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname='customers'",
    );
    assert.equal(flags.rows[0]!.relforcerowsecurity, true);
    await rawOwner.end();
    rawClients.delete(rawOwner);
    // Prove metadata isolation without repository WHERE clauses, using the actual owner role.
    const metadata = new pg.Client({ connectionString: byName('crm').url });
    rawClients.add(metadata);
    await metadata.connect();
    await metadata.query('BEGIN');
    await metadata.query("SELECT set_config('app.tenant_id', $1, true)", ['tenant-a']);
    await metadata.query(
      "INSERT INTO inbox(tenant_id,consumer,event_id) VALUES('tenant-a','s03-consumer','s03-event')",
    );
    await metadata.query('COMMIT');
    assert.equal(
      (await metadata.query('SELECT * FROM inbox')).rowCount,
      0,
      'Tenant context resets after COMMIT',
    );
    await metadata.query('BEGIN');
    await metadata.query("SELECT set_config('app.tenant_id', $1, true)", ['tenant-b']);
    assert.equal(
      (await metadata.query('SELECT * FROM inbox')).rowCount,
      0,
      'Foreign inbox receipts are invisible',
    );
    assert.equal(
      (await metadata.query("UPDATE inbox SET consumer='other' WHERE tenant_id='tenant-a'"))
        .rowCount,
      0,
    );
    await assert.rejects(
      metadata.query(
        "INSERT INTO inbox(tenant_id,consumer,event_id) VALUES('tenant-a','s03-consumer','other')",
      ),
      (error: unknown) =>
        typeof error === 'object' && error !== null && 'code' in error && error.code === '42501',
    );
    await metadata.query('ROLLBACK');
    await crmRepository.transaction('tenant-a', (tx) =>
      tx.idempotent('s03-actor', 's03-key', 's03-op', {}, async () => ({ confidential: true })),
    );
    assert.equal((await metadata.query('SELECT * FROM idempotency_keys')).rowCount, 0);
    await metadata.query('BEGIN');
    await metadata.query("SELECT set_config('app.tenant_id', $1, true)", ['tenant-b']);
    assert.equal((await metadata.query('SELECT * FROM idempotency_keys')).rowCount, 0);
    assert.equal(
      (await metadata.query("DELETE FROM idempotency_keys WHERE tenant_id='tenant-a'")).rowCount,
      0,
    );
    await metadata.query('COMMIT');
    await metadata.query('BEGIN');
    await metadata.query("SELECT set_config('app.tenant_id', $1, true)", ['tenant-a']);
    assert.equal(
      (await metadata.query('SELECT * FROM idempotency_keys')).rowCount,
      1,
      'Owner retains its own cached result',
    );
    assert.equal((await metadata.query('SELECT * FROM inbox')).rowCount, 1);
    await metadata.query('ROLLBACK');
    await metadata.end();
    rawClients.delete(metadata);
    assert.ok(adminUrl);
    const unsafeUrl = new URL(adminUrl);
    unsafeUrl.pathname = `/${byName('crm').db}`;
    const unsafe = new PgRepository('crm', unsafeUrl.toString(), crmTables, crmMigrations);
    try {
      await assert.rejects(
        unsafe.transaction('tenant-a', (tx) => tx.list('customers')),
        /must not bypass row security/,
      );
    } finally {
      await unsafe.close();
    }
    t.diagnostic(
      'S03: seven metadata RLS policies enforced; tenant read/update/insert denial; pool context reset; privileged request role refused.',
    );
    const crm = crmApp({ repository: crmRepository, auth });
    const sales = salesApp({
      repository: byName('sales').repository,
      auth,
      customerDirectory: {
        ...catalogPrices({ 'scope-1': 3333 }),
        async getCustomer(id, authorization) {
          const response = await crm.inject({
            method: 'GET',
            url: `/v1/customers/${id}/context`,
            headers: { authorization },
          });
          assert.equal(response.statusCode, 200);
          return response.json() as CustomerContext;
        },
      },
    });
    const delivery = deliveryApp({ repository: byName('delivery').repository, auth });
    const billing = billingApp({ repository: byName('billing').repository, auth });
    apps.push(crm, sales, delivery, billing);

    // Authenticate two independent API clients against real PostgreSQL.
    const liveFetch: typeof fetch = async (url, init) => {
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((value, key) => {
        headers[key] = value;
      });
      const response = await crm.inject({
        method: init?.method ?? 'GET',
        url: new URL(String(url)).pathname.replace(/^\/v1\/crm(?=\/)/, '/v1'),
        headers,
        ...(init?.body ? { payload: String(init.body) } : {}),
      });
      return new Response(response.body, {
        status: response.statusCode,
        headers: { 'content-type': 'application/json' },
      });
    };
    const repLive = createLiveDataApi({
      baseUrl: 'http://localhost:3000',
      accessToken: async () => 'rep',
      fetch: liveFetch,
    });
    const adminLive = createLiveDataApi({
      baseUrl: 'http://localhost:3000',
      accessToken: async () => 'admin',
      fetch: liveFetch,
    });
    const outsiderLive = createLiveDataApi({
      baseUrl: 'http://localhost:3000',
      accessToken: async () => 'outsider',
      fetch: liveFetch,
    });
    const liveCreated = await repLive.crm.createCustomer(
      { name: 'Live API PostgreSQL customer', phone: '+963900001234' },
      { idempotencyKey: 'pg-live-customer-intent' },
    );
    assert.ok(liveCreated.version >= 1);
    assert.equal(
      (await adminLive.crm.customers()).find((item) => item.id === liveCreated.id)?.name,
      'Live API PostgreSQL customer',
    );
    const liveUpdated = await adminLive.crm.changeCustomer(
      liveCreated.id,
      { expectedVersion: liveCreated.version, name: 'Updated by admin from live API' },
      { idempotencyKey: 'pg-live-admin-update' },
    );
    assert.equal(
      (await repLive.crm.customers()).find((item) => item.id === liveCreated.id)?.name,
      'Updated by admin from live API',
    );
    assert.equal(liveUpdated.version, liveCreated.version + 1);
    assert.equal(
      (await outsiderLive.crm.customers()).some((item) => item.id === liveCreated.id),
      false,
    );
    const customer = (
      await call(crm, 'POST', '/v1/customers', 'rep', { name: 'PostgreSQL customer' })
    ).body;
    principals.client!.clientId = customer.id;
    let visit = (
      await call(sales, 'POST', '/v1/visits', 'rep', {
        clientId: customer.id,
        scheduledAt: new Date().toISOString(),
        purpose: 'PG lifecycle verification',
      })
    ).body;
    visit = (
      await call(sales, 'POST', `/v1/visits/${visit.id}/start`, 'rep', {
        expectedVersion: visit.version,
        proof: { kind: 'manual', reason: 'Explicit QA manual proof' },
      })
    ).body;
    let quote = (
      await call(sales, 'POST', '/v1/quotes', 'rep', {
        visitId: visit.id,
        currency: 'SAR',
        items: [
          {
            serviceId: 'scope-1',
            title: 'Immutable contract scope',
            quantity: 3,
            unitPriceMinor: 3333,
            deliverables: ['Actual scoped deliverable'],
            duration: 'To be planned',
          },
        ],
        terms: 'PostgreSQL original snapshot',
        validUntil: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        paymentPlan: [
          { id: 'first', label: 'First installment', amountMinor: 5000, dueOn: null },
          { id: 'last', label: 'Final installment', amountMinor: 4999, dueOn: null },
        ],
      })
    ).body;
    quote = (
      await call(sales, 'POST', `/v1/quotes/${quote.id}/send`, 'rep', {
        expectedVersion: quote.version,
      })
    ).body;
    const accepts = await Promise.all([
      call(sales, 'POST', `/v1/quotes/${quote.id}/accept`, 'client', {
        expectedVersion: quote.version,
        consent: true,
      }),
      call(sales, 'POST', `/v1/quotes/${quote.id}/accept`, 'client', {
        expectedVersion: quote.version,
        consent: true,
      }),
    ]);
    assert.deepEqual(accepts.map((response) => response.status).sort(), [200, 409]);
    const contract = accepts.find((response) => response.status === 200)!.body.contract;
    assert.equal((await call(sales, 'GET', '/v1/contracts', 'client')).body.items.length, 1);
    const approveInput = {
      expectedVersion: contract.version,
      signerName: 'PostgreSQL QA',
      consent: true,
    };
    const approveKey = 'pg-approval-idempotent';
    const approved = await call(
      sales,
      'POST',
      `/v1/contracts/${contract.id}/approve`,
      'client',
      approveInput,
      approveKey,
    );
    assert.equal(approved.status, 200);
    assert.equal(
      (
        await call(
          sales,
          'POST',
          `/v1/contracts/${contract.id}/approve`,
          'client',
          approveInput,
          approveKey,
        )
      ).body.version,
      approved.body.version,
    );
    const salesRaw = new pg.Client({ connectionString: byName('sales').url });
    rawClients.add(salesRaw);
    await salesRaw.connect();
    const persisted = await salesRaw.query<{ event: EventEnvelope }>(
      "SELECT event FROM outbox WHERE event->>'type'='contract.approved.v1'",
    );
    assert.equal(persisted.rowCount, 1);
    const event = persisted.rows[0]!.event;
    assert.equal((event.payload as { totalMinor: number }).totalMinor, 9999);
    await assert.rejects(
      consumeEvent(byName('delivery').repository, 'pg-delivery', event, async (tx, value) => {
        await deliveryEvent(tx, value);
        throw new Error('Consumer fails before commit');
      }),
    );
    assert.equal((await call(delivery, 'GET', '/v1/projects', 'client')).body.items.length, 0);
    assert.equal(
      await consumeEvent(byName('delivery').repository, 'pg-delivery', event, deliveryEvent),
      'processed',
    );
    assert.equal(
      await consumeEvent(byName('delivery').repository, 'pg-delivery', event, deliveryEvent),
      'duplicate',
    );
    await consumeEvent(byName('billing').repository, 'pg-billing', event, billingEvent);
    assert.equal(
      await consumeEvent(byName('billing').repository, 'pg-billing', event, billingEvent),
      'duplicate',
    );
    const projects = (await call(delivery, 'GET', '/v1/projects', 'client')).body.items;
    const invoices = (await call(billing, 'GET', '/v1/invoices', 'client')).body.items;
    assert.equal(projects.length, 1);
    assert.equal(projects[0].status, 'planning');
    assert.equal(projects[0].progress, 0);
    assert.equal(invoices.length, 2);
    assert.equal(
      invoices.reduce((sum: number, item: Record<string, any>) => sum + item.amountMinor, 0),
      9999,
    );
    const first = invoices[0];
    const paymentInput = {
      expectedVersion: first.version,
      requestId: 'pg-receipt-unique',
      amountMinor: first.amountMinor,
      method: 'bank_transfer',
      reference: 'Verified PG bank receipt',
    };
    const payments = await Promise.all([
      call(billing, 'POST', `/v1/invoices/${first.id}/payments`, 'finance', paymentInput),
      call(billing, 'POST', `/v1/invoices/${first.id}/payments`, 'finance', paymentInput),
    ]);
    assert.deepEqual(payments.map((response) => response.status).sort(), [200, 409]);
    assert.equal(
      (await call(billing, 'GET', `/v1/invoices/${first.id}/payments`, 'finance')).body.items
        .length,
      1,
    );
    const leases = await byName('sales').repository.leaseOutbox();
    assert.ok(leases.length >= 3);
    const approvedLease = leases.find((row) => row.event.type === 'contract.approved.v1')!;
    await byName('sales').repository.markPublished(approvedLease.event.id, 'wrong-lease-token');
    assert.equal(
      (
        await salesRaw.query('SELECT published_at FROM outbox WHERE id=$1', [
          approvedLease.event.id,
        ])
      ).rows[0].published_at,
      null,
    );
    await byName('sales').repository.markPublished(
      approvedLease.event.id,
      approvedLease.leaseToken,
    );
    assert.ok(
      (
        await salesRaw.query('SELECT published_at FROM outbox WHERE id=$1', [
          approvedLease.event.id,
        ])
      ).rows[0].published_at,
    );
    await salesRaw.end();
    rawClients.delete(salesRaw);
    await verifyRepPostgres(t, {
      crm: byName('crm').repository,
      sales: byName('sales').repository,
      communications: byName('communications').repository,
      identity: byName('identity').repository,
    });
    t.diagnostic(
      'Verified: tenant RLS, transaction rollback, concurrent accept/payment guards, atomic approval/outbox, inbox rollback/retry, unique project, balanced invoices, and lease ownership.',
    );
  },
);

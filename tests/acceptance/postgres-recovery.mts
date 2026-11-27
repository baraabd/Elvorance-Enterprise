import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import pg from 'pg';
import { SignJWT } from 'jose';
import type { EventEnvelope } from '@elvorance/contracts';
import { PgRepository, authFromEnv, type Migration } from '@elvorance/service-kit';
import { createApp as crmApp } from '../../services/crm/src/app.ts';
import { createApp as gatewayApp } from '../../services/api-gateway/src/app.ts';
import type { Upstreams } from '../../services/api-gateway/src/domain/routes.ts';
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

// Destructive operations are restricted to newly-created, random CI fixture databases.
// No parameter accepts a staging/production database name or restoration destination.
const source = new URL(process.env.ELVORANCE_TEST_POSTGRES_URL ?? 'http://invalid');
const container = process.env.ELVORANCE_ACCEPTANCE_POSTGRES_CONTAINER ?? '';
assert.equal(process.env.CI, 'true', 'This rehearsal only runs in disposable CI');
assert.equal(process.env.ELVORANCE_DISPOSABLE_ACCEPTANCE, '1');
assert.equal(source.protocol, 'postgresql:');
assert.ok(['localhost', '127.0.0.1'].includes(source.hostname));
assert.equal(source.pathname, '/postgres');
assert.match(container, /^[a-f0-9]{64}$/);
const definitions: { name: string; tables: readonly string[]; migrations: Migration[] }[] = [
  { name: 'identity', tables: identityTables, migrations: identityMigrations },
  { name: 'crm', tables: crmTables, migrations: crmMigrations },
  { name: 'sales', tables: salesTables, migrations: salesMigrations },
  { name: 'delivery', tables: deliveryTables, migrations: deliveryMigrations },
  { name: 'billing', tables: billingTables, migrations: billingMigrations },
  { name: 'tracking', tables: trackingTables, migrations: trackingMigrations },
  { name: 'communications', tables: communicationsTables, migrations: communicationsMigrations },
];
const prefix = 'acc_' + randomBytes(6).toString('hex');
const administrator = new pg.Client({
  connectionString: source.href,
  connectionTimeoutMillis: 5000,
});
const allocated: {
  name: string;
  db: string;
  role: string;
  url: string;
  repository: PgRepository;
}[] = [];
const createdDatabases: string[] = [];
const createdRoles: string[] = [];
const databaseReports: Record<string, unknown>[] = [];
const loadReports: Record<string, unknown>[] = [];
let complete = false;
let cleanupComplete = false;
let crossDatabaseDenied = 0;
let failure: unknown;
await administrator.connect();
const serverVersion = (await administrator.query('SHOW server_version')).rows[0]
  .server_version as string;
assert.match(serverVersion, /^16\./, 'Use the reviewed PostgreSQL 16 image');
const identifier = (value: string) => {
  assert.match(value, new RegExp('^' + prefix + '_[a-z_]+$'));
  return value;
};
async function provision(definition: (typeof definitions)[number], suffix: 'source' | 'restored') {
  const name = identifier(prefix + '_' + definition.name + '_' + suffix);
  const password = randomBytes(24).toString('hex');
  await administrator.query(
    `CREATE ROLE ${name} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`,
  );
  createdRoles.push(name);
  await administrator.query(`CREATE DATABASE ${name} OWNER ${name}`);
  createdDatabases.push(name);
  await administrator.query(`REVOKE ALL ON DATABASE ${name} FROM PUBLIC`);
  const u = new URL(source);
  u.username = name;
  u.password = password;
  u.pathname = '/' + name;
  const result = {
    name: definition.name,
    db: name,
    role: name,
    url: u.href,
    repository: new PgRepository(definition.name, u.href, definition.tables, definition.migrations),
  };
  allocated.push(result);
  return result;
}
async function databaseSnapshot(db: string) {
  const u = new URL(source);
  u.pathname = '/' + identifier(db);
  const client = new pg.Client({ connectionString: u.href });
  await client.connect();
  try {
    const tableRows = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    );
    const snapshot: Record<string, unknown> = {};
    for (const { tablename } of tableRows.rows) {
      assert.match(tablename, /^[a-z_]+$/);
      snapshot[tablename] = (
        await client.query(
          `SELECT to_jsonb(t) AS row FROM ${tablename} t ORDER BY to_jsonb(t)::text`,
        )
      ).rows.map((row) => row.row);
    }
    return snapshot;
  } finally {
    await client.end();
  }
}
try {
  for (const definition of definitions) {
    const original = await provision(definition, 'source');
    await original.repository.migrate();
    const events: EventEnvelope[] = [];
    for (const tenant of ['tenant-a', 'tenant-b'])
      await original.repository.transaction(tenant, async (tx) => {
        for (const table of definition.tables)
          await tx.insert(table, {
            id: 'fixture-' + tenant,
            name: 'Synthetic ' + tenant,
            repId: 'rep-' + tenant,
            clientId: 'client-' + tenant,
            sequence: 1,
            status: 'fixture',
            marker: tenant,
          });
        const event = await tx.emit('acceptance.fixture.v1', 'fixture-' + tenant, 1, {
          synthetic: true,
        });
        events.push(event);
        assert.equal(await tx.claimInbox('acceptance', event), true);
        await tx.idempotent(
          'fixture-actor',
          'fixture-key',
          'acceptance.fixture',
          { synthetic: true },
          async () => ({ persisted: true }),
        );
      });
    const before = await databaseSnapshot(original.db);
    const backupStarted = performance.now();
    const dump = execFileSync(
      'docker',
      ['exec', container, 'pg_dump', '-U', 'postgres', '--format=custom', '--dbname', original.db],
      { maxBuffer: 32 * 1024 * 1024, timeout: 60000 },
    );
    const backupMilliseconds = performance.now() - backupStarted;
    const restored = await provision(definition, 'restored');
    const restoreStarted = performance.now();
    execFileSync(
      'docker',
      [
        'exec',
        '-i',
        container,
        'pg_restore',
        '-U',
        'postgres',
        '--no-owner',
        '--exit-on-error',
        '--dbname',
        restored.db,
      ],
      { input: dump, maxBuffer: 1024 * 1024, timeout: 60000 },
    );
    const restoreMilliseconds = performance.now() - restoreStarted;
    assert.deepEqual(
      await databaseSnapshot(restored.db),
      before,
      'Every public table must round-trip exactly',
    );
    const adminDestination = new URL(source);
    adminDestination.pathname = '/' + restored.db;
    const owner = new pg.Client({ connectionString: adminDestination.href });
    await owner.connect();
    try {
      for (const table of Object.keys(before)) {
        assert.match(table, /^[a-z_]+$/);
        await owner.query(`ALTER TABLE ${table} OWNER TO ${restored.role}`);
      }
    } finally {
      await owner.end();
    }
    await restored.repository.migrate();
    const raw = new pg.Client({ connectionString: restored.url });
    await raw.connect();
    try {
      for (const table of definition.tables) {
        assert.equal(
          (await raw.query(`SELECT * FROM ${table}`)).rowCount,
          0,
          'RLS must deny access without tenant context',
        );
        await raw.query("SELECT set_config('app.tenant_id','tenant-a',false)");
        assert.equal((await raw.query(`SELECT * FROM ${table}`)).rowCount, 1);
        assert.equal(
          (await raw.query(`SELECT * FROM ${table} WHERE tenant_id='tenant-b'`)).rowCount,
          0,
        );
        await raw.query("SELECT set_config('app.tenant_id','',false)");
      }
    } finally {
      await raw.end();
    }
    for (const event of events)
      await restored.repository.transaction(event.tenantId, async (tx) => {
        assert.equal(
          await tx.claimInbox('acceptance', event),
          false,
          'Restored inbox prevents replay',
        );
        assert.deepEqual(
          await tx.idempotent(
            'fixture-actor',
            'fixture-key',
            'acceptance.fixture',
            { synthetic: true },
            async () => {
              throw new Error('Restored command must not run twice');
            },
          ),
          { persisted: true },
        );
      });
    const leased = await restored.repository.leaseOutbox();
    assert.equal(leased.length, 2);
    for (const entry of leased)
      await restored.repository.markPublished(entry.event.id, entry.leaseToken);
    assert.equal((await restored.repository.leaseOutbox()).length, 0);
    databaseReports.push({
      service: definition.name,
      domainTables: definition.tables.length,
      totalTables: Object.keys(before).length,
      archiveBytes: dump.length,
      archiveSha256: createHash('sha256').update(dump).digest('hex'),
      backupMilliseconds,
      restoreMilliseconds,
      exactRows: true,
      rls: true,
      inboxReplayDenied: true,
      idempotencyPreserved: true,
      outboxResumed: true,
    });
  }
  const restored = allocated.filter((row) => row.db.endsWith('_restored'));
  for (const caller of restored)
    for (const target of restored.filter((row) => row !== caller)) {
      const u = new URL(caller.url);
      u.pathname = '/' + target.db;
      const client = new pg.Client({ connectionString: u.href, connectionTimeoutMillis: 3000 });
      try {
        await assert.rejects(
          client.connect(),
          (e: unknown) => typeof e === 'object' && e !== null && 'code' in e && e.code === '42501',
        );
        crossDatabaseDenied++;
      } finally {
        await client.end().catch(() => {});
      }
    }
  // Bounded HTTP load on real PostgreSQL through the real gateway and CRM handler.
  // Same-runner measurements are diagnostic only; no hosted capacity/SLO claim.
  const crm = requiredValue(
    allocated.find((row) => row.name === 'crm' && row.db.endsWith('_source')),
  );
  const secret = randomBytes(48).toString('hex');
  const auth = authFromEnv({
    AUTH_MODE: 'dev-hs256',
    NODE_ENV: 'test',
    DEV_JWT_SECRET: secret,
    OIDC_ISSUER: 'https://acceptance.invalid',
    OIDC_AUDIENCE: 'elvorance-api',
  });
  const token = await new SignJWT({
    sub: 'load-rep',
    tenant_id: 'load-tenant',
    roles: ['rep'],
    rep_id: 'load-rep',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('https://acceptance.invalid')
    .setAudience('elvorance-api')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret));
  const app = crmApp({ repository: crm.repository, auth });
  const url = await app.listen({ host: '127.0.0.1', port: 0 });
  const upstreams = Object.fromEntries(definitions.map((d) => [d.name, url])) as Upstreams;
  try {
    // Each concurrency stage measures a fresh gateway with the production budgets.
    // Sharing one limiter across 3 x 120 reads incorrectly exhausts its 300-request
    // principal window. Isolate stages instead of weakening limits or accepting 429s.
    for (const concurrency of [1, 4, 8]) {
      const gateway = gatewayApp({ auth, upstreams });
      try {
        const base = await gateway.listen({ host: '127.0.0.1', port: 0 });
        const headers = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };
        const created = await fetch(base + '/v1/crm/customers', {
          method: 'POST',
          headers: { ...headers, 'idempotency-key': 'load-fixture-create-' + concurrency },
          body: JSON.stringify({ name: 'Synthetic load customer ' + concurrency }),
        });
        assert.equal(created.status, 200);
        const customer = (await created.json()) as { id: string };
        const latencies: number[] = [];
        const errors: number[] = [];
        let next = 0;
        const start = performance.now();
        await Promise.all(
          Array.from({ length: concurrency }, async () => {
            while (next++ < 120) {
              const began = performance.now();
              const response = await fetch(base + '/v1/crm/customers/' + customer.id, {
                headers,
                signal: AbortSignal.timeout(15000),
              });
              const payload = (await response.json()) as { id?: string };
              latencies.push(performance.now() - began);
              if (response.status !== 200 || payload.id !== customer.id)
                errors.push(response.status);
            }
          }),
        );
        const elapsed = performance.now() - start;
        latencies.sort((a, b) => a - b);
        const percentile = (p: number) => latencies[Math.ceil(latencies.length * p) - 1];
        loadReports.push({
          scope: 'gateway-to-CRM HTTP + PostgreSQL, disposable same-runner CI',
          rateLimitScope: 'fresh gateway per concurrency stage; unchanged production defaults',
          concurrency,
          requests: latencies.length,
          failures: errors.length,
          elapsedMilliseconds: elapsed,
          requestsPerSecond: latencies.length / (elapsed / 1000),
          p50Milliseconds: percentile(0.5),
          p95Milliseconds: percentile(0.95),
          p99Milliseconds: percentile(0.99),
        });
        assert.equal(latencies.length, 120);
        assert.deepEqual(errors, []);
      } finally {
        await gateway.close();
      }
    }
  } finally {
    await app.close();
  }
  complete = true;
} catch (error) {
  failure = error;
} finally {
  try {
    for (const resource of allocated) await resource.repository.close();
    for (const name of createdDatabases)
      await administrator.query(`DROP DATABASE ${identifier(name)} WITH (FORCE)`);
    for (const name of createdRoles) await administrator.query(`DROP ROLE ${identifier(name)}`);
    cleanupComplete = true;
  } catch (error) {
    failure ??= error;
  } finally {
    await administrator.end();
  }
  const out = resolve(process.env.ELVORANCE_ACCEPTANCE_REPORT_DIR ?? 'dist/acceptance/evidence');
  await mkdir(out, { recursive: true });
  const report = {
    scope:
      'Disposable PostgreSQL 16 CI rehearsal; not hosted backup acceptance, PITR, coordinated cross-service restore, or production capacity',
    sourceSha: process.env.GITHUB_SHA ?? null,
    serverVersion,
    passed: complete && !failure,
    cleanupComplete,
    databaseReports,
    crossDatabaseDenied,
    loadReports,
  };
  await writeFile(
    resolve(out, 'postgres-recovery-load.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
}
if (failure) throw failure;

function requiredValue<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Required test fixture is missing');
  return value;
}

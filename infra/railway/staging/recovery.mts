import { Pool } from 'pg';
import { PgRepository } from '../../../packages/service-kit/src/pg-repository.ts';
import type { EventEnvelope, Principal } from '@elvorance/contracts';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import {
  assertStaging,
  domains,
  ensure,
  identifier,
  ownedName,
  privateDatabaseUrl,
  type Domain,
} from './target.mts';
function adminUrl(database?: string) {
  const url = privateDatabaseUrl(process.env.PGADMIN_URL ?? '');
  if (database) url.pathname = '/' + database;
  return url;
}
function ownerUrl(service: Domain, database = ownedName(service)) {
  const url = adminUrl(database);
  url.username = ownedName(service);
  url.password = process.env[service.toUpperCase() + '_DB_PASSWORD'] ?? '';
  ensure(/^[a-f0-9]{64}$/.test(url.password), 'Owned credential missing.');
  return url;
}
function pool(url: URL) {
  return new Pool({
    connectionString: url.href,
    max: 1,
    connectionTimeoutMillis: 10000,
    statement_timeout: 20000,
  });
}
async function command(program: string, args: string[], url: URL) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(program, args, {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        PGHOST: url.hostname,
        PGPORT: url.port,
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGDATABASE: url.pathname.slice(1),
        PGCONNECT_TIMEOUT: '10',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 120000,
    });
    // Drain errors but never print SQL, connection details or dumped customer data.
    child.stderr.on('data', () => {});
    child.on('error', () => reject(new Error(program + ' could not start.')));
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(program + ' failed with exit ' + code)),
    );
  });
}
async function snapshot(db: Pool) {
  const names = (
    await db.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows.map((r) => r.tablename);
  const tables: Array<{
    table: string;
    rows: number;
    sha256: string;
    rls: boolean;
    forced: boolean;
  }> = [];
  for (const table of names) {
    const data = await db.query<{ value: string }>(
      `SELECT row_to_json(t)::text AS value FROM public.${identifier(table)} t ORDER BY row_to_json(t)::text`,
    );
    const flags = (
      await db.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        'SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',
        ['public.' + table],
      )
    ).rows[0]!;
    tables.push({
      table,
      rows: data.rowCount ?? 0,
      sha256: createHash('sha256')
        .update(JSON.stringify(data.rows.map((r) => r.value)))
        .digest('hex'),
      rls: flags.relrowsecurity,
      forced: flags.relforcerowsecurity,
    });
  }
  return tables;
}
export interface RecoveryReplay {
  key: string;
  principal: Principal;
  body: unknown;
  customerId: string;
}
export async function recovery(tenantId: string, replay: RecoveryReplay) {
  assertStaging();
  ensure(/^stg-accept-[a-f0-9-]+$/.test(tenantId), 'Unexpected fixture tenant.');
  const root = pool(adminUrl());
  const directory = await mkdtemp(join(tmpdir(), 'elvorance-hosted-restore-'));
  const suffix = randomBytes(6).toString('hex');
  const created: Array<{ service: Domain; database: string }> = [];
  const results: Record<string, unknown>[] = [];
  let denied = 0;
  let duplicateInboxRejected = 0;
  let cachedCommandReplayed = false;
  let outboxLeaseRecovered = false;
  const started = performance.now();
  let cleanupSucceeded = false;
  try {
    const version = (await root.query<{ server_version: string }>('SHOW server_version')).rows[0]!
      .server_version;
    ensure(version.startsWith('18.'), 'Hosted recovery requires the actual PostgreSQL 18 target.');
    for (const service of domains) {
      const original = ownedName(service),
        restored = `elvorance_restore_${suffix}_${service}`;
      const source = pool(adminUrl(original));
      const file = join(directory, service + '.dump');
      try {
        await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        ensure(
          Number(
            (await source.query('SELECT count(*) AS count FROM outbox WHERE published_at IS NULL'))
              .rows[0].count,
          ) === 0,
          'Outbox must be drained before consistent rehearsal snapshot.',
        );
        const before = await snapshot(source);
        const snapshotId = (
          await source.query<{ snapshot: string }>('SELECT pg_export_snapshot() AS snapshot')
        ).rows[0]!.snapshot;
        const dumpStarted = performance.now();
        await command(
          'pg_dump',
          ['--format=custom', '--snapshot', snapshotId, '--file', file],
          adminUrl(original),
        );
        await source.query('COMMIT');
        const backupMs = performance.now() - dumpStarted;
        await root.query(
          `CREATE DATABASE ${identifier(restored)} OWNER ${identifier(ownedName(service))}`,
        );
        created.push({ service, database: restored });
        await root.query(`REVOKE ALL ON DATABASE ${identifier(restored)} FROM PUBLIC`);
        const restoreStarted = performance.now();
        await command(
          'pg_restore',
          ['--exit-on-error', '--no-privileges', file],
          adminUrl(restored),
        );
        const restoreMs = performance.now() - restoreStarted;
        const target = pool(adminUrl(restored));
        const owner = pool(ownerUrl(service, restored));
        try {
          const after = await snapshot(target);
          ensure(
            JSON.stringify(before) === JSON.stringify(after),
            'Snapshot comparison failed for ' + service + '.',
          );
          for (const table of after.filter((t) => t.rls)) {
            ensure(table.forced, 'Restored tenant table does not force RLS.');
            ensure(
              Number(
                (await owner.query(`SELECT count(*) AS count FROM ${identifier(table.table)}`))
                  .rows[0].count,
              ) === 0,
              'Restored owner can read without tenant context.',
            );
          }
          await owner.query('BEGIN');
          await owner.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
          let tenantRows = 0;
          for (const table of after.filter((t) => t.rls))
            tenantRows += Number(
              (await owner.query(`SELECT count(*) AS count FROM ${identifier(table.table)}`))
                .rows[0].count,
            );
          await owner.query('ROLLBACK');
          const hash = createHash('sha256')
            .update(await readFile(file))
            .digest('hex');
          results.push({
            service,
            backupMs: Math.round(backupMs),
            restoreMs: Math.round(restoreMs),
            dumpSha256: hash,
            tables: after,
            tenantRowsReadable: tenantRows,
            exactRowsMatched: true,
            forcedRlsPreserved: true,
          });
        } finally {
          await target.end();
          await owner.end();
        }
      } finally {
        await source.query('ROLLBACK').catch(() => undefined);
        await source.end();
      }
    }
    // Exercise storage recovery only inside this run's restored copies, never against live queues.
    const events = new Map<string, EventEnvelope>();
    for (const item of created) {
      const db = pool(adminUrl(item.database));
      try {
        for (const row of (
          await db.query<{ event: EventEnvelope }>('SELECT event FROM outbox WHERE tenant_id=$1', [
            tenantId,
          ])
        ).rows)
          events.set(row.event.id, row.event);
      } finally {
        await db.end();
      }
    }
    for (const item of created) {
      const db = pool(adminUrl(item.database));
      const repo = new PgRepository(
        item.service,
        ownerUrl(item.service, item.database).href,
        [],
        [],
      );
      try {
        const inbox = (
          await db.query<{ consumer: string; event_id: string }>(
            'SELECT consumer,event_id FROM inbox WHERE tenant_id=$1',
            [tenantId],
          )
        ).rows;
        for (const row of inbox) {
          const event = events.get(row.event_id);
          ensure(event, 'Restored inbox has no matching producer event.');
          ensure(
            !(await repo.transaction(tenantId, (tx) => tx.claimInbox(row.consumer, event))),
            'Restored inbox accepted a duplicate event.',
          );
          duplicateInboxRejected++;
        }
        if (item.service === 'crm') {
          const principal = { ...replay.principal, roles: [...replay.principal.roles].sort() };
          const cached = await repo.transaction(tenantId, (tx) =>
            tx.idempotent<{ id: string }>(
              principal.sub,
              replay.key,
              'crm.createCustomer',
              { principal, params: {}, body: replay.body },
              async () => {
                throw new Error('Restored completed command was unexpectedly re-executed.');
              },
            ),
          );
          ensure(cached.id === replay.customerId, 'Restored command result did not match.');
          cachedCommandReplayed = true;
        }
        if (item.service === 'sales') {
          const event = (
            await db.query<{ id: string }>(
              'SELECT id FROM outbox WHERE tenant_id=$1 ORDER BY created_at LIMIT 1',
              [tenantId],
            )
          ).rows[0];
          ensure(event, 'Missing source event for restore lease rehearsal.');
          // Model an uncertain publication after restore; do not send this event to the live broker.
          await db.query(
            'UPDATE outbox SET published_at=NULL,lease_token=NULL,leased_until=NULL,next_attempt_at=now() WHERE id=$1',
            [event.id],
          );
          const leased = (await repo.leaseOutbox(100)).find((row) => row.event.id === event.id);
          ensure(leased, 'Restored pending outbox event could not be leased.');
          await repo.markPublished(event.id, 'wrong-lease');
          ensure(
            !(await db.query('SELECT published_at FROM outbox WHERE id=$1', [event.id])).rows[0]
              .published_at,
            'Wrong lease published a restored event.',
          );
          await repo.markPublished(event.id, leased.leaseToken);
          ensure(
            (await db.query('SELECT published_at FROM outbox WHERE id=$1', [event.id])).rows[0]
              .published_at,
            'Valid restore lease failed.',
          );
          outboxLeaseRecovered = true;
        }
      } finally {
        await repo.close();
        await db.end();
      }
    }
    ensure(
      duplicateInboxRejected > 0 && cachedCommandReplayed && outboxLeaseRecovered,
      'Storage recovery controls incomplete.',
    );
    for (const actor of domains)
      for (const item of created) {
        if (item.service === actor) continue;
        const foreign = pool(ownerUrl(actor, item.database));
        let blocked = false;
        try {
          await foreign.query('SELECT 1');
        } catch (error) {
          blocked =
            !!error && typeof error === 'object' && 'code' in error && error.code === '42501';
        } finally {
          await foreign.end();
        }
        ensure(blocked, 'Restored cross-service database connection was not denied.');
        denied++;
      }
    return {
      scope:
        'Actual hosted PostgreSQL 18 logical backups restored into separate random databases in the same cluster',
      version,
      results,
      crossServiceConnectionsDenied: denied,
      duplicateInboxRejected,
      cachedCommandReplayed,
      outboxLeaseRecovered,
      replayScope:
        'Actual repository methods against restored copies only; no event republished into the live broker',
      elapsedMs: Math.round(performance.now() - started),
      passed: true,
      limitations: [
        'Not cross-region disaster recovery',
        'No PITR or coordinated broker snapshot',
        'Snapshots are temporary rehearsal files, not the retained backup policy',
      ],
    };
  } finally {
    const failures: string[] = [];
    for (const item of [...created].reverse()) {
      try {
        ensure(
          item.database.startsWith('elvorance_restore_' + suffix + '_'),
          'Refusing unexpected drop target.',
        );
        await root.query(`DROP DATABASE ${identifier(item.database)} WITH (FORCE)`);
      } catch {
        failures.push(item.database);
      }
    }
    await root.end();
    await rm(directory, { recursive: true, force: true });
    cleanupSucceeded = failures.length === 0;
    console.log(
      'ELVORANCE_RECOVERY_CLEANUP ' +
        JSON.stringify({ temporaryDatabases: created.length, cleanupSucceeded }),
    );
    ensure(cleanupSucceeded, 'Temporary restore database cleanup failed.');
  }
}

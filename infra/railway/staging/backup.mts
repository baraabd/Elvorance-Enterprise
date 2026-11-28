import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { adminUrl, ownerUrl, pool, command, snapshot } from './recovery.mts';
import { backupKey, encryptBackup, decryptBackup } from './backup-crypto.mts';
import { BackupStore, backupObjectKey } from './backup-store.mts';
import {
  assertStaging,
  domains,
  ensure,
  identifier,
  ownedName,
  requiredValue,
  sourceRevision,
  type Domain,
} from './target.mts';

export function backupDatabases(
  root: URL,
): Array<{ service: Domain | 'keycloak'; database: string }> {
  ensure(
    root.hostname === 'postgres.railway.internal' &&
      root.port === '5432' &&
      root.pathname === '/railway',
    'Unapproved backup database cluster.',
  );
  return [
    ...domains.map((service) => ({ service, database: ownedName(service) })),
    { service: 'keycloak', database: 'railway' },
  ];
}
/** Retain encrypted logical backups, fetch them back, then restore only into unique scratch databases. */
export async function runRetainedBackup() {
  assertStaging();
  ensure(
    process.env.STAGING_OPERATION === 'backup-restore',
    'Explicit backup-restore operation required.',
  );
  const source = sourceRevision();
  const rootUrl = adminUrl();
  const databases = backupDatabases(rootUrl);
  const key = backupKey(process.env.BACKUP_ENCRYPTION_KEY ?? '');
  const store = new BackupStore();
  const directory = await mkdtemp(join(tmpdir(), 'elvorance-retained-backup-'));
  const run = randomBytes(6).toString('hex');
  const root = pool(rootUrl);
  const created: string[] = [];
  const results: Record<string, unknown>[] = [];
  const startedAt = new Date().toISOString();
  const started = performance.now();
  let phase = 'preflight';
  let cleanupSucceeded = false;
  try {
    const server = requiredValue(
      (await root.query<{ server_version: string }>('SHOW server_version')).rows[0],
      'Missing server version.',
    ).server_version;
    ensure(
      server.startsWith('18.'),
      'Retained backups require the reviewed PostgreSQL 18 cluster.',
    );
    for (const item of databases) {
      phase = `${item.service}-snapshot`;
      const db = pool(adminUrl(item.database));
      const dump = join(directory, item.service + '.dump');
      const encrypted = join(directory, item.service + '.enc');
      const downloaded = join(directory, item.service + '.downloaded');
      const verifiedDump = join(directory, item.service + '.verified.dump');
      const object = backupObjectKey(source, run, item.service + '.enc');
      const context = JSON.stringify({ version: 1, source, run, database: item.database, object });
      let before: Awaited<ReturnType<typeof snapshot>>;
      let pending: number | null = null;
      try {
        await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        if (item.service === 'keycloak') {
          ensure(
            (
              await db.query(
                "SELECT to_regclass('public.realm') AS realm, to_regclass('public.user_entity') AS users",
              )
            ).rows.every((row) => row.realm && row.users),
            'Keycloak database identity is not verified.',
          );
        } else {
          pending = Number(
            requiredValue(
              (
                await db.query<{ count: string }>(
                  'SELECT count(*)::text AS count FROM outbox WHERE published_at IS NULL',
                )
              ).rows[0],
              'Missing outbox count.',
            ).count,
          );
        }
        before = await snapshot(db);
        ensure(before.length > 0, 'Refusing an empty backup schema.');
        const snapshotId = requiredValue(
          (await db.query<{ snapshot: string }>('SELECT pg_export_snapshot() AS snapshot')).rows[0],
          'Missing exported snapshot.',
        ).snapshot;
        await command(
          'pg_dump',
          ['--format=custom', '--snapshot', snapshotId, '--file', dump],
          adminUrl(item.database),
        );
        await db.query('COMMIT');
      } finally {
        await db.query('ROLLBACK').catch(() => undefined);
        await db.end();
      }
      phase = `${item.service}-encrypt-retain`;
      const encryption = await encryptBackup(dump, encrypted, key, context);
      const uploaded = await store.put(object, encrypted);
      phase = `${item.service}-retrieve-authenticate`;
      await store.getVerified(object, downloaded, uploaded);
      const plain = await decryptBackup(downloaded, verifiedDump, key, context);
      ensure(
        plain.bytes === encryption.plain.bytes && plain.sha256 === encryption.plain.sha256,
        'Retained plaintext identity mismatch.',
      );
      phase = `${item.service}-isolated-restore`;
      const restored = `elvorance_restore_${run}_${item.service}`;
      const owner =
        item.service === 'keycloak'
          ? decodeURIComponent(rootUrl.username)
          : ownedName(item.service);
      await root.query(
        `CREATE DATABASE ${identifier(restored)} OWNER ${identifier(owner)} TEMPLATE template0`,
      );
      created.push(restored);
      await root.query(`REVOKE ALL ON DATABASE ${identifier(restored)} FROM PUBLIC`);
      const restoreStarted = performance.now();
      await command(
        'pg_restore',
        ['--exit-on-error', '--no-privileges', verifiedDump],
        adminUrl(restored),
      );
      const target = pool(adminUrl(restored));
      let rlsChecks = 0;
      try {
        const after = await snapshot(target);
        ensure(
          JSON.stringify(before) === JSON.stringify(after),
          'Restored rows or row-security metadata did not match.',
        );
        if (item.service !== 'keycloak') {
          const owned = pool(ownerUrl(item.service, restored));
          try {
            for (const table of after.filter((table) => table.rls)) {
              ensure(table.forced, 'Restored tenant table does not enforce RLS.');
              const count = requiredValue(
                (
                  await owned.query<{ count: string }>(
                    `SELECT count(*)::text AS count FROM ${identifier(table.table)}`,
                  )
                ).rows[0],
                'Missing RLS result.',
              ).count;
              ensure(count === '0', 'Restored owner read tenant data without context.');
              rlsChecks++;
            }
          } finally {
            await owned.end();
          }
        }
      } finally {
        await target.end();
      }
      const result = {
        service: item.service,
        database: item.database,
        object,
        context,
        plaintext: encryption.plain,
        encrypted: uploaded,
        tables: before,
        pendingOutboxPreserved: pending,
        downloadedFromRetainedStorage: true,
        authenticatedDecryption: true,
        exactRowsAndRlsMatched: true,
        noContextRlsChecks: rlsChecks,
        restoreMs: Math.round(performance.now() - restoreStarted),
      };
      results.push(result);
      // A sanitized phase receipt survives interruption; no data, credentials or plaintext backup bytes.
      console.log(
        'ELVORANCE_BACKUP_DATABASE ' +
          JSON.stringify({
            service: item.service,
            object,
            encryptedSha256: uploaded.sha256,
            exactRowsAndRlsMatched: true,
          }),
      );
      for (const file of [dump, encrypted, downloaded, verifiedDump])
        await rm(file, { force: true });
    }
    phase = 'retained-manifest';
    const manifest = {
      schemaVersion: 1,
      source,
      run,
      startedAt,
      results,
      limitations: [
        'Sequential per-database snapshots, not a distributed atomic snapshot',
        'No RabbitMQ snapshot, PITR, cross-region recovery or recurring retention policy claimed',
        'Existing database roles and protected encryption key are prerequisites for disaster recovery',
      ],
    };
    const manifestPath = join(directory, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
    const manifestObject = backupObjectKey(source, run, 'manifest.enc');
    const manifestContext = JSON.stringify({ version: 1, source, run, object: manifestObject });
    const encryptedManifest = join(directory, 'manifest.enc');
    const envelope = await encryptBackup(manifestPath, encryptedManifest, key, manifestContext);
    await store.put(manifestObject, encryptedManifest);
    const downloadedManifest = join(directory, 'manifest.downloaded');
    await store.getVerified(manifestObject, downloadedManifest, envelope.encrypted);
    const manifestVerified = await decryptBackup(
      downloadedManifest,
      join(directory, 'manifest.verified'),
      key,
      manifestContext,
    );
    ensure(manifestVerified.sha256 === envelope.plain.sha256, 'Retained manifest mismatch.');
    return {
      ...manifest,
      manifestObject,
      manifestContext,
      manifestEncryptedSha256: envelope.encrypted.sha256,
      retainedBackupAndRestorePassed: true,
      elapsedMs: Math.round(performance.now() - started),
      releaseApproval: false,
    };
  } catch {
    // Driver errors may contain SQL or credentials. Preserve only the fixed phase identifier.
    throw new Error('Retained backup verification failed at phase ' + phase + '.');
  } finally {
    const failures: string[] = [];
    for (const database of [...created].reverse()) {
      try {
        ensure(
          new RegExp(
            `^elvorance_restore_${run}_(identity|crm|sales|delivery|billing|tracking|communications|keycloak)$`,
          ).test(database),
          'Foreign restore cleanup target.',
        );
        await root.query(`DROP DATABASE ${identifier(database)}`);
      } catch {
        failures.push(database);
      }
    }
    await root.end();
    store.close();
    key.fill(0);
    await rm(directory, { recursive: true, force: true });
    cleanupSucceeded = failures.length === 0;
    console.log(
      'ELVORANCE_BACKUP_CLEANUP ' +
        JSON.stringify({ createdScratchDatabases: created.length, cleanupSucceeded, failures }),
    );
    ensure(cleanupSucceeded, 'Retained backup scratch database cleanup failed.');
  }
}

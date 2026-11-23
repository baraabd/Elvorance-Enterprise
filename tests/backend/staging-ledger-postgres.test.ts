import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { PgRepository } from '../../packages/service-kit/src/pg-repository.ts';
import {
  migrationChecksum,
  migrationManifest,
} from '../../packages/service-kit/src/migration-ledger.ts';
const adminUrl = process.env.ELVORANCE_TEST_POSTGRES_URL;
test(
  'real PostgreSQL migration ledger preserves source and rejects mutation, legacy ambiguity and downgrade',
  { skip: !adminUrl, timeout: 30000 },
  async (t) => {
    const parsed = new URL(adminUrl!);
    assert(
      ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname),
      'Only disposable loopback PostgreSQL is permitted',
    );
    const root = new pg.Client({ connectionString: parsed.href });
    await root.connect();
    const database = 'elvorance_s02_ledger_' + randomBytes(6).toString('hex');
    await root.query(`CREATE DATABASE ${database}`);
    parsed.pathname = '/' + database;
    const raw = new pg.Client({ connectionString: parsed.href });
    await raw.connect();
    const migration = {
      version: 1,
      name: 's02-test',
      sql: 'CREATE TABLE ledger_probe (id integer PRIMARY KEY);',
    };
    const repo = new PgRepository('s02', parsed.href, [], [migration]);
    t.after(async () => {
      await repo.close();
      await raw.end();
      await root.query(`DROP DATABASE ${database} WITH (FORCE)`);
      await root.end();
    });
    await repo.migrate();
    await repo.migrate();
    assert.equal(
      (await raw.query('SELECT checksum FROM schema_migrations')).rows[0].checksum,
      migrationChecksum(migration),
    );
    const edited = new PgRepository(
      's02',
      parsed.href,
      [],
      [{ ...migration, sql: 'DROP TABLE ledger_probe;' }],
    );
    try {
      await assert.rejects(() => edited.migrate(), /checksum changed/);
    } finally {
      await edited.close();
    }
    assert.equal(
      (await raw.query("SELECT to_regclass('ledger_probe') AS name")).rows[0].name,
      'ledger_probe',
    );
    await raw.query('UPDATE schema_migrations SET checksum=NULL');
    await assert.rejects(() => repo.migrate(), /explicit reviewed manifest/);
    const priorManifest = process.env.MIGRATION_BASELINE_MANIFEST_SHA256,
      priorSource = process.env.MIGRATION_BASELINE_SOURCE_REVISION;
    try {
      process.env.MIGRATION_BASELINE_MANIFEST_SHA256 = migrationManifest([migration]);
      process.env.MIGRATION_BASELINE_SOURCE_REVISION = 'a'.repeat(40);
      await repo.migrate();
      assert.equal(
        (await raw.query('SELECT baseline_source_revision FROM schema_migrations')).rows[0]
          .baseline_source_revision,
        'a'.repeat(40),
      );
    } finally {
      if (priorManifest === undefined) delete process.env.MIGRATION_BASELINE_MANIFEST_SHA256;
      else process.env.MIGRATION_BASELINE_MANIFEST_SHA256 = priorManifest;
      if (priorSource === undefined) delete process.env.MIGRATION_BASELINE_SOURCE_REVISION;
      else process.env.MIGRATION_BASELINE_SOURCE_REVISION = priorSource;
    }
    await raw.query(
      "INSERT INTO schema_migrations(version,name,checksum) VALUES (999,'future',$1)",
      ['b'.repeat(64)],
    );
    await assert.rejects(() => repo.migrate(), /downgrade refused/);
  },
);

import pg from 'pg';
import type { Entity, EventEnvelope } from '@atlas/contracts';
import { AppError, assert } from './errors.ts';
import type { Migration } from './migrations.ts';
import {
  envelope,
  fingerprint,
  newId,
  type Filter,
  type OutboxRow,
  type Repository,
  type Transaction,
} from './repository.ts';
const { Pool } = pg;
type Row = {
  id: string;
  tenant_id: string;
  version: number;
  data: object;
  created_at: Date;
  updated_at: Date;
};
const hydrate = <T extends Entity>(row: Row): T =>
  ({
    ...row.data,
    id: row.id,
    tenantId: row.tenant_id,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }) as T;
function payload(input: object): object {
  const {
    id: _id,
    tenantId: _tenant,
    version: _version,
    createdAt: _created,
    updatedAt: _updated,
    ...data
  } = input as Entity;
  return data;
}
export class PgRepository implements Repository {
  private readonly pool: pg.Pool;
  constructor(
    public readonly serviceName: string,
    connectionString: string,
    private readonly tables: readonly string[],
    private readonly migrations: readonly Migration[],
  ) {
    assert(Boolean(connectionString), 'CONFIGURATION', 'DATABASE_URL is required', 500);
    for (const table of tables)
      assert(/^[a-z][a-z0-9_]*$/.test(table), 'CONFIGURATION', 'Invalid owned table name', 500);
    this.pool = new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15_000,
      application_name: `atlas-${serviceName}`,
    });
  }
  async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('atlas_schema_migrations'))");
      await client.query(
        'CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
      );
      for (const migration of [...this.migrations].sort((a, b) => a.version - b.version)) {
        const exists = await client.query(
          'SELECT version FROM schema_migrations WHERE version=$1',
          [migration.version],
        );
        if (!exists.rowCount) {
          await client.query(migration.sql);
          await client.query('INSERT INTO schema_migrations (version,name) VALUES ($1,$2)', [
            migration.version,
            migration.name,
          ]);
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async transaction<T>(tenantId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
    assert(Boolean(tenantId), 'TENANT_REQUIRED', 'A verified tenant is required', 401);
    const client = await this.pool.connect();
    const tableName = (table: string): string => {
      assert(
        this.tables.includes(table),
        'INVALID_TABLE',
        'Table is not owned by this service',
        500,
      );
      return table;
    };
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      // This service serializes its own tenant commands. Cross-service coordination uses events, never shared locks/tables.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `${this.serviceName}:${tenantId}`,
      ]);
      const tx: Transaction = {
        tenantId,
        async get<T extends Entity>(table: string, id: string) {
          const result = await client.query<Row>(
            `SELECT * FROM ${tableName(table)} WHERE tenant_id=$1 AND id=$2`,
            [tenantId, id],
          );
          return result.rows[0] ? hydrate<T>(result.rows[0]) : undefined;
        },
        async list<T extends Entity>(table: string, filter: Filter = {}) {
          const result = await client.query<Row>(
            `SELECT * FROM ${tableName(table)} WHERE tenant_id=$1 AND data @> $2::jsonb ORDER BY created_at,id LIMIT 1000`,
            [tenantId, JSON.stringify(filter)],
          );
          return result.rows.map((row) => hydrate<T>(row));
        },
        async insert<T extends Entity>(table: string, input: object) {
          const raw = input as { id?: string };
          const result = await client.query<Row>(
            `INSERT INTO ${tableName(table)} (tenant_id,id,version,data) VALUES ($1,$2,1,$3::jsonb) RETURNING *`,
            [tenantId, raw.id ?? newId(), JSON.stringify(payload(input))],
          );
          return hydrate<T>(result.rows[0]!);
        },
        async replace<T extends Entity>(table: string, value: T, expectedVersion: number) {
          const result = await client.query<Row>(
            `UPDATE ${tableName(table)} SET version=version+1,data=$4::jsonb,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND version=$3 RETURNING *`,
            [tenantId, value.id, expectedVersion, JSON.stringify(payload(value))],
          );
          assert(
            result.rows[0],
            'VERSION_CONFLICT',
            'The resource changed; reload its current version',
            409,
          );
          return hydrate<T>(result.rows[0]);
        },
        emit: async (type, aggregateId, aggregateVersion, data, correlationId) => {
          const event = envelope(
            this.serviceName,
            tenantId,
            type,
            aggregateId,
            aggregateVersion,
            data,
            correlationId,
          );
          await client.query('INSERT INTO outbox (id,tenant_id,event) VALUES ($1,$2,$3::jsonb)', [
            event.id,
            tenantId,
            JSON.stringify(event),
          ]);
          return event;
        },
        async claimInbox(consumer, event) {
          assert(event.tenantId === tenantId, 'EVENT_TENANT_MISMATCH', 'Event tenant mismatch');
          const result = await client.query(
            'INSERT INTO inbox (tenant_id,consumer,event_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id',
            [tenantId, consumer, event.id],
          );
          return Boolean(result.rowCount);
        },
        async idempotent<T>(
          actorId: string,
          key: string,
          operation: string,
          input: unknown,
          action: () => Promise<T>,
        ) {
          const hash = fingerprint({ operation, input });
          await client.query(
            'INSERT INTO idempotency_keys (tenant_id,actor_id,command_key,request_hash) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
            [tenantId, actorId, key, hash],
          );
          const result = await client.query<{
            request_hash: string;
            result: T;
            completed: boolean;
          }>(
            'SELECT request_hash,result,completed FROM idempotency_keys WHERE tenant_id=$1 AND actor_id=$2 AND command_key=$3 FOR UPDATE',
            [tenantId, actorId, key],
          );
          const existing = result.rows[0]!;
          assert(
            existing.request_hash === hash,
            'IDEMPOTENCY_CONFLICT',
            'Idempotency-Key was already used for a different request',
            409,
          );
          if (existing.completed) return existing.result;
          const output = await action();
          await client.query(
            'UPDATE idempotency_keys SET result=$4::jsonb,completed=true WHERE tenant_id=$1 AND actor_id=$2 AND command_key=$3',
            [tenantId, actorId, key, JSON.stringify(output)],
          );
          return output;
        },
      };
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      if (typeof error === 'object' && error && 'code' in error && error.code === '23505')
        throw new AppError(
          409,
          'DUPLICATE_RESOURCE',
          'A resource for this business key already exists',
        );
      throw error;
    } finally {
      client.release();
    }
  }
  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
  async leaseOutbox(limit = 100): Promise<OutboxRow[]> {
    const token = newId();
    const result = await this.pool.query<{
      event: EventEnvelope;
      attempts: number;
      lease_token: string;
    }>(
      `WITH ready AS (
      SELECT id FROM outbox WHERE published_at IS NULL AND next_attempt_at<=now() AND (leased_until IS NULL OR leased_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $1
    ) UPDATE outbox o SET lease_token=$2,leased_until=now()+interval '30 seconds',attempts=attempts+1 FROM ready WHERE o.id=ready.id RETURNING o.event,o.attempts,o.lease_token`,
      [limit, token],
    );
    return result.rows.map((row) => ({
      event: row.event,
      attempts: row.attempts,
      leaseToken: row.lease_token,
    }));
  }
  async markPublished(id: string, leaseToken: string): Promise<void> {
    await this.pool.query(
      'UPDATE outbox SET published_at=now(),lease_token=NULL,leased_until=NULL,last_error=NULL WHERE id=$1 AND lease_token=$2',
      [id, leaseToken],
    );
  }
  async releaseOutbox(id: string, leaseToken: string, reason: string): Promise<void> {
    await this.pool.query(
      "UPDATE outbox SET lease_token=NULL,leased_until=NULL,last_error=$3,next_attempt_at=now()+interval '5 seconds' WHERE id=$1 AND lease_token=$2",
      [id, leaseToken, reason.slice(0, 300)],
    );
  }
}

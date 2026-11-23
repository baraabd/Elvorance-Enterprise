/** Table ownership is supplied by each service; this module contains storage mechanics only. */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}
/** Add domain-owned tables without replaying the original outbox/inbox migration. */
export function addOwnedTablesMigration(
  version: number,
  name: string,
  tables: readonly string[],
  extraSql = '',
): Migration {
  if (!Number.isSafeInteger(version) || version < 2)
    throw new Error('Additional migrations need a version above 1');
  for (const table of tables)
    if (!/^[a-z][a-z0-9_]*$/.test(table)) throw new Error('Unsafe table name');
  return {
    version,
    name,
    sql:
      tables
        .map(
          (table) => `
    CREATE TABLE ${table} (
      tenant_id text NOT NULL, id text NOT NULL,
      version integer NOT NULL CHECK (version > 0),
      data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (tenant_id, id)
    );
    ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON ${table}
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
  `,
        )
        .join('\n') + extraSql,
  };
}
export function storageMigration(tables: readonly string[], extraSql = ''): Migration {
  for (const table of tables)
    if (!/^[a-z][a-z0-9_]*$/.test(table)) throw new Error('Unsafe table name');
  return {
    version: 1,
    name: 'initial_owned_storage',
    sql: `${tables
      .map(
        (table) => `
      CREATE TABLE IF NOT EXISTS ${table} (
        tenant_id text NOT NULL,
        id text NOT NULL,
        version integer NOT NULL CHECK (version > 0),
        data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, id)
      );
      ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON ${table}
        USING (tenant_id = current_setting('app.tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
    `,
      )
      .join('\n')}
    CREATE TABLE IF NOT EXISTS outbox (
      id text PRIMARY KEY, tenant_id text NOT NULL, event jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz,
      lease_token text, leased_until timestamptz, attempts integer NOT NULL DEFAULT 0,
      next_attempt_at timestamptz NOT NULL DEFAULT now(), last_error text
    );
    CREATE INDEX outbox_pending ON outbox (next_attempt_at, created_at) WHERE published_at IS NULL;
    CREATE TABLE IF NOT EXISTS inbox (
      tenant_id text NOT NULL, consumer text NOT NULL, event_id text NOT NULL,
      received_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id, consumer, event_id)
    );
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      tenant_id text NOT NULL, actor_id text NOT NULL, command_key text NOT NULL,
      request_hash text NOT NULL, result jsonb, completed boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id, actor_id, command_key)
    );
    ${extraSql}`,
  };
}

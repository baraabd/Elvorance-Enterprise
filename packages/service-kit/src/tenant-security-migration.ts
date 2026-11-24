import type { Migration } from './migrations.ts';

/** Append-only migration: do not change checksummed initial migrations. */
export function tenantSecurityMigration(version: number): Migration {
  if (!Number.isSafeInteger(version) || version < 2)
    throw new Error('Invalid security migration version');
  return {
    version,
    name: 'force_tenant_security_on_command_metadata',
    sql: ['inbox', 'idempotency_keys']
      .map(
        (table) => `
      ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON ${table}
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));
    `,
      )
      .join('\n'),
  };
}

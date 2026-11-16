import { storageMigration, type Migration } from '@atlas/service-kit';
// Do not edit the existing migration's definition: deployed databases already record its checksum.
export const tables = ['customers', 'regions', 'configuration'] as const;
const initial = storageMigration(['customers','regions'], '');
const configuration: Migration = {
  version: 2,
  name: 'tenant_configuration',
  sql: `
    CREATE TABLE IF NOT EXISTS configuration (
      tenant_id text NOT NULL,
      id text NOT NULL,
      version integer NOT NULL CHECK (version > 0),
      data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (tenant_id, id)
    );
    CREATE UNIQUE INDEX configuration_one_per_tenant ON configuration (tenant_id);
    ALTER TABLE configuration ENABLE ROW LEVEL SECURITY;
    ALTER TABLE configuration FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON configuration
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
  `,
};
export const migrations = [initial, configuration];

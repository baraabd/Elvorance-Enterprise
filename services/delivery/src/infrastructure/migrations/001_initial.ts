import { tenantSecurityMigration } from '@elvorance/service-kit';
import { storageMigration } from '@elvorance/service-kit';
export const tables = ['projects'] as const;
export const migrations = [
  storageMigration(
    tables,
    "CREATE UNIQUE INDEX one_project_per_contract ON projects (tenant_id, (data->>'contractId'));",
  ),
  tenantSecurityMigration(2),
];

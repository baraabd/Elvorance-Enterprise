import { storageMigration } from '@atlas/service-kit';
export const tables = ['projects'] as const;
export const migrations = [
  storageMigration(
    tables,
    "CREATE UNIQUE INDEX one_project_per_contract ON projects (tenant_id, (data->>'contractId'));",
  ),
];

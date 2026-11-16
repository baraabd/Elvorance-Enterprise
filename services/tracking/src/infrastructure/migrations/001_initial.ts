import { storageMigration } from '@atlas/service-kit';
export const tables = ['tracking_sessions'] as const;
export const migrations = [
  storageMigration(
    tables,
    "CREATE UNIQUE INDEX one_active_tracking_session ON tracking_sessions (tenant_id, (data->>'repId')) WHERE data->>'status' IN ('active','paused');",
  ),
];

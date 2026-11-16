import { storageMigration } from '@elvorance/service-kit';
export const tables = ['tenant_profiles', 'memberships'] as const;
export const migrations = [
  storageMigration(
    tables,
    "CREATE UNIQUE INDEX one_membership_per_subject ON memberships (tenant_id, (data->>'subject'));",
  ),
];

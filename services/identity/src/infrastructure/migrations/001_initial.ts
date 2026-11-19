import { addOwnedTablesMigration, storageMigration } from '@elvorance/service-kit';
const initialTables = ['tenant_profiles', 'memberships'] as const;
export const tables = [...initialTables, 'user_profiles'] as const;
export const migrations = [
  storageMigration(
    initialTables,
    "CREATE UNIQUE INDEX one_membership_per_subject ON memberships (tenant_id, (data->>'subject'));",
  ),
  addOwnedTablesMigration(
    2,
    'personal_profiles',
    ['user_profiles'],
    "CREATE UNIQUE INDEX profile_per_subject ON user_profiles (tenant_id, (data->>'subject'));",
  ),
];

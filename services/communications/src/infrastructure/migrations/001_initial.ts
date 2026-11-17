import { storageMigration } from '@elvorance/service-kit';
export const tables = ['notifications', 'tickets'] as const;
export const migrations = [storageMigration(tables, '')];

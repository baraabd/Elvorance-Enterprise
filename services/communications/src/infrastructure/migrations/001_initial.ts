import { storageMigration } from '@atlas/service-kit';
export const tables = ['notifications', 'tickets'] as const;
export const migrations = [storageMigration(tables, '')];

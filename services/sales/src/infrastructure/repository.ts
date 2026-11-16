import { PgRepository } from '@elvorance/service-kit';
import { tables, migrations } from './migrations/001_initial.ts';
export { tables, migrations };
export function createRepository(databaseUrl: string): PgRepository {
  return new PgRepository('sales', databaseUrl, tables, migrations);
}

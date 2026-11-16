import { PgRepository } from '@atlas/service-kit';
import { tables, migrations } from './migrations/001_initial.ts';
export { tables, migrations };
export function createRepository(databaseUrl: string): PgRepository {
  return new PgRepository('crm', databaseUrl, tables, migrations);
}

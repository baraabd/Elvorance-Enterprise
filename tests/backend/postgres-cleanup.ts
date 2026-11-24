import { setTimeout } from 'node:timers/promises';

type Query = (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
type FixtureDatabase = { db: string; role: string };
const fixtureName =
  /^elvorance_test_[a-f0-9]{10}_(identity|crm|sales|delivery|billing|tracking|communications)$/;

/** Pool.end can resolve before every backend has disconnected. Never force-kill a closing socket. */
export async function dropFixtureDatabases(
  query: Query,
  databases: readonly FixtureDatabase[],
  options: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const pollIntervalMs = options.pollIntervalMs ?? 25;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 30_000 ||
    !Number.isSafeInteger(pollIntervalMs) ||
    pollIntervalMs < 1 ||
    pollIntervalMs > timeoutMs
  )
    throw new Error('Invalid fixture cleanup timeout');
  if (databases.some(({ db, role }) => !fixtureName.test(db) || db !== role))
    throw new Error('Refusing cleanup outside disposable PostgreSQL fixture scope');
  if (!databases.length) return;
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const result = await query(
      'SELECT count(*)::int AS connections FROM pg_stat_activity WHERE datname = ANY($1::text[])',
      [databases.map(({ db }) => db)],
    );
    const count = result.rows[0]?.connections;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
      throw new Error('Invalid PostgreSQL fixture connection count');
    if (count === 0) break;
    if (performance.now() >= deadline)
      throw new Error('PostgreSQL fixture connections did not drain; no databases were dropped');
    await setTimeout(pollIntervalMs);
  }
  // Normal DROP also fails safely if an unexpected connection appears after the observation.
  for (const { db, role } of databases) {
    await query(`DROP DATABASE IF EXISTS ${db}`);
    await query(`DROP ROLE IF EXISTS ${role}`);
  }
}

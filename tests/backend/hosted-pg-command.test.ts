import test from 'node:test';
import assert from 'node:assert/strict';
import { pgArguments, pgFailureCategory } from '../../infra/railway/staging/pg-command.mts';
test('restore explicitly connects to a new copy, atomically, without weakening ownership/RLS', () => {
  const url = new URL(
    'postgresql://operator:unit-test@postgres.railway.internal:5432/elvorance_restore_abcdef123456_crm',
  );
  const args = pgArguments(
    'pg_restore',
    ['--exit-on-error', '--no-privileges', '/tmp/crm.dump'],
    url,
  );
  assert.deepEqual(args, [
    '--dbname',
    'elvorance_restore_abcdef123456_crm',
    '--single-transaction',
    '--exit-on-error',
    '--no-privileges',
    '/tmp/crm.dump',
  ]);
  assert(!args.some((x) => x.includes('unit-test')));
  for (const name of ['elvorance_stg_crm', 'railway', 'postgres', 'elvorance_restore_bad_crm']) {
    const other = new URL(url);
    other.pathname = '/' + name;
    assert.throws(() => pgArguments('pg_restore', [], other));
  }
  for (const flag of [
    '--create',
    '--clean',
    '--dbname=railway',
    '--no-owner',
    '--no-policies',
    '--file',
    '-d',
  ])
    assert.throws(() => pgArguments('pg_restore', [flag], url));
});
test('PostgreSQL diagnostics are categorized without leaking raw SQL or credentials', () => {
  assert.equal(
    pgFailureCategory('permission denied for private_table; password=secret'),
    'PERMISSION_DENIED',
  );
  assert.equal(
    pgFailureCategory('one of -d/--dbname and -f/--file must be specified'),
    'MISSING_DATABASE_ARGUMENT',
  );
  assert.equal(
    pgFailureCategory('unexpected contents: actual_private_customer'),
    'UTILITY_FAILURE',
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { dropFixtureDatabases } from './postgres-cleanup.ts';

const fixture = [{ db: 'elvorance_test_123456789a_crm', role: 'elvorance_test_123456789a_crm' }];

test('PostgreSQL fixture cleanup waits for every closing backend before a non-forced drop', async () => {
  const counts = [2, 1, 0];
  const calls: string[] = [];
  await dropFixtureDatabases(
    async (sql, values) => {
      calls.push(sql);
      if (sql.startsWith('SELECT')) {
        assert.deepEqual(values, [[fixture[0]?.db]]);
        return { rows: [{ connections: counts.shift() }] };
      }
      assert.equal(counts.length, 0, 'No database or role drop while a backend remains');
      return { rows: [] };
    },
    fixture,
    { timeoutMs: 1_000, pollIntervalMs: 1 },
  );
  assert.equal(calls.length, 5);
  assert.equal(calls[3], `DROP DATABASE IF EXISTS ${fixture[0]?.db}`);
  assert.equal(calls[4], `DROP ROLE IF EXISTS ${fixture[0]?.role}`);
  assert.ok(calls.every((sql) => !/FORCE|pg_terminate_backend/.test(sql)));
});

test('PostgreSQL fixture cleanup times out without force termination or destructive queries', async () => {
  const calls: string[] = [];
  await assert.rejects(
    dropFixtureDatabases(
      async (sql) => {
        calls.push(sql);
        return { rows: [{ connections: 1 }] };
      },
      fixture,
      { timeoutMs: 10, pollIntervalMs: 1 },
    ),
    /did not drain/,
  );
  assert.ok(calls.length > 0);
  assert.ok(calls.every((sql) => sql.startsWith('SELECT')));
});

test('PostgreSQL fixture cleanup rejects malformed connection evidence before dropping data', async () => {
  for (const connections of [undefined, -1, 0.5, '0', Number.NaN]) {
    const calls: string[] = [];
    await assert.rejects(
      dropFixtureDatabases(async (sql) => {
        calls.push(sql);
        return { rows: [{ connections }] };
      }, fixture),
      /Invalid PostgreSQL fixture connection count/,
    );
    assert.equal(calls.length, 1);
  }
});

test('PostgreSQL fixture cleanup rejects non-fixture names, mismatched roles and invalid timing', async () => {
  let calls = 0;
  const query = async () => {
    calls += 1;
    return { rows: [] };
  };
  for (const databases of [
    [{ db: 'postgres', role: 'postgres' }],
    [{ db: 'elvorance_test_123456789a_crm', role: 'another_role' }],
    [{ db: 'elvorance_test_123456789a_crm;DROP ROLE postgres', role: 'postgres' }],
  ])
    await assert.rejects(dropFixtureDatabases(query, databases), /fixture scope/);
  for (const timeoutMs of [0, -1, 1.5, 30_001, Number.NaN])
    await assert.rejects(dropFixtureDatabases(query, fixture, { timeoutMs }), /cleanup timeout/);
  await dropFixtureDatabases(query, []);
  assert.equal(calls, 0);
});

test('PostgreSQL fixture cleanup preserves database drop errors instead of masking failed cleanup', async () => {
  const failure = new Error('database remains in use');
  const calls: string[] = [];
  await assert.rejects(
    dropFixtureDatabases(async (sql) => {
      calls.push(sql);
      if (sql.startsWith('SELECT')) return { rows: [{ connections: 0 }] };
      throw failure;
    }, fixture),
    (error) => error === failure,
  );
  assert.equal(calls.length, 2);
  assert.ok(calls.every((sql) => !sql.startsWith('DROP ROLE')));
});

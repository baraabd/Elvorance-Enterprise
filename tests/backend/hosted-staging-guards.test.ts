import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertStaging,
  privateDatabaseUrl,
  sourceRevision,
  stagingTarget,
  identifier,
} from '../../infra/railway/staging/target.mts';
const valid = {
  RAILWAY_PROJECT_ID: stagingTarget.projectId,
  RAILWAY_ENVIRONMENT_ID: stagingTarget.environmentId,
  ELVORANCE_ENVIRONMENT: 'staging',
  STAGING_OPERATION: 'bootstrap',
  KEYCLOAK_BASE_URL: stagingTarget.identityOrigin,
};
test('hosted operations accept only the explicitly authorized project and staging environment', () => {
  assert.doesNotThrow(() => assertStaging(valid));
  for (const field of Object.keys(valid))
    assert.throws(() => assertStaging({ ...valid, [field]: 'production' }));
  assert.throws(() => assertStaging({}));
});
test('hosted database guard rejects public hosts and unexpected databases or SQL identifiers', () => {
  assert.equal(
    privateDatabaseUrl(
      'postgresql://a:b@postgres.railway.internal:5432/elvorance_stg_crm',
      'elvorance_stg_crm',
    ).hostname,
    'postgres.railway.internal',
  );
  for (const url of [
    'postgresql://a:b@db.example:5432/x',
    'postgresql://a:b@localhost:5432/x',
    'postgresql://a:b@db.railway.internal:5432/x?sslmode=disable',
  ])
    assert.throws(() => privateDatabaseUrl(url));
  assert.throws(() =>
    privateDatabaseUrl('postgresql://a:b@db.railway.internal:5432/railway', 'elvorance_stg_crm'),
  );
  assert.throws(() => identifier('a;drop database postgres'));
});
test('hosted evidence requires an exact source revision', () => {
  assert.throws(() => sourceRevision({}));
  assert.throws(() => sourceRevision({ RAILWAY_GIT_COMMIT_SHA: 'main' }));
  assert.equal(sourceRevision({ RAILWAY_GIT_COMMIT_SHA: 'a'.repeat(40) }), 'a'.repeat(40));
});

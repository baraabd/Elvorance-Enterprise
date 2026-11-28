import test from 'node:test';
import assert from 'node:assert/strict';
import {
  backupConfiguration,
  backupObjectKey,
  backupTarget,
} from '../../infra/railway/staging/backup-store.mts';
import { backupDatabases } from '../../infra/railway/staging/backup.mts';
import { assertStaging, stagingTarget } from '../../infra/railway/staging/target.mts';
const env = {
  RAILWAY_PROJECT_ID: stagingTarget.projectId,
  RAILWAY_ENVIRONMENT_ID: stagingTarget.environmentId,
  ELVORANCE_ENVIRONMENT: 'staging',
  STAGING_OPERATION: 'backup-restore',
  KEYCLOAK_BASE_URL: stagingTarget.identityOrigin,
  BACKUP_ENDPOINT: backupTarget.endpoint,
  BACKUP_BUCKET: backupTarget.bucket,
  BACKUP_REGION: backupTarget.region,
  BACKUP_ACCESS_KEY_ID: 'synthetic-only-access',
  BACKUP_SECRET_ACCESS_KEY: 'synthetic-only-secret',
};
test('retained backup refuses foreign scope, storage targets and absent credentials before network access', () => {
  assert.doesNotThrow(() => assertStaging(env));
  assert.equal(backupConfiguration(env).bucket, backupTarget.bucket);
  for (const field of [
    'RAILWAY_PROJECT_ID',
    'RAILWAY_ENVIRONMENT_ID',
    'ELVORANCE_ENVIRONMENT',
    'STAGING_OPERATION',
    'KEYCLOAK_BASE_URL',
    'BACKUP_ENDPOINT',
    'BACKUP_BUCKET',
    'BACKUP_REGION',
  ])
    assert.throws(() => backupConfiguration({ ...env, [field]: 'unapproved' }), field);
  for (const field of ['BACKUP_ACCESS_KEY_ID', 'BACKUP_SECRET_ACCESS_KEY'])
    assert.throws(() => backupConfiguration({ ...env, [field]: '' }), field);
  assert.throws(() =>
    backupConfiguration({ ...env, BACKUP_ENDPOINT: 'https://t3.storageapi.dev.attacker.invalid' }),
  );
});
test('retained backup object keys bind source, run and domain and prohibit overwrite-path tricks', () => {
  const source = 'a'.repeat(40),
    run = 'b'.repeat(12);
  assert.equal(
    backupObjectKey(source, run, 'crm.enc'),
    `elvorance/${stagingTarget.environmentId}/${source}/${run}/crm.enc`,
  );
  assert.notEqual(
    backupObjectKey(source, run, 'crm.enc'),
    backupObjectKey(source, 'c'.repeat(12), 'crm.enc'),
  );
  for (const file of [
    '../crm.enc',
    'crm.dump',
    'x.enc',
    'crm.enc?other',
    'crm.enc\n',
    'CRM.enc',
    'crm/manifest.enc',
  ])
    assert.throws(() => backupObjectKey(source, run, file));
  for (const bad of ['', 'main', 'a'.repeat(39), 'a'.repeat(40) + '\n'])
    assert.throws(() => backupObjectKey(bad, run, 'manifest.enc'));
});
test('retained backup targets exactly seven domain databases and verified Keycloak on the private staging cluster', () => {
  const root = new URL('postgresql://synthetic:synthetic@postgres.railway.internal:5432/railway');
  const targets = backupDatabases(root);
  assert.equal(targets.length, 8);
  assert.equal(targets[7]?.database, 'railway');
  assert.ok(targets.slice(0, 7).every((item) => item.database === 'elvorance_stg_' + item.service));
  for (const url of [
    'postgresql://a:b@postgres.example:5432/railway',
    'postgresql://a:b@other.railway.internal:5432/railway',
    'postgresql://a:b@postgres.railway.internal:5432/production',
    'postgresql://a:b@postgres.railway.internal:6543/railway',
  ])
    assert.throws(() => backupDatabases(new URL(url)));
});

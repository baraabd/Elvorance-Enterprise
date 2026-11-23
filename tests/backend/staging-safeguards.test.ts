import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import {
  assertRuntimeStaging,
  stagingTarget,
  stagingDomains,
} from '../../packages/service-kit/src/staging-boundary.ts';
import { operationLog, safeErrorCode } from '../../packages/service-kit/src/operations-log.ts';
import {
  migrationChecksum,
  migrationManifest,
  migrationDecision,
} from '../../packages/service-kit/src/migration-ledger.ts';
import {
  provisionTopology,
  serviceBindings,
  auditBindings,
  auditQueue,
  type TopologyChannel,
} from '../../packages/events/src/topology.ts';
import { sealBackup, openBackup, signedHeaders } from '../../infra/railway/staging/backup.mts';
import { privateDatabaseUrl } from '../../infra/railway/staging/target.mts';
const source = 'a'.repeat(40);
function env(service = 'crm'): NodeJS.ProcessEnv {
  const issuer = stagingTarget.identityOrigin + '/realms/elvorance-staging';
  return {
    RAILWAY_PROJECT_ID: stagingTarget.projectId,
    RAILWAY_ENVIRONMENT_ID: stagingTarget.environmentId,
    ELVORANCE_ENVIRONMENT: 'staging',
    NODE_ENV: 'production',
    SOURCE_REVISION: source,
    AUTH_MODE: 'oidc',
    OIDC_ISSUER: issuer,
    OIDC_JWKS_URL: issuer + '/protocol/openid-connect/certs',
    OIDC_AUDIENCE: 'elvorance-api-staging',
    DATABASE_URL: `postgresql://elvorance_stg_${service}:unit-test@postgres.railway.internal:5432/elvorance_stg_${service}`,
    RABBITMQ_URL:
      'amqp://elvorance_staging:unit-test@rabbitmq.railway.internal:5672/elvorance-staging',
  };
}
test('staging binds platform IDs, identity, database ownership and broker vhost before connecting', () => {
  for (const service of stagingDomains)
    assert.doesNotThrow(() => assertRuntimeStaging(service, env(service)));
  for (const [key, value] of Object.entries({
    RAILWAY_PROJECT_ID: 'production',
    RAILWAY_ENVIRONMENT_ID: 'other',
    ELVORANCE_ENVIRONMENT: 'production',
    SOURCE_REVISION: 'main',
    AUTH_MODE: 'dev-hs256',
    OIDC_ISSUER: 'https://production.example/realm',
    OIDC_JWKS_URL: 'https://production.example/keys',
    OIDC_AUDIENCE: 'elvorance-api-production',
    AUTO_MIGRATE: 'true',
    DATABASE_URL: 'postgresql://root:unit-test@postgres.railway.internal:5432/railway',
    RABBITMQ_URL: 'amqp://elvorance_staging:unit-test@rabbitmq.railway.internal:5672/production',
  }))
    assert.throws(() => assertRuntimeStaging('crm', { ...env(), [key]: value }), key);
  for (const host of ['other.railway.internal', 'postgres.railway.internal.attacker.test'])
    assert.throws(() => privateDatabaseUrl(`postgresql://a:b@${host}:5432/railway`));
  assert.doesNotThrow(() => assertRuntimeStaging('crm', {}));
});
test('gateway rejects production upstreams, wildcard CORS and misleading staging hostnames', () => {
  const good: NodeJS.ProcessEnv = {
    ...env(),
    CORS_ORIGINS: Object.values(stagingTarget.web).join(','),
  };
  for (const [index, service] of stagingDomains.entries())
    good[`${service.toUpperCase()}_URL`] = `http://${service}.railway.internal:${3001 + index}`;
  assert.doesNotThrow(() => assertRuntimeStaging('api-gateway', good));
  for (const change of [
    { CRM_URL: 'https://crm-production.example' },
    { CORS_ORIGINS: '*' },
    { CORS_ORIGINS: stagingTarget.web.admin + '.attacker.test' },
  ])
    assert.throws(() => assertRuntimeStaging('api-gateway', { ...good, ...change }));
});
test('immutable migration checksums reject edits, unapproved legacy baselines and duplicate versions', () => {
  const migration = { version: 1, name: 'initial', sql: 'SELECT 1;' };
  const manifest = migrationManifest([migration]);
  assert.equal(migrationDecision(migration, undefined, manifest, {}), 'apply');
  assert.equal(
    migrationDecision(
      migration,
      { ...migration, checksum: migrationChecksum(migration) },
      manifest,
      {},
    ),
    'skip',
  );
  const legacy = { version: 1, name: 'initial', checksum: null };
  assert.throws(() => migrationDecision(migration, legacy, manifest, {}));
  assert.equal(
    migrationDecision(migration, legacy, manifest, {
      MIGRATION_BASELINE_MANIFEST_SHA256: manifest,
      MIGRATION_BASELINE_SOURCE_REVISION: source,
    }),
    'baseline',
  );
  assert.throws(() =>
    migrationDecision(
      { ...migration, sql: 'SELECT 2;' },
      { ...migration, checksum: migrationChecksum(migration) },
      manifest,
      {},
    ),
  );
  assert.throws(() => migrationManifest([migration, migration]));
});
test('structured diagnostic metadata never contains driver messages, SQL, URLs or arbitrary error codes', () => {
  const error = {
    code: '42P01',
    message: 'postgresql://root:secret@example/private; tenant data',
    stack: 'private token',
  };
  const record = operationLog('crm', 'event-runtime', 'lease-outbox', error, env());
  assert.equal(JSON.parse(record).code, '42P01');
  assert(!/secret|tenant data|private token|postgresql/.test(record));
  assert.equal(safeErrorCode({ code: 'Bearer secret' }), 'UNCLASSIFIED');
});
test('every literal domain emission has an explicit durable destination; configuration publication no longer has zero routes', async () => {
  const bindings: string[] = [],
    queues = new Map<string, Record<string, unknown>>();
  const channel: TopologyChannel = {
    async assertExchange() {
      return { exchange: 'test' };
    },
    async assertQueue(queue, options) {
      queues.set(queue, options?.arguments ?? {});
      return { queue, messageCount: 0, consumerCount: 0 };
    },
    async bindQueue(_queue, exchange, key) {
      if (exchange === 'atlas.events') bindings.push(key);
      return {};
    },
  };
  await provisionTopology(channel);
  assert.equal(queues.get(auditQueue)?.['x-overflow'], 'reject-publish');
  assert.equal(queues.get(auditQueue)?.['x-queue-type'], 'quorum');
  assert(auditBindings.includes('crm.configuration_published.v1'));
  assert(!Object.values(serviceBindings).flat().includes('crm.configuration_published.v1'));
  let emissions = 0;
  async function walk(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const name = path + '/' + entry.name;
      if (entry.isDirectory()) await walk(name);
      else if (name.endsWith('.ts'))
        for (const found of (await readFile(name, 'utf8')).matchAll(
          /\.emit\(\s*['"]([^'"]+)['"]/g,
        )) {
          emissions++;
          assert(bindings.includes(found[1]!), `Unrouted event ${found[1]}`);
        }
    }
  }
  for (const service of stagingDomains) await walk(`services/${service}/src`);
  assert(emissions >= 20);
  assert(!bindings.includes('#'), 'Unknown events must not silently route into a wildcard sink');
});
test('authenticated backup round-trip rejects wrong keys, cross-object replay and tampering', () => {
  const key = 'b'.repeat(64),
    context = `sprint02/${source}/${'c'.repeat(24)}/crm.json`,
    plaintext = Buffer.from('synthetic backup');
  const blob = sealBackup(plaintext, key, context);
  assert.deepEqual(openBackup(blob, key, context), plaintext);
  assert(!blob.toString().includes('synthetic backup'));
  assert.throws(() => openBackup(blob, 'd'.repeat(64), context));
  assert.throws(() => openBackup(blob, key, context.replace('crm', 'sales')));
  const changed = JSON.parse(blob.toString());
  changed.tag = '0'.repeat(32);
  assert.throws(() => openBackup(Buffer.from(JSON.stringify(changed)), key, context));
});
test('backup signer permits only the exact staging bucket and run-scoped object paths', () => {
  const target = new URL(
    `https://staging-backups-djcep-toh.t3.storageapi.dev/sprint02/${source}/${'c'.repeat(24)}/crm.json`,
  );
  const result = signedHeaders(
    'PUT',
    target,
    Buffer.from('synthetic'),
    'EXAMPLEKEY01',
    'example-secret-not-real',
    new Date('2026-11-23T10:00:00Z'),
  );
  assert(result.authorization?.includes('20261123/auto/s3/aws4_request'));
  assert.equal(result['x-amz-date'], '20261123T100000Z');
  assert(
    result.authorization?.endsWith(
      'Signature=9f8bc2e8fb545b1bd8274b4e80c4237b70aa8e69b5b96d118fac01da79a7483a',
    ),
    'Matches independent botocore S3SigV4Auth reference vector',
  );
  target.hostname = 'production.t3.storageapi.dev';
  assert.throws(() =>
    signedHeaders('PUT', target, Buffer.alloc(0), 'EXAMPLEKEY01', 'example-secret-not-real'),
  );
});

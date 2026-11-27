import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, link, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { AppError, MemoryRepository } from '@elvorance/service-kit';
import { createApp as createIdentity } from '../../services/identity/src/app.ts';
import { createApp as createGateway } from '../../services/api-gateway/src/app.ts';
import type { Upstreams } from '../../services/api-gateway/src/domain/routes.ts';
import { adminTokenFromEnv } from '../../infra/identity/admin-client.mts';
import { copyContent } from '../../tooling/scripts/copy-content.mts';
import { auth } from './helpers.ts';

const upstreams = Object.fromEntries(
  ['identity', 'crm', 'sales', 'delivery', 'billing', 'tracking', 'communications'].map((name) => [
    name,
    `https://${name}.example.test`,
  ]),
) as Upstreams;

for (const kind of ['service', 'gateway'] as const) {
  test(`PR repair: ${kind} rejects exhausted socket IP before authentication and keeps health available`, async (t) => {
    let authentications = 0;
    const auth = async () => {
      authentications++;
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid access token');
    };
    const app =
      kind === 'service'
        ? createIdentity({
            auth,
            repository: new MemoryRepository('identity', [
              'tenant_profiles',
              'memberships',
              'user_profiles',
            ]),
          })
        : createGateway({
            auth,
            upstreams,
            requestLimits: { perIp: 10_000, perPrincipal: 10_000 },
          });
    t.after(() => app.close());
    for (let index = 0; index < 600; index++) {
      const result = await app.inject({
        method: 'GET',
        url: '/v1/identity/me',
        remoteAddress: '192.0.2.10',
        headers: { 'x-forwarded-for': `198.51.100.${index % 250}` },
      });
      assert.equal(result.statusCode, 401);
    }
    const limited = await Promise.all(
      Array.from({ length: 12 }, () =>
        app.inject({ method: 'GET', url: '/v1/identity/me', remoteAddress: '192.0.2.10' }),
      ),
    );
    for (const response of limited) {
      assert.equal(response.statusCode, 429);
      assert.equal(response.json().error.code, 'RATE_LIMITED');
      assert.ok(Number(response.headers['retry-after']) > 0);
    }
    assert.equal(authentications, 600, 'rejected bursts must not enter the token verifier');
    const health = await app.inject({ method: 'GET', url: '/health', remoteAddress: '192.0.2.10' });
    assert.equal(health.statusCode, 200);
    const distinct = await app.inject({
      method: 'GET',
      url: '/v1/identity/me',
      remoteAddress: '192.0.2.11',
    });
    assert.equal(distinct.statusCode, 401);
    assert.equal(authentications, 601);
  });
}

test('PR repair: credential descriptors reject linked files and oversized input without revealing contents', async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'elvorance-token-descriptor-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = resolve(directory, 'credential');
  const value = 'synthetic-token-for-isolated-file-test';
  await writeFile(path, value, { mode: 0o600 });
  assert.equal(await adminTokenFromEnv({ KEYCLOAK_ADMIN_TOKEN_FILE: path }), value);
  const alias = resolve(directory, 'linked-credential');
  await link(path, alias);
  await assert.rejects(
    adminTokenFromEnv({ KEYCLOAK_ADMIN_TOKEN_FILE: alias }),
    /unlinked regular file/,
  );
  await rm(alias);
  if (process.platform !== 'win32') {
    await chmod(path, 0o644);
    await assert.rejects(
      adminTokenFromEnv({ KEYCLOAK_ADMIN_TOKEN_FILE: path }),
      /readable only by its owner/,
    );
    await chmod(path, 0o600);
  }
  await writeFile(path, 'x'.repeat(32_769));
  await assert.rejects(adminTokenFromEnv({ KEYCLOAK_ADMIN_TOKEN_FILE: path }), /size limit/);
});

test('PR repair: content copy cannot truncate its source or a hard-linked destination', async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'elvorance-copy-descriptor-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = resolve(directory, 'source');
  const unrelated = resolve(directory, 'unrelated');
  const destination = resolve(directory, 'linked-output');
  await writeFile(source, 'source bytes');
  await writeFile(unrelated, 'unrelated bytes');
  await link(unrelated, destination);
  await assert.rejects(copyContent(source, source), /distinct, unlinked regular file/);
  await assert.rejects(copyContent(source, destination), /distinct, unlinked regular file/);
  assert.equal(await readFile(source, 'utf8'), 'source bytes');
  assert.equal(await readFile(unrelated, 'utf8'), 'unrelated bytes');
  await rm(destination);
  await copyContent(source, destination);
  assert.equal(await readFile(destination, 'utf8'), 'source bytes');
});

test('PR repair: the default gateway principal budget still rejects request 301 before forwarding', async (t) => {
  let forwarded = 0;
  const app = createGateway({
    auth,
    upstreams,
    fetcher: async () => {
      forwarded++;
      return new Response(JSON.stringify({ items: [], nextCursor: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  t.after(() => app.close());
  const request = {
    method: 'GET' as const,
    url: '/v1/crm/customers',
    headers: { authorization: 'Bearer rep' },
  };
  for (let index = 0; index < 300; index++) {
    assert.equal((await app.inject(request)).statusCode, 200);
  }
  const limited = await app.inject(request);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.json().error.code, 'RATE_LIMITED');
  assert.ok(Number(limited.headers['retry-after']) > 0);
  assert.equal(forwarded, 300, 'a limited request must never reach the upstream');
});

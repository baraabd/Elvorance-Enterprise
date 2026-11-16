// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { smoke } from '../../infra/compose/smoke.mts';

test('environment helper preserves unrelated settings and never prints generated credentials', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'elvorance-compose-env-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.copyFileSync(
    fileURLToPath(new URL('../../infra/compose/init-env.mts', import.meta.url)),
    path.join(directory, 'init-env.mts'),
  );
  fs.writeFileSync(
    path.join(directory, '.env.example'),
    'CUSTOM_SETTING=keep-me\nDEV_JWT_SECRET=REPLACE_WITH_GENERATED_VALUE\n',
  );
  const run = () =>
    spawnSync(process.execPath, [path.join(directory, 'init-env.mts')], { encoding: 'utf8' });
  const first = run();
  assert.equal(first.status, 0);
  const saved = fs.readFileSync(path.join(directory, '.env'), 'utf8');
  assert(saved.includes('CUSTOM_SETTING=keep-me'));
  const jwt = saved.match(/^DEV_JWT_SECRET=(.+)$/m)[1];
  assert.match(jwt, /^[a-f0-9]{64}$/);
  assert(!first.stdout.includes(jwt));
  assert(!first.stderr.includes(jwt));
  const passwords = [...saved.matchAll(/^[A-Z_]+=(\w{64})$/gm)].map((match) => match[1]);
  assert.equal(new Set(passwords).size, 10);
  const second = run();
  assert.equal(second.status, 0);
  assert.equal(fs.readFileSync(path.join(directory, '.env'), 'utf8'), saved);
});

test('development smoke uses verified claims, GET requests and no persisted token', async () => {
  const secret = randomBytes(32).toString('hex'),
    calls = [];
  const result = await smoke({
    baseUrl: 'http://127.0.0.1:3000',
    secret,
    issuer: 'https://elvorance.local.invalid',
    audience: 'elvorance-enterprise',
    fetcher: async (url, options) => {
      assert.equal(options.method, undefined);
      const token = options.headers.Authorization?.slice(7);
      calls.push(url.pathname);
      if (url.pathname === '/health')
        return new Response(JSON.stringify({ service: 'api-gateway', status: 'alive' }));
      if (!token)
        return new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }), {
          status: 401,
        });
      const [header, payload, signature] = token.split('.');
      assert.equal(
        signature,
        createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url'),
      );
      const claims = JSON.parse(Buffer.from(payload, 'base64url'));
      assert.equal(claims.aud, 'elvorance-enterprise');
      assert(claims.exp > claims.iat);
      return new Response(
        JSON.stringify(
          url.pathname === '/v1/identity/me'
            ? { principal: { sub: claims.sub, tenantId: claims.tenant_id, roles: claims.roles } }
            : { items: [] },
        ),
      );
    },
  });
  assert.equal(result.passed, 9);
  assert.equal(calls.length, 9);
  assert(!JSON.stringify(result).includes(secret));
});

test('development smoke rejects non-loopback destinations before sending a token', async () => {
  let calls = 0;
  await assert.rejects(
    smoke({
      baseUrl: 'https://production.example.invalid',
      secret: 'a'.repeat(64),
      issuer: 'issuer',
      audience: 'audience',
      fetcher: () => {
        calls++;
      },
    }),
    /loopback/,
  );
  assert.equal(calls, 0);
});

test('development smoke fails on degraded domain responses', async () => {
  await assert.rejects(
    smoke({
      baseUrl: 'http://127.0.0.1:3000',
      secret: 'a'.repeat(64),
      issuer: 'issuer',
      audience: 'audience',
      fetcher: async () => new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 }),
    }),
    /Probe failed/,
  );
});

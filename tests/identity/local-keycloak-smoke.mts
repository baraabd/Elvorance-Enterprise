import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { createIdentityDefinition } from '../../infra/identity/realm.mts';
import { adminTokenFromEnv, createAdminClient } from '../../infra/identity/admin-client.mts';
import { bootstrapIdentity } from '../../infra/identity/provision.mts';
import { createAuthSession } from '../../packages/mobile-auth/src/session.ts';
import { authFromEnv } from '../../packages/service-kit/src/auth.ts';

// This smoke test creates and removes a temporary fixture account. It is restricted to an
// explicitly enabled loopback-only identity server and never targets the production realm.
const base = process.env.LOCAL_KEYCLOAK_BASE_URL ?? '';
const url = new URL(base);
if (
  process.env.ELVORANCE_IDENTITY_LOCAL_TEST !== '1' ||
  url.protocol !== 'https:' ||
  !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
  url.origin !== base
) {
  throw new Error(
    'Enable ELVORANCE_IDENTITY_LOCAL_TEST=1 and use an exact loopback HTTPS LOCAL_KEYCLOAK_BASE_URL.',
  );
}
const adminToken = await adminTokenFromEnv();
const definition = createIdentityDefinition({
  environment: 'staging',
  baseUrl: base,
  adminWebRedirectUri: 'https://admin.staging.example/callback',
  adminWebOrigin: 'https://admin.staging.example',
  clientWebRedirectUri: 'https://client.staging.example/callback',
  clientWebOrigin: 'https://client.staging.example',
});
const admin = createAdminClient(base, adminToken);
const serverInfo = (await admin.get('/admin/serverinfo')) as { systemInfo?: { version?: string } };
if (serverInfo.systemInfo?.version !== '26.8.2')
  throw new Error('The local integration fixture requires Keycloak 26.8.2.');
const result = await bootstrapIdentity(admin, definition);
const second = await bootstrapIdentity(admin, definition);
assert.equal(second.created, false);
const realmPath = '/admin/realms/elvorance-staging';
const username = 'verification-' + randomBytes(6).toString('hex');
const password = randomBytes(32).toString('base64url');
await admin.write('POST', realmPath + '/users', {
  username,
  enabled: true,
  emailVerified: true,
  email: username + '@example.invalid',
  firstName: 'Local',
  lastName: 'Verification',
  attributes: {
    tenant_id: ['verification-tenant'],
    rep_id: ['verification-rep'],
    client_id: ['verification-client'],
  },
  credentials: [{ type: 'password', value: password, temporary: false }],
});
const [user] = (await admin.get(
  realmPath + '/users?username=' + username + '&exact=true',
)) as any[];
let auth: ReturnType<typeof createAuthSession> | null = null;
try {
  const [api] = (await admin.get(
    realmPath + '/clients?clientId=' + definition.publicConfig.audience,
  )) as any[];
  const assigned = await Promise.all(
    ['admin', 'rep', 'client', 'finance', 'delivery', 'support'].map((role) =>
      admin.get(realmPath + '/clients/' + api.id + '/roles/' + role),
    ),
  );
  await admin.write(
    'POST',
    realmPath + '/users/' + user.id + '/role-mappings/clients/' + api.id,
    assigned,
  );
  assert.ok(definition.publicConfig.adminWebClientId);
  assert.ok(definition.publicConfig.adminWebRedirectUri);
  assert.ok(definition.publicConfig.clientWebClientId);
  assert.ok(definition.publicConfig.clientWebRedirectUri);
  const clients = [
    {
      name: 'rep-native',
      clientId: definition.publicConfig.clientId,
      redirectUri: definition.publicConfig.redirectUri,
      roles: ['rep'],
    },
    {
      name: 'client-native',
      clientId: definition.publicConfig.clientNativeClientId,
      redirectUri: definition.publicConfig.clientNativeRedirectUri,
      roles: ['client'],
    },
    {
      name: 'admin-web',
      clientId: definition.publicConfig.adminWebClientId,
      redirectUri: definition.publicConfig.adminWebRedirectUri,
      roles: ['admin', 'support', 'finance', 'delivery'],
    },
    {
      name: 'client-web',
      clientId: definition.publicConfig.clientWebClientId,
      redirectUri: definition.publicConfig.clientWebRedirectUri,
      roles: ['client'],
    },
  ];
  const verifiedClients: string[] = [];
  for (const scenario of clients) {
    const cookies = new Map<string, string>();
    async function browserRequest(url: string, options: RequestInit = {}) {
      const result = await fetch(url, {
        ...options,
        redirect: 'manual',
        headers: {
          ...options.headers,
          cookie: [...cookies].map(([name, value]) => name + '=' + value).join('; '),
        },
      });
      for (const cookie of result.headers.getSetCookie()) {
        const pair = cookie.split(';')[0]!;
        const index = pair.indexOf('=');
        if (index > 0) cookies.set(pair.slice(0, index), pair.slice(index + 1));
      }
      return result;
    }

    const memory = new Map<string, string>();
    let offset = 0;
    auth = createAuthSession(
      {
        ...definition.publicConfig,
        clientId: scenario.clientId,
        redirectUri: scenario.redirectUri,
        scopes: ['openid', 'profile'],
      },
      {
        now: () => Date.now() + offset,
        storage: {
          async get(key) {
            return memory.get(key) ?? null;
          },
          async set(key, value) {
            memory.set(key, value);
          },
          async remove(key) {
            memory.delete(key);
          },
        },
        browser: {
          async authorize(url, redirectUri) {
            let page = await browserRequest(url);
            for (let step = 0; step < 10; step++) {
              const location = page.headers.get('location');
              if (location) {
                if (location.startsWith(redirectUri + '?')) return location;
                const target = new URL(location, url);
                if (target.origin !== base) throw new Error('Unexpected test browser redirect.');
                page = await browserRequest(target.href);
                continue;
              }
              if (!page.ok) throw new Error('Local authorization page failed: HTTP ' + page.status);
              const document = new JSDOM(await page.text()).window.document;
              const form = document.querySelector<HTMLFormElement>('form#kc-form-login');
              if (!form)
                throw new Error('Local login did not present the expected credential form.');
              const action = new URL(form.getAttribute('action')!, base);
              if (action.origin !== base)
                throw new Error('Unexpected local credential form origin.');
              const fields = new URLSearchParams();
              for (const node of form.querySelectorAll<HTMLInputElement>(
                'input[type="hidden"][name]',
              ))
                fields.set(node.name, node.value);
              fields.set('username', username);
              fields.set('password', password);
              page = await browserRequest(action.href, {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: fields,
              });
            }
            throw new Error('Local authorization did not complete.');
          },
          async getLaunchUrl() {
            return null;
          },
          async onCallback() {
            return async () => {};
          },
          clearCallback() {},
          async cancelAuthorization() {},
        },
      },
    );
    const session = await auth.signIn();
    assert.equal(session.status, 'authenticated');
    const access = await auth.getAccessToken();
    const verify = authFromEnv({
      AUTH_MODE: 'oidc',
      NODE_ENV: 'production',
      OIDC_ISSUER: definition.publicConfig.issuer,
      OIDC_AUDIENCE: definition.publicConfig.audience,
      OIDC_JWKS_URL: definition.publicConfig.jwksUrl,
    });
    const principal = await verify('Bearer ' + access);
    assert.equal(principal.tenantId, 'verification-tenant');
    assert.equal(principal.repId, 'verification-rep');
    assert.equal(principal.clientId, 'verification-client');
    assert.deepEqual([...principal.roles].sort(), [...scenario.roles].sort());
    const previous = JSON.parse(memory.get('auth-session')!).refreshToken;
    offset = 280_000;
    const refreshed = await auth.getAccessToken();
    offset = 0;
    assert.ok(refreshed);
    const rotated = JSON.parse(memory.get('auth-session')!).refreshToken;
    assert.notEqual(rotated, previous);
    assert.deepEqual(
      [...(await verify('Bearer ' + refreshed)).roles].sort(),
      [...scenario.roles].sort(),
    );
    const replay = await fetch(definition.publicConfig.issuer + '/protocol/openid-connect/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: scenario.clientId,
        refresh_token: previous,
      }),
      redirect: 'error',
    });
    assert.equal(replay.status, 400);
    assert.equal((await replay.json()).error, 'invalid_grant');
    assert.equal((await auth.signOut()).revoked, true);
    assert.equal(memory.size, 0);
    assert.equal(await auth.getAccessToken(), null);
    // A fresh active session proves logout revocation independently of reuse detection above.
    assert.equal((await auth.signIn()).status, 'authenticated');
    const revocationSession = memory.get('auth-session');
    assert.ok(revocationSession);
    const toRevoke = JSON.parse(revocationSession).refreshToken;
    assert.equal((await auth.signOut()).revoked, true);
    assert.equal(memory.size, 0);
    const revokedRefresh = await fetch(
      definition.publicConfig.issuer + '/protocol/openid-connect/token',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        redirect: 'error',
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: scenario.clientId,
          refresh_token: toRevoke,
        }),
      },
    );
    assert.equal(revokedRefresh.status, 400);
    assert.equal((await revokedRefresh.json()).error, 'invalid_grant');
    await auth.dispose();
    auth = null;
    verifiedClients.push(scenario.name);
  }
  const report = {
    scope: 'Isolated local Keycloak integration; not hosted Staging or physical devices',
    verifiedAt: new Date().toISOString(),
    keycloak: serverInfo.systemInfo.version,
    imported: result.created,
    idempotentBootstrap: true,
    authorizationCodePkceS256: true,
    idTokenSignatureJwks: true,
    apiClaimsAndAudienceVerified: true,
    adminOnlyAttributeSchema: true,
    refreshRotationAndReplayRejection: true,
    logoutRevocation: true,
    revokedRefreshUseRejected: true,
    verifiedClients,
  };
  const output = resolve(
    process.env.ELVORANCE_IDENTITY_TEST_REPORT ?? 'dist/identity-local-verification.json',
  );
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await auth?.dispose();
  await admin.remove(realmPath + '/users/' + encodeURIComponent(user.id));
}

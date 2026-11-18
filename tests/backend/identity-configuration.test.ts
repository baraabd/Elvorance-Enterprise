import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentityDefinition } from '../../infra/identity/realm.mts';
import { bootstrapIdentity } from '../../infra/identity/provision.mts';
import { verifyUserProfile } from '../../infra/identity/verify.mts';
import { createAdminClient, type AdminClient } from '../../infra/identity/admin-client.mts';
import type { IdentityDefinition } from '../../infra/identity/types.mts';

const input = { environment: 'staging' as const, baseUrl: 'https://identity.staging.example' };

function mockAdmin(definition: IdentityDefinition) {
  let imported = false;
  let enabled = false;
  let profile: unknown = {};
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const prefix = `/admin/realms/${definition.realm.realm}`;
  let allowInvalidMapper = false;
  const admin: AdminClient = {
    async exists() {
      return imported;
    },
    async get(path) {
      if (path === prefix) return { ...definition.realm, enabled };
      if (path === `${prefix}/users/profile`) return profile;
      const url = new URL(path, input.baseUrl);
      const id = url.searchParams.get('clientId');
      if (id) return [{ id, clientId: id }];
      const exactClient = definition.realm.clients.find(
        (client) => path === `${prefix}/clients/${client.clientId}`,
      );
      if (exactClient) {
        const value = structuredClone(exactClient);
        if (allowInvalidMapper && !value.bearerOnly)
          value.protocolMappers[0]!.config['id.token.claim'] = 'true';
        return { ...value, id: value.clientId };
      }
      if (path.endsWith('/roles')) {
        const clientRoles = definition.realm.roles as { client: Record<string, unknown> };
        return clientRoles.client[definition.publicConfig.audience];
      }
      if (path.includes('/scope-mappings/clients/')) return [{ name: 'rep' }];
      throw new Error('Unexpected test administration request.');
    },
    async write(method, path, body) {
      calls.push({ method, path, body });
      if (path === '/admin/realms') {
        imported = true;
        assert.equal((body as { enabled: boolean }).enabled, false);
      } else if (path.endsWith('/users/profile')) {
        assert.equal(enabled, false);
        profile = body;
      } else if (path === prefix) {
        assert.notDeepEqual(profile, {});
        enabled = (body as { enabled: boolean }).enabled;
      } else throw new Error('Unexpected test write.');
    },
  };
  return {
    admin,
    calls,
    driftMapper() {
      allowInvalidMapper = true;
    },
    isEnabled: () => enabled,
  };
}

test('identity definitions isolate environments and permit only authorization code + S256', () => {
  const staging = createIdentityDefinition(input);
  const production = createIdentityDefinition({
    environment: 'production',
    baseUrl: 'https://identity.example',
  });
  assert.notEqual(staging.publicConfig.issuer, production.publicConfig.issuer);
  assert.notEqual(staging.publicConfig.clientId, production.publicConfig.clientId);
  assert.notEqual(staging.publicConfig.audience, production.publicConfig.audience);
  assert.equal(staging.realm.enabled, false);
  assert.equal(staging.realm.users, undefined);
  assert.equal(staging.realm.revokeRefreshToken, true);
  assert.equal(staging.realm.refreshTokenMaxReuse, 0);
  const native = staging.realm.clients.find(
    (client) => client.clientId === staging.publicConfig.clientId,
  )!;
  assert.equal(native.publicClient, true);
  assert.equal(native.standardFlowEnabled, true);
  assert.equal(native.implicitFlowEnabled, false);
  assert.equal(native.directAccessGrantsEnabled, false);
  assert.equal(native.fullScopeAllowed, false);
  assert.equal(native.attributes['pkce.code.challenge.method'], 'S256');
  assert.deepEqual(native.redirectUris, ['com.elvorance.rep.staging:/oauth2redirect']);
  assert.deepEqual(native.webOrigins, ['capacitor://localhost', 'https://localhost']);
  assert.deepEqual(native.defaultClientScopes, ['basic', 'profile']);
  assert.deepEqual(native.optionalClientScopes, []);
  const roleMapper = native.protocolMappers.find(
    (mapper) => mapper.name === 'elvorance-api-roles',
  )!;
  assert.equal(
    roleMapper.config['usermodel.clientRoleMapping.clientId'],
    staging.publicConfig.audience,
  );
  assert.equal(roleMapper.config.multivalued, 'true');
  assert.equal(roleMapper.config['claim.name'], 'roles');
  const mappings = staging.realm.clientScopeMappings as Record<string, Array<{ roles: string[] }>>;
  assert.deepEqual(mappings[staging.publicConfig.audience]![0]!.roles, ['rep']);
});

test('optional web client rejects wildcard origins, redirect mismatches and missing explicit origin', () => {
  for (const options of [
    { webRedirectUri: 'https://rep.staging.example/callback' },
    { webRedirectUri: 'https://rep.staging.example/*', webOrigin: 'https://rep.staging.example' },
    {
      webRedirectUri: 'https://attacker.example/callback',
      webOrigin: 'https://rep.staging.example',
    },
    {
      webRedirectUri: 'http://rep.staging.example/callback',
      webOrigin: 'http://rep.staging.example',
    },
    {
      webRedirectUri: 'https://rep.staging.example/callback',
      webOrigin: 'https://rep.staging.example/path',
    },
  ])
    assert.throws(() => createIdentityDefinition({ ...input, ...options }));
  const allowed = createIdentityDefinition({
    ...input,
    webRedirectUri: 'https://rep.staging.example/callback',
    webOrigin: 'https://rep.staging.example',
  });
  const web = allowed.realm.clients.at(-1)!;
  assert.equal(web.clientId, 'elvorance-rep-web-staging');
  assert.deepEqual(web.redirectUris, ['https://rep.staging.example/callback']);
  assert.deepEqual(web.webOrigins, ['https://rep.staging.example']);
});

test('authorization attributes cannot be self-assigned through Keycloak user profile', () => {
  const definition = createIdentityDefinition(input);
  for (const name of ['tenant_id', 'rep_id', 'client_id']) {
    const attribute = definition.userProfile.attributes.find((item) => item.name === name)!;
    assert.deepEqual(attribute.permissions, { view: ['admin'], edit: ['admin'] });
    assert.equal(attribute.multivalued, false);
  }
  assert.equal(definition.userProfile.unmanagedAttributePolicy, 'DISABLED');
  const drift = structuredClone(definition.userProfile);
  drift.attributes.find((item) => item.name === 'tenant_id')!.permissions.edit.push('user');
  assert.throws(() => verifyUserProfile(drift, definition), /policy differs/);
});

test('bootstrap enables only after verified client policy and administrator-owned profile are installed', async () => {
  const definition = createIdentityDefinition(input);
  const mock = mockAdmin(definition);
  assert.deepEqual(await bootstrapIdentity(mock.admin, definition), {
    created: true,
    enabled: true,
  });
  assert.deepEqual(
    mock.calls.map((call) => [call.method, call.path]),
    [
      ['POST', '/admin/realms'],
      ['PUT', '/admin/realms/elvorance-staging/users/profile'],
      ['PUT', '/admin/realms/elvorance-staging'],
    ],
  );
  const count = mock.calls.length;
  assert.deepEqual(await bootstrapIdentity(mock.admin, definition), {
    created: false,
    enabled: true,
  });
  assert.equal(
    mock.calls.length,
    count,
    'Re-running verification must not overwrite a working realm.',
  );
});

test('bootstrap refuses policy drift and keeps an incomplete realm disabled', async () => {
  const definition = createIdentityDefinition(input);
  const mock = mockAdmin(definition);
  mock.driftMapper();
  await assert.rejects(bootstrapIdentity(mock.admin, definition), /policy differs/);
  assert.equal(mock.isEnabled(), false);
  assert.equal(mock.calls.length, 1);
});

test('admin transport pins HTTPS origin, denies redirects and redacts upstream responses', async () => {
  assert.throws(() => createAdminClient('http://identity.example', 'secret-token'));
  let calls = 0;
  const admin = createAdminClient(input.baseUrl, 'secret-token', async (resource, options) => {
    calls++;
    assert.equal(new URL(String(resource)).origin, input.baseUrl);
    assert.equal(options?.redirect, 'error');
    assert.equal(options?.credentials, 'omit');
    return Response.json({ error: 'secret-token diagnostic' }, { status: 403 });
  });
  await assert.rejects(admin.get('/admin/realms/elvorance-staging'), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message.includes('secret-token'), false);
    assert.match(error.message, /HTTP 403/);
    return true;
  });
  await assert.rejects(admin.get('//attacker.example/admin/realms'));
  assert.equal(calls, 1);
});

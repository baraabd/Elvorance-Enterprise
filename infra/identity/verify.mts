import { object, type AdminClient } from './admin-client.mts';
import type { IdentityDefinition, JsonRecord } from './types.mts';

function mismatch(path: string): never {
  throw new Error(
    `Identity policy differs at ${path}; review the configuration before enabling sign-in.`,
  );
}

/** Compares expected security fields, allowing server-generated IDs and read-only metadata. */
export function assertPolicy(actual: unknown, expected: unknown, path: string): void {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) mismatch(path);
    if (expected.every((value) => typeof value === 'string')) {
      if (JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort()))
        mismatch(path);
    } else
      expected.forEach((value, index) => assertPolicy(actual[index], value, `${path}[${index}]`));
    return;
  }
  if (expected !== null && typeof expected === 'object') {
    const item = object(actual, path);
    for (const [key, value] of Object.entries(expected))
      assertPolicy(item[key], value, `${path}.${key}`);
    return;
  }
  if (actual !== expected) mismatch(path);
}

function array(value: unknown, label: string): JsonRecord[] {
  if (!Array.isArray(value)) mismatch(label);
  return value.map((item) => object(item, label));
}

export function verifyRealm(realm: unknown, definition: IdentityDefinition): void {
  const actual = object(realm, 'realm');
  for (const [key, value] of Object.entries(definition.realm)) {
    if (
      ![
        'enabled',
        'clients',
        'roles',
        'clientScopeMappings',
        'defaultDefaultClientScopes',
        'defaultOptionalClientScopes',
        'clientScopes',
      ].includes(key)
    )
      assertPolicy(actual[key], value, `realm.${key}`);
  }
}

export function verifyUserProfile(profile: unknown, definition: IdentityDefinition): void {
  const actual = object(profile, 'user profile');
  assertPolicy(actual.unmanagedAttributePolicy ?? null, null, 'profile.unmanagedAttributePolicy');
  const attributes = array(actual.attributes, 'profile.attributes');
  for (const expected of definition.userProfile.attributes) {
    assertPolicy(
      attributes.find((item) => item.name === expected.name),
      expected,
      `profile.${expected.name}`,
    );
  }
}

export async function verifyClients(
  admin: AdminClient,
  definition: IdentityDefinition,
): Promise<void> {
  const prefix = `/admin/realms/${encodeURIComponent(definition.realm.realm)}`;
  const configuredScopes = array(
    await admin.get(`${prefix}/client-scopes`),
    'configured client scopes',
  );
  for (const expected of array(definition.realm.clientScopes, 'expected client scopes')) {
    const actual = configuredScopes.find((scope) => scope.name === expected.name);
    if (!actual || typeof actual.id !== 'string') mismatch(`scopes.${String(expected.name)}`);
    const details = object(
      await admin.get(`${prefix}/client-scopes/${encodeURIComponent(actual.id)}`),
      'client scope details',
    );
    const { protocolMappers, ...settings } = expected;
    assertPolicy(details, settings, `scopes.${String(expected.name)}`);
    const mappers = array(
      await admin.get(
        `${prefix}/client-scopes/${encodeURIComponent(actual.id)}/protocol-mappers/models`,
      ),
      'scope mappers',
    );
    const expectedMappers = array(protocolMappers, 'expected scope mappers');
    if (mappers.length !== expectedMappers.length)
      mismatch(`scopes.${String(expected.name)}.mappers`);
    for (const mapper of expectedMappers)
      assertPolicy(
        mappers.find((item) => item.name === mapper.name),
        mapper,
        `scopes.${String(expected.name)}.${String(mapper.name)}`,
      );
  }
  for (const [endpoint, key] of [
    ['default-default-client-scopes', 'defaultDefaultClientScopes'],
    ['default-optional-client-scopes', 'defaultOptionalClientScopes'],
  ] as const) {
    const scopes = array(await admin.get(`${prefix}/${endpoint}`), 'realm client scopes');
    assertPolicy(
      scopes.map((scope) => scope.name),
      definition.realm[key],
      `realm.${key}`,
    );
  }
  const found = new Map<string, JsonRecord>();
  for (const expected of definition.realm.clients) {
    const results = array(
      await admin.get(`${prefix}/clients?clientId=${encodeURIComponent(expected.clientId)}`),
      'clients',
    );
    const match = results.find((item) => item.clientId === expected.clientId);
    if (!match || typeof match.id !== 'string' || results.length !== 1)
      mismatch(`clients.${expected.clientId}`);
    const actual = object(
      await admin.get(`${prefix}/clients/${encodeURIComponent(match.id)}`),
      'client details',
    );
    if (typeof actual.id !== 'string' || actual.id !== match.id)
      mismatch(`clients.${expected.clientId}.id`);
    found.set(expected.clientId, actual);
    const { protocolMappers, defaultClientScopes, optionalClientScopes, ...settings } = expected;
    assertPolicy(actual, settings, `clients.${expected.clientId}`);
    for (const [endpoint, expectedScopes] of [
      ['default-client-scopes', defaultClientScopes],
      ['optional-client-scopes', optionalClientScopes],
    ] as const) {
      const scopes = array(
        await admin.get(`${prefix}/clients/${encodeURIComponent(match.id)}/${endpoint}`),
        'client scopes',
      );
      assertPolicy(
        scopes.map((scope) => scope.name),
        expectedScopes,
        `${expected.clientId}.${endpoint}`,
      );
    }
    const mappers = array(actual.protocolMappers ?? [], 'protocol mappers');
    if (mappers.length !== protocolMappers.length)
      mismatch(`clients.${expected.clientId}.protocolMappers`);
    for (const mapper of protocolMappers) {
      assertPolicy(
        mappers.find((item) => item.name === mapper.name),
        mapper,
        `clients.${expected.clientId}.mappers.${mapper.name}`,
      );
    }
  }
  const api = found.get(definition.publicConfig.audience)!;
  const apiPath = `${prefix}/clients/${encodeURIComponent(String(api.id))}`;
  const apiRoles = array(await admin.get(`${apiPath}/roles`), 'API roles');
  const rolesByClient = object(object(definition.realm.roles, 'roles').client, 'client roles');
  const expectedRoles = array(
    rolesByClient[definition.publicConfig.audience],
    'expected API roles',
  );
  assertPolicy(
    apiRoles.map((role) => role.name).sort(),
    expectedRoles.map((role) => role.name).sort(),
    'API role allowlist',
  );
  for (const role of apiRoles) if (role.composite !== false) mismatch('API role composites');
  for (const expected of definition.realm.clients.filter((item) => !item.bearerOnly)) {
    const client = found.get(expected.clientId)!;
    const scopes = array(
      await admin.get(
        `${prefix}/clients/${encodeURIComponent(String(client.id))}/scope-mappings/clients/${encodeURIComponent(String(api.id))}`,
      ),
      'role scopes',
    );
    const scopedClients = array(
      object(definition.realm.clientScopeMappings, 'scope mappings')[
        definition.publicConfig.audience
      ],
      'client scope mappings',
    );
    const expectedScope = scopedClients.find((item) => item.client === expected.clientId);
    if (!expectedScope) mismatch(`${expected.clientId}.allowedRoles`);
    assertPolicy(
      scopes.map((role) => role.name),
      expectedScope.roles,
      `${expected.clientId}.allowedRoles`,
    );
  }
}

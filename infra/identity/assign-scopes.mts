import { object, type AdminClient } from './admin-client.mts';
import type { IdentityDefinition, JsonRecord } from './types.mts';

function list(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) throw new Error('Invalid identity client scope response.');
  return value.map((item) => object(item, 'scope'));
}

/** Keycloak creates an offline_access default scope even during minimal realm import.
 * Reconcile only assignments on a disabled, repository-owned realm before its first login.
 */
export async function assignInitialScopes(
  admin: AdminClient,
  definition: IdentityDefinition,
): Promise<void> {
  const prefix = `/admin/realms/${encodeURIComponent(definition.realm.realm)}`;
  const available = list(await admin.get(`${prefix}/client-scopes`));
  async function assign(path: string, desired: readonly string[]) {
    const current = list(await admin.get(path));
    for (const scope of current) {
      if (typeof scope.name !== 'string' || typeof scope.id !== 'string')
        throw new Error('Invalid identity scope identifier.');
      if (!desired.includes(scope.name))
        await admin.remove(`${path}/${encodeURIComponent(scope.id)}`);
    }
    for (const name of desired) {
      if (current.some((scope) => scope.name === name)) continue;
      const scope = available.find((item) => item.name === name);
      if (!scope || typeof scope.id !== 'string')
        throw new Error('A declared identity scope was not imported.');
      await admin.write('PUT', `${path}/${encodeURIComponent(scope.id)}`, undefined);
    }
  }
  await assign(
    `${prefix}/default-default-client-scopes`,
    definition.realm.defaultDefaultClientScopes as string[],
  );
  await assign(
    `${prefix}/default-optional-client-scopes`,
    definition.realm.defaultOptionalClientScopes as string[],
  );
  for (const client of definition.realm.clients) {
    const matches = list(
      await admin.get(`${prefix}/clients?clientId=${encodeURIComponent(client.clientId)}`),
    );
    const actual = matches.find((item) => item.clientId === client.clientId);
    if (matches.length !== 1 || !actual || typeof actual.id !== 'string')
      throw new Error('A declared identity client was not imported.');
    const path = `${prefix}/clients/${encodeURIComponent(actual.id)}`;
    await assign(`${path}/default-client-scopes`, client.defaultClientScopes);
    await assign(`${path}/optional-client-scopes`, client.optionalClientScopes);
  }
}

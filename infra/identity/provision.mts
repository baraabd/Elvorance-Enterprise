import { object, type AdminClient } from './admin-client.mts';
import { verifyClients, verifyRealm, verifyUserProfile } from './verify.mts';
import type { IdentityDefinition } from './types.mts';
import { assignInitialScopes } from './assign-scopes.mts';

/** Import disabled, secure the user schema, verify policy, and only then enable the realm. */
export async function bootstrapIdentity(
  admin: AdminClient,
  definition: IdentityDefinition,
): Promise<{ created: boolean; enabled: true }> {
  const path = `/admin/realms/${encodeURIComponent(definition.realm.realm)}`;
  const exists = await admin.exists(path);
  if (!exists) await admin.write('POST', '/admin/realms', definition.realm);
  const realm = object(await admin.get(path), 'realm');
  verifyRealm(realm, definition);
  if (realm.enabled === false) await assignInitialScopes(admin, definition);
  await verifyClients(admin, definition);
  if (realm.enabled === false) {
    await admin.write('PUT', `${path}/users/profile`, definition.userProfile);
  } else if (realm.enabled !== true) {
    throw new Error('Identity realm returned an invalid enabled state.');
  }
  verifyUserProfile(await admin.get(`${path}/users/profile`), definition);
  if (realm.enabled === false) await admin.write('PUT', path, { enabled: true });
  const verified = object(await admin.get(path), 'realm');
  if (verified.enabled !== true) throw new Error('Identity realm could not be enabled.');
  verifyRealm(verified, definition);
  return { created: !exists, enabled: true };
}

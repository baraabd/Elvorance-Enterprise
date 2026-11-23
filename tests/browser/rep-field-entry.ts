/** Test-only entrypoint. Production authentication is deliberately not simulated as evidence. */
import { mountRepWorkspace } from '../../apps/rep-mobile/src/server/workspace.ts';
import { createRepApi } from '../../apps/rep-mobile/src/server/api.ts';
import { mountLiveWorkspace } from '../../packages/api-client/src/live-workspace.ts';
import type { MobileAuth, AuthSessionSnapshot } from '../../packages/mobile-auth/src/types.ts';
import '../../apps/rep-mobile/src/server/styles.css';

async function start(): Promise<void> {
  if (location.hostname !== '127.0.0.1')
    throw new Error('Synthetic browser fixture requires loopback.');
  const root = document.getElementById('app');
  const role = new URL(location.href).searchParams.get('role');
  if (!root || (role !== 'rep' && role !== 'admin' && role !== 'client'))
    throw new Error('Invalid synthetic fixture role.');
  const accessToken = async () => role;
  if (role === 'rep') {
    const session: AuthSessionSnapshot = {
      status: 'authenticated',
      subject: 'rep-user-a',
      expiresAt: null,
    };
    const auth: MobileAuth = {
      initialize: async () => session,
      signIn: async () => session,
      getAccessToken: accessToken,
      signOut: async () => ({ revoked: true }),
      onSessionChanged: () => () => {},
      dispose: async () => {},
    };
    await mountRepWorkspace(
      root,
      createRepApi({ baseUrl: location.origin, accessToken }),
      auth,
      'synthetic-browser-test',
      new AbortController().signal,
    );
  } else {
    await mountLiveWorkspace({ root, role, baseUrl: location.origin, accessToken });
  }
  document.body.dataset.ready = 'true';
}
void start().catch((error: unknown) => {
  document.body.dataset.failure = 'true';
  throw error;
});

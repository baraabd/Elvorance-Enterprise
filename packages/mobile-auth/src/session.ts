import { binding, matchesRedirect, validateConfig } from './configuration.ts';
import { AuthError, safeAuthError } from './errors.ts';
import { OidcProtocol } from './oidc.ts';
import { SessionVault } from './vault.ts';
import type {
  AuthDependencies,
  AuthSessionSnapshot,
  MobileAuth,
  MobileAuthConfig,
  SignOutResult,
  StoredSession,
  ValidatedTokens,
} from './types.ts';

const REFRESH_AHEAD_MS = 30_000;
const signedOut = (): AuthSessionSnapshot =>
  Object.freeze({
    status: 'signed-out',
    subject: null,
    expiresAt: null,
  });

/** One coordinator per app process serializes credentials; feature modules only request access tokens. */
export function createAuthSession(
  input: MobileAuthConfig,
  dependencies: AuthDependencies,
): MobileAuth {
  const config = validateConfig(input);
  const now = dependencies.now ?? Date.now;
  const vault = new SessionVault(dependencies.storage, config, now);
  const protocol = new OidcProtocol(config, dependencies.fetch ?? globalThis.fetch, now);
  const listeners = new Set<(session: AuthSessionSnapshot) => void>();
  let snapshot = signedOut();
  let generation = 0;
  let disposed = false;
  let initialized = false;
  let stored: StoredSession | null = null;
  let tokens: ValidatedTokens | null = null;
  let initializePromise: Promise<AuthSessionSnapshot> | null = null;
  let signInPromise: Promise<AuthSessionSnapshot> | null = null;
  let refreshPromise: Promise<ValidatedTokens> | null = null;
  let callbackPromise: Promise<AuthSessionSnapshot> | null = null;
  let logoutPromise: Promise<SignOutResult> | null = null;
  let removeCallback: (() => Promise<void>) | null = null;

  function active() {
    if (disposed) throw new AuthError('disposed');
  }

  function current(revision: number) {
    return !disposed && revision === generation;
  }

  function check(revision: number) {
    if (!current(revision)) throw new AuthError('operation_cancelled');
  }

  function publish(status: AuthSessionSnapshot['status']) {
    snapshot = Object.freeze({
      status,
      subject: status === 'signed-out' ? null : (tokens?.subject ?? stored?.subject ?? null),
      expiresAt: tokens?.expiresAt ?? null,
    });
    for (const listener of listeners) {
      // A UI subscriber must not prevent secure state transitions or other subscribers.
      try {
        listener(snapshot);
      } catch {
        /* UI errors contain no authentication state. */
      }
    }
  }

  async function accept(result: ValidatedTokens, revision: number): Promise<void> {
    try {
      check(revision);
      if (!result.refreshToken) throw new AuthError('invalid_response');
      const next: StoredSession = {
        version: 1,
        ...binding(config),
        subject: result.subject,
        refreshToken: result.refreshToken,
        nonce: result.nonce,
        authTime: result.authTime,
      };
      // Durable rotation is committed before any API consumer receives the access token.
      await vault.save('auth-session', next, () => current(revision));
      check(revision);
      stored = next;
      tokens = result;
      publish('authenticated');
    } catch (error) {
      if (result.refreshToken) await protocol.revoke(result.refreshToken);
      throw safeAuthError(error, 'secure_storage_unavailable');
    }
  }

  function refresh(): Promise<ValidatedTokens> {
    if (refreshPromise) return refreshPromise;
    if (!stored) return Promise.reject(new AuthError('session_expired'));
    const previous = stored;
    const revision = generation;
    publish('refreshing');
    refreshPromise = (async () => {
      try {
        const result = await protocol.refresh(previous);
        await accept(result, revision);
        return result;
      } catch (error) {
        const safe = safeAuthError(error, 'invalid_response');
        if (current(revision)) {
          tokens = null;
          if (safe.code === 'network_unavailable') {
            publish('unavailable');
          } else {
            stored = null;
            await vault.clear();
            publish(safe.code === 'secure_storage_unavailable' ? 'unavailable' : 'signed-out');
          }
        }
        throw safe;
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }

  function completeCallback(callback: string, revision: number): Promise<AuthSessionSnapshot> {
    if (callbackPromise) return callbackPromise;
    callbackPromise = (async () => {
      // Remove authorization codes from the web address bar even for expired/invalid callbacks.
      dependencies.browser.clearCallback();
      const transaction = await vault.transaction();
      check(revision);
      if (!transaction) throw new AuthError('invalid_transaction');
      // Consume the verifier exactly once, including when the provider returns an error.
      await vault.remove('auth-transaction');
      check(revision);
      const result = await protocol.exchange(callback, transaction);
      await accept(result, revision);
      return snapshot;
    })().finally(() => {
      callbackPromise = null;
    });
    return callbackPromise;
  }

  async function handleIncoming(callback: string) {
    if (disposed || signInPromise || !matchesRedirect(callback, config.redirectUri)) return;
    const revision = generation;
    try {
      if (!(await vault.transaction())) return; // Ignore repeated app links after consumption.
      await completeCallback(callback, revision);
    } catch {
      if (current(revision)) {
        tokens = null;
        stored = null;
        await vault.clear().catch(() => undefined);
        publish('unavailable');
      }
    }
  }

  const client: MobileAuth = {
    async initialize() {
      active();
      if (logoutPromise) await logoutPromise;
      if (initialized) return snapshot;
      if (initializePromise) return initializePromise;
      const revision = generation;
      initializePromise = (async () => {
        try {
          removeCallback = await dependencies.browser.onCallback((url) => {
            // Initialization processes a launch URL first; later native links are recovered in order.
            void client
              .initialize()
              .then(() => handleIncoming(url))
              .catch(() => undefined);
          });
          check(revision);
          const launchUrl = await dependencies.browser.getLaunchUrl();
          check(revision);
          if (
            launchUrl &&
            matchesRedirect(launchUrl, config.redirectUri) &&
            ['state', 'code', 'error', 'iss'].some((name) =>
              new URL(launchUrl).searchParams.has(name),
            )
          ) {
            return await completeCallback(launchUrl, revision);
          }
          // An interrupted browser flow cannot be silently resumed without its validated callback.
          await vault.remove('auth-transaction');
          const previous = await vault.session();
          check(revision);
          stored = previous;
          if (stored) {
            try {
              await refresh();
            } catch (error) {
              if (!(error instanceof AuthError && error.code === 'session_expired')) throw error;
            }
          }
          return snapshot;
        } catch (error) {
          if (current(revision)) {
            tokens = null;
            publish('unavailable');
          }
          throw safeAuthError(error, 'secure_storage_unavailable');
        } finally {
          if (current(revision)) initialized = true;
          initializePromise = null;
        }
      })();
      return initializePromise;
    },

    async signIn() {
      active();
      if (logoutPromise) await logoutPromise;
      if (signInPromise) return signInPromise;
      const requestedGeneration = generation;
      signInPromise = (async () => {
        // A previous failed refresh should not prevent a fresh interactive sign-in.
        try {
          await client.initialize();
        } catch (error) {
          if (
            !(error instanceof AuthError) ||
            ![
              'session_expired',
              'invalid_response',
              'invalid_transaction',
              'network_unavailable',
            ].includes(error.code)
          )
            throw error;
        }
        check(requestedGeneration);
        if (tokens && tokens.expiresAt > now() + REFRESH_AHEAD_MS) return snapshot;
        const revision = ++generation;
        tokens = null;
        stored = null;
        publish('signing-in');
        try {
          await vault.clear();
          check(revision);
          const request = await protocol.authorization();
          await vault.save('auth-transaction', request.transaction, () => current(revision));
          check(revision);
          const callback = await dependencies.browser.authorize(request.url, config.redirectUri);
          check(revision);
          if (callback === undefined) return snapshot; // Web navigation is in progress.
          if (!matchesRedirect(callback, config.redirectUri))
            throw new AuthError('invalid_transaction');
          return await completeCallback(callback, revision);
        } catch (error) {
          if (current(revision)) {
            await vault.remove('auth-transaction');
            publish('signed-out');
          }
          throw safeAuthError(error, 'operation_cancelled');
        }
      })().finally(() => {
        signInPromise = null;
      });
      return signInPromise;
    },

    async getAccessToken() {
      active();
      await client.initialize();
      if (logoutPromise || signInPromise) return null;
      if (tokens && tokens.expiresAt > now() + REFRESH_AHEAD_MS) return tokens.accessToken;
      if (!stored) return null;
      const revision = generation;
      const refreshed = await refresh();
      return current(revision) ? refreshed.accessToken : null;
    },

    async signOut() {
      active();
      if (logoutPromise) return logoutPromise;
      ++generation;
      const previous = stored;
      tokens = null;
      stored = null;
      initialized = true;
      publish('signed-out');
      logoutPromise = (async () => {
        // Cancellation failure never prevents deleting local credentials.
        const cancellation = dependencies.browser.cancelAuthorization().catch(() => undefined);
        const saved = previous ?? (await vault.session());
        await vault.clear();
        await cancellation;
        const revoked = saved ? await protocol.revoke(saved.refreshToken) : true;
        return Object.freeze({ revoked });
      })()
        .catch((error: unknown) => {
          publish('unavailable');
          throw safeAuthError(error, 'secure_storage_unavailable');
        })
        .finally(() => {
          logoutPromise = null;
        });
      return logoutPromise;
    },

    onSessionChanged(listener) {
      active();
      listeners.add(listener);
      listener(snapshot);
      return () => {
        listeners.delete(listener);
      };
    },

    async dispose() {
      if (disposed) return;
      disposed = true;
      ++generation;
      tokens = null;
      stored = null;
      listeners.clear();
      await dependencies.browser.cancelAuthorization().catch(() => undefined);
      await removeCallback?.();
      removeCallback = null;
    },
  };
  return client;
}

import { App } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { nativeRedirects, matchesRedirect, type ValidatedConfig } from './configuration.ts';
import { AuthError, safeAuthError } from './errors.ts';
import type { AuthDependencies, AuthStorageKey } from './types.ts';

interface NativeAuthBridge {
  get(options: { key: AuthStorageKey }): Promise<{ value: string | null }>;
  set(options: { key: AuthStorageKey; value: string }): Promise<void>;
  remove(options: { key: AuthStorageKey }): Promise<void>;
  authorize(options: { url: string; redirectUri: string }): Promise<{ callbackUrl: string }>;
  cancelAuthorization(): Promise<void>;
}

const bridge = registerPlugin<NativeAuthBridge>('ElvoranceAuthBridge');

function nativePorts(config: ValidatedConfig): AuthDependencies {
  if (!Capacitor.isPluginAvailable('ElvoranceAuthBridge')) {
    throw new AuthError('native_bridge_unavailable');
  }
  if (!nativeRedirects(config.environment).includes(config.redirectUri))
    throw new AuthError('invalid_configuration');
  return {
    storage: {
      async get(key) {
        return (await bridge.get({ key })).value;
      },
      async set(key, value) {
        await bridge.set({ key, value });
      },
      async remove(key) {
        await bridge.remove({ key });
      },
    },
    browser: {
      async authorize(url, redirectUri) {
        try {
          return (await bridge.authorize({ url, redirectUri })).callbackUrl;
        } catch (error) {
          throw safeAuthError(error, 'operation_cancelled');
        }
      },
      async getLaunchUrl() {
        return (await App.getLaunchUrl())?.url ?? null;
      },
      async onCallback(listener) {
        const handle = await App.addListener('appUrlOpen', ({ url }) => listener(url));
        return () => handle.remove();
      },
      clearCallback() {
        /* Native callbacks are never placed in the WebView URL. */
      },
      async cancelAuthorization() {
        await bridge.cancelAuthorization();
      },
    },
  };
}

function webPorts(config: ValidatedConfig): AuthDependencies {
  if (
    typeof window === 'undefined' ||
    new URL(config.redirectUri).origin !== window.location.origin
  ) {
    throw new AuthError('invalid_configuration');
  }
  // Bearer/refresh tokens live only in memory on the web. Only a short-lived PKCE transaction
  // survives full-page authorization navigation; it is consumed on the first callback.
  let memorySession: string | null = null;
  const transactionKey = `elvorance.oidc.transaction:${config.environment}:${config.clientId}`;
  return {
    storage: {
      async get(key) {
        return key === 'auth-session'
          ? memorySession
          : window.sessionStorage.getItem(transactionKey);
      },
      async set(key, value) {
        if (key === 'auth-session') memorySession = value;
        else window.sessionStorage.setItem(transactionKey, value);
      },
      async remove(key) {
        if (key === 'auth-session') memorySession = null;
        else window.sessionStorage.removeItem(transactionKey);
      },
    },
    browser: {
      async authorize(url) {
        window.location.assign(url);
        return undefined;
      },
      async getLaunchUrl() {
        return window.location.href;
      },
      async onCallback() {
        return async () => {};
      },
      clearCallback() {
        if (matchesRedirect(window.location.href, config.redirectUri)) {
          window.history.replaceState(null, '', config.redirectUri);
        }
      },
      async cancelAuthorization() {
        /* Full-document navigation has no retained browser session. */
      },
    },
  };
}

export function createPlatformDependencies(config: ValidatedConfig): AuthDependencies {
  return Capacitor.isNativePlatform() ? nativePorts(config) : webPorts(config);
}

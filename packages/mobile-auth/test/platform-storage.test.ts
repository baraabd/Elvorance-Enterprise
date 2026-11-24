import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlatformDependencies } from '../src/platform.ts';
import { validateConfig } from '../src/configuration.ts';

const webConfig = {
  issuer: 'https://identity.example.test/realms/elvorance-staging',
  environment: 'staging' as const,
  clientId: 'elvorance-client-web-staging',
  redirectUri: 'https://client.example.test/callback',
};
test('S03 web sessions never enter Web Storage; only scoped PKCE transaction survives navigation', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const persisted = new Map<string, string>();
  let replaced = '';
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        origin: 'https://client.example.test',
        href: webConfig.redirectUri + '?code=synthetic&state=synthetic',
      },
      sessionStorage: {
        getItem: (key: string) => persisted.get(key) ?? null,
        setItem: (key: string, value: string) => {
          persisted.set(key, value);
        },
        removeItem: (key: string) => {
          persisted.delete(key);
        },
      },
      get localStorage() {
        throw new Error('Authentication must not access localStorage');
      },
      history: {
        replaceState: (_state: unknown, _title: string, url: string) => {
          replaced = url;
        },
      },
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  const config = validateConfig(webConfig);
  const first = createPlatformDependencies(config);
  await first.storage.set('auth-session', 'synthetic-refresh-credential');
  assert.equal(await first.storage.get('auth-session'), 'synthetic-refresh-credential');
  assert.equal(persisted.size, 0);
  await first.storage.set('auth-transaction', 'synthetic-pkce-transaction');
  assert.equal(persisted.size, 1);
  assert.equal(JSON.stringify([...persisted]).includes('synthetic-refresh-credential'), false);
  const reloaded = createPlatformDependencies(config);
  assert.equal(await reloaded.storage.get('auth-session'), null);
  assert.equal(await reloaded.storage.get('auth-transaction'), 'synthetic-pkce-transaction');
  const differentClient = createPlatformDependencies(
    validateConfig({ ...webConfig, clientId: 'different-registered-client' }),
  );
  assert.equal(await differentClient.storage.get('auth-transaction'), null);
  await reloaded.storage.remove('auth-transaction');
  await first.storage.remove('auth-session');
  assert.equal(persisted.size, 0);
  assert.equal(await first.storage.get('auth-session'), null);
  reloaded.browser.clearCallback();
  assert.equal(replaced, webConfig.redirectUri);
});
test('S03 both native applications accept only their environment-specific registered callback shapes', () => {
  for (const app of ['rep', 'client']) {
    for (const environment of ['staging', 'production'] as const) {
      const suffix = environment === 'staging' ? '.staging' : '';
      const good = {
        ...webConfig,
        environment,
        clientId: `elvorance-${app}-${environment}`,
        redirectUri: `com.elvorance.${app}${suffix}:/oauth2redirect`,
      };
      assert.doesNotThrow(() => validateConfig(good));
      for (const redirectUri of [
        `com.elvorance.${app}${suffix}://attacker/oauth2redirect`,
        `com.elvorance.${app}${suffix}:/%6fauth2redirect`,
        `com.elvorance.${app}${suffix}:/oauth2redirect?injected=1`,
        `com.elvorance.${app}${suffix ? '' : '.staging'}:/oauth2redirect`,
        'com.untrusted.app:/oauth2redirect',
      ])
        assert.throws(() => validateConfig({ ...good, redirectUri }));
    }
  }
});

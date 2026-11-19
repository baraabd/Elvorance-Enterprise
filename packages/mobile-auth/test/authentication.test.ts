import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthError } from '../src/errors.ts';
import { matchesRedirect, validateConfig } from '../src/configuration.ts';
import { config, deferred, harness } from './fixtures.ts';

const errorCode = (code: string) => (error: unknown) =>
  error instanceof AuthError && error.code === code;

test('code + S256 + state + nonce verifies a real RS256 signature and stores refresh credentials only', async () => {
  const h = harness();
  const snapshots: unknown[] = [];
  h.client.onSessionChanged((session) => snapshots.push(session));
  assert.equal((await h.client.initialize()).status, 'signed-out');
  assert.equal((await h.client.signIn()).status, 'authenticated');
  assert.equal(await h.client.getAccessToken(), 'access-1');
  assert.equal(h.store.data.has('auth-transaction'), false);
  const saved = JSON.parse(h.store.data.get('auth-session')!);
  assert.equal(saved.refreshToken, 'refresh-1');
  assert.equal(saved.accessToken, undefined);
  assert.equal(saved.idToken, undefined);
  assert.equal(saved.environment, 'staging');
  assert.equal(JSON.stringify(snapshots).includes('access-'), false);
  assert.equal(JSON.stringify(snapshots).includes('refresh-'), false);
  await h.client.dispose();
});

test('rejects insecure issuers, mixed environment schemes, embedded credentials and unsafe redirects', () => {
  const patches = [
    { issuer: 'http://identity.example/realms/staging' },
    { issuer: 'https://user:pass@identity.example/' },
    { issuer: `${config.issuer}?tenant=other` },
    { redirectUri: 'com.elvorance.rep:/oauth2redirect' },
    { redirectUri: 'com.elvorance.rep.staging://oauth2redirect' },
    { redirectUri: `${config.redirectUri}#callback` },
    { redirectUri: 'http://app.example/callback' },
    { scopes: ['profile'] },
    { scopes: ['openid', 'profile injected'] },
  ];
  for (const patch of patches)
    assert.throws(
      () => validateConfig({ ...config, ...patch }),
      errorCode('invalid_configuration'),
    );
  assert.equal(matchesRedirect(`${config.redirectUri}?state=s`, config.redirectUri), true);
  assert.equal(matchesRedirect(`${config.redirectUri}/?state=s`, config.redirectUri), false);
  assert.equal(matchesRedirect(`${config.redirectUri}?state=s#token=t`, config.redirectUri), false);
});

test('rejects altered state, duplicate state, callback issuer and callback path before exchanging code', async () => {
  for (const mutate of [
    (url: URL) => {
      url.searchParams.set('state', 'wrong');
    },
    (url: URL) => {
      url.searchParams.append('state', 'duplicate');
    },
    (url: URL) => {
      url.searchParams.set('iss', 'https://attacker.example');
    },
    (url: URL) => {
      url.searchParams.delete('iss');
    },
    (url: URL) => {
      url.pathname = '/wrong';
    },
  ]) {
    const h = harness();
    h.transformCallback((value) => {
      const url = new URL(value);
      mutate(url);
      return url.href;
    });
    await assert.rejects(h.client.signIn(), (error: unknown) => error instanceof AuthError);
    assert.equal(h.provider.tokenCalls, 0);
    assert.equal(h.store.data.size, 0);
  }
});

test('rejects forged JWT signatures, wrong nonce/issuer/audience/azp, expired and future ID tokens', async () => {
  const patches = [
    { nonce: 'wrong-nonce' },
    { iss: 'https://attacker.example' },
    { aud: 'other-client' },
    { aud: [config.clientId, 'other-client'], azp: 'other-client' },
    { exp: Math.floor(Date.now() / 1000) - 60 },
    { iat: Math.floor(Date.now() / 1000) + 600 },
    { sub: '' },
  ];
  for (const patch of patches) {
    const h = harness();
    h.provider.claimsPatch = patch;
    await assert.rejects(h.client.signIn(), errorCode('invalid_response'));
    assert.equal(h.store.data.size, 0);
  }
  const h = harness();
  h.provider.wrongSignature = true;
  await assert.rejects(h.client.signIn(), errorCode('invalid_response'));
  assert.equal(h.store.data.size, 0);
});

test('pins discovery issuer, S256, signed ID token algorithm and all endpoint origins', async () => {
  for (const patch of [
    { issuer: 'https://attacker.example' },
    { token_endpoint: 'https://attacker.example/token' },
    { authorization_endpoint: 'https://attacker.example/auth' },
    { jwks_uri: 'https://attacker.example/certs' },
    { revocation_endpoint: 'https://attacker.example/revoke' },
    { token_endpoint: `${config.issuer}/token?redirect=https://attacker.example` },
    { code_challenge_methods_supported: ['plain'] },
    { id_token_signing_alg_values_supported: ['HS256'] },
    { authorization_response_iss_parameter_supported: false },
  ]) {
    const h = harness();
    h.provider.metadataPatch = patch;
    await assert.rejects(h.client.signIn(), (error: unknown) => error instanceof AuthError);
    assert.equal(h.provider.authorizationCount, 0);
    assert.equal(h.provider.tokenCalls, 0);
  }
});

test('parallel API requests refresh exactly once and commit the rotated refresh credential', async () => {
  const h = harness();
  await h.client.signIn();
  h.advance(40_000);
  const results = await Promise.all(Array.from({ length: 20 }, () => h.client.getAccessToken()));
  assert.deepEqual([...new Set(results)], ['access-2']);
  assert.equal(h.provider.refreshCalls, 1);
  assert.equal(JSON.parse(h.store.data.get('auth-session')!).refreshToken, 'refresh-2');
});

test('restoring a stored session always obtains freshly verified tokens from the issuer', async () => {
  const h = harness();
  await h.client.signIn();
  await h.client.dispose();
  const restarted = h.create();
  assert.equal((await restarted.initialize()).status, 'authenticated');
  assert.equal(await restarted.getAccessToken(), 'access-2');
  assert.equal(h.provider.refreshCalls, 1);
});

test('invalid_grant deletes the local session; rotated-token replay is not silently retried', async () => {
  const h = harness();
  await h.client.signIn();
  h.advance(40_000);
  h.provider.invalidGrant = true;
  await assert.rejects(h.client.getAccessToken(), errorCode('session_expired'));
  assert.equal(h.store.data.size, 0);
  assert.equal(await h.client.getAccessToken(), null);
  assert.equal(h.provider.refreshCalls, 1);
});

test('refresh rejects missing rotation, changed subject and changed nonce', async () => {
  for (const mode of ['rotation', 'subject', 'nonce']) {
    const h = harness();
    await h.client.signIn();
    h.advance(40_000);
    if (mode === 'rotation') h.provider.keepRefresh = true;
    if (mode === 'subject') h.provider.claimsPatch = { sub: 'another-user' };
    if (mode === 'nonce') h.provider.claimsPatch = { nonce: 'new-nonce' };
    await assert.rejects(h.client.getAccessToken(), errorCode('invalid_response'));
    assert.equal(h.store.data.size, 0);
  }
});

test('offline refresh never yields an expired access token and can recover after connectivity returns', async () => {
  const h = harness();
  await h.client.signIn();
  h.advance(70_000);
  h.provider.failNetwork = true;
  await assert.rejects(h.client.getAccessToken(), errorCode('network_unavailable'));
  assert.ok(h.store.data.has('auth-session'));
  h.provider.failNetwork = false;
  assert.equal(await h.client.getAccessToken(), 'access-2');
});

test('logout during an in-flight refresh cannot resurrect tokens and revokes the late result', async () => {
  const h = harness();
  await h.client.signIn();
  h.advance(40_000);
  const entered = deferred<void>();
  const release = deferred<void>();
  h.provider.beforeToken = async () => {
    entered.resolve();
    await release.promise;
  };
  const refreshing = h.client.getAccessToken();
  const rejection = assert.rejects(refreshing, errorCode('operation_cancelled'));
  await entered.promise;
  await h.client.signOut();
  release.resolve();
  await rejection;
  assert.equal(h.store.data.size, 0);
  assert.equal(await h.client.getAccessToken(), null);
  assert.ok(h.provider.revoked.includes('refresh-1'));
  assert.ok(h.provider.revoked.includes('refresh-2'));
});

test('logout while secure storage commits removes the late write before completion', async () => {
  const h = harness();
  await h.client.signIn();
  h.advance(40_000);
  const entered = deferred<void>();
  const release = deferred<void>();
  h.store.beforeSet = async (key) => {
    if (key === 'auth-session') {
      entered.resolve();
      await release.promise;
    }
  };
  const refreshing = h.client.getAccessToken();
  const rejection = assert.rejects(refreshing, errorCode('operation_cancelled'));
  await entered.promise;
  const logout = h.client.signOut();
  release.resolve();
  await Promise.all([logout, rejection]);
  assert.equal(h.store.data.size, 0);
  assert.equal(await h.client.getAccessToken(), null);
});

test('native storage failure is redacted and fails closed before exposing an access token', async () => {
  const h = harness();
  h.store.beforeSet = async (key) => {
    if (key === 'auth-session') h.store.failWrites = true;
  };
  await assert.rejects(h.client.signIn(), (error: unknown) => {
    assert.ok(error instanceof AuthError);
    assert.equal(error.code, 'secure_storage_unavailable');
    assert.equal(error.message.includes('diagnostic'), false);
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.equal(await h.client.getAccessToken(), null);
  assert.ok(h.provider.revoked.includes('refresh-1'));
});

test('logout deletes local credentials when the revocation server is unavailable', async () => {
  const h = harness();
  await h.client.signIn();
  h.provider.failRevocation = true;
  assert.deepEqual(await h.client.signOut(), { revoked: false });
  assert.equal(h.store.data.size, 0);
  assert.equal(await h.client.getAccessToken(), null);
});

test('corrupt and cross-environment stored records never restore a session', async () => {
  for (const raw of [
    '{broken',
    JSON.stringify({ version: 1, ...config, environment: 'production', refreshToken: 'stolen' }),
  ]) {
    const h = harness();
    h.store.data.set('auth-session', raw);
    assert.equal((await h.client.initialize()).status, 'signed-out');
    assert.equal(h.store.data.size, 0);
    assert.equal(h.provider.tokenCalls, 0);
  }
});

test('Android cold-start callback consumes the saved transaction exactly once', async () => {
  const h = harness();
  let callback = '';
  h.browser.authorize = async (url) => {
    callback = h.provider.authorize(url);
    return undefined;
  };
  await h.client.signIn();
  assert.ok(h.store.data.has('auth-transaction'));
  await h.client.dispose();
  h.launch(callback);
  const restarted = h.create();
  assert.equal((await restarted.initialize()).status, 'authenticated');
  assert.equal(await restarted.getAccessToken(), 'access-1');
  assert.equal(h.store.data.has('auth-transaction'), false);
  h.emitCallback(callback);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(h.provider.tokenCalls, 1);
});

test('expired sign-in transactions and interrupted sign-in do not create sessions', async () => {
  for (const expired of [false, true]) {
    const h = harness();
    let callback = '';
    h.browser.authorize = async (url) => {
      callback = h.provider.authorize(url);
      return undefined;
    };
    await h.client.signIn();
    await h.client.dispose();
    if (expired) {
      h.advance(6 * 60 * 1000);
      h.launch(callback);
    }
    const restarted = h.create();
    if (expired) await assert.rejects(restarted.initialize(), errorCode('invalid_transaction'));
    else assert.equal((await restarted.initialize()).status, 'signed-out');
    assert.equal(h.provider.tokenCalls, 0);
    assert.equal(h.store.data.size, 0);
  }
});

test('logout during sign-in initialization cancels the pending interactive operation', async () => {
  const h = harness();
  const entered = deferred<void>();
  const release = deferred<void>();
  h.browser.getLaunchUrl = async () => {
    entered.resolve();
    await release.promise;
    return null;
  };
  const login = h.client.signIn();
  const rejection = assert.rejects(login, errorCode('operation_cancelled'));
  await entered.promise;
  await h.client.signOut();
  release.resolve();
  await rejection;
  assert.equal(h.provider.authorizationCount, 0);
  assert.equal(h.store.data.size, 0);
});

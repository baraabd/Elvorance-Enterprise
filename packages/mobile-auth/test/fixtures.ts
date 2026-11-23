import assert from 'node:assert/strict';
import { createAuthSession } from '../src/session.ts';
import type {
  AuthStorage,
  AuthStorageKey,
  AuthorizationBrowser,
  MobileAuthConfig,
} from '../src/types.ts';

export const config: MobileAuthConfig = {
  issuer: 'https://identity.example/realms/elvorance-staging',
  clientId: 'elvorance-rep-staging',
  redirectUri: 'com.elvorance.rep.staging:/oauth2redirect',
  environment: 'staging',
};

const algorithm: RsaHashedKeyGenParams = {
  name: 'RSASSA-PKCS1-v1_5',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
};
const signingKey = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
const wrongKey = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
const publicKey = await crypto.subtle.exportKey('jwk', signingKey.publicKey);
const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

async function signedJwt(claims: Record<string, unknown>, wrong: boolean): Promise<string> {
  const payload = `${encoded({ alg: 'RS256', typ: 'JWT', kid: 'test-key' })}.${encoded(claims)}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    (wrong ? wrongKey : signingKey).privateKey,
    new TextEncoder().encode(payload),
  );
  return `${payload}.${Buffer.from(signature).toString('base64url')}`;
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export class MemorySecureStore implements AuthStorage {
  readonly data = new Map<AuthStorageKey, string>();
  failWrites = false;
  failDeletes = false;
  beforeSet: ((key: AuthStorageKey) => Promise<void>) | null = null;
  async get(key: AuthStorageKey) {
    return this.data.get(key) ?? null;
  }
  async set(key: AuthStorageKey, value: string) {
    if (this.beforeSet) await this.beforeSet(key);
    if (this.failWrites) throw new Error('sensitive native diagnostic');
    this.data.set(key, value);
  }
  async remove(key: AuthStorageKey) {
    if (this.failDeletes) throw new Error('sensitive native diagnostic');
    this.data.delete(key);
  }
}

export class TestIdentityProvider {
  private request: URL | null = null;
  private sequence = 0;
  private currentRefresh: string | null = null;
  readonly revoked: string[] = [];
  authorizationCount = 0;
  tokenCalls = 0;
  refreshCalls = 0;
  failNetwork = false;
  failRevocation = false;
  invalidGrant = false;
  keepRefresh = false;
  wrongSignature = false;
  metadataPatch: Record<string, unknown> = {};
  claimsPatch: Record<string, unknown> = {};
  beforeToken: (() => Promise<void>) | null = null;
  constructor(readonly now: () => number) {}

  authorize(url: string): string {
    this.authorizationCount++;
    this.request = new URL(url);
    assert.equal(this.request.origin, 'https://identity.example');
    assert.equal(this.request.searchParams.get('response_type'), 'code');
    assert.equal(this.request.searchParams.get('response_mode'), 'query');
    assert.equal(this.request.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(this.request.searchParams.get('prompt'), 'login');
    assert.equal(this.request.searchParams.get('client_id'), config.clientId);
    assert.ok(this.request.searchParams.get('nonce'));
    assert.ok(this.request.searchParams.get('state'));
    const callback = new URL(config.redirectUri);
    callback.searchParams.set('code', 'test-authorization-code');
    callback.searchParams.set('state', this.request.searchParams.get('state')!);
    callback.searchParams.set('iss', config.issuer);
    return callback.href;
  }

  fetch: typeof fetch = async (resource, init) => {
    if (this.failNetwork) throw new Error('Network error may contain sensitive URL');
    const url = new URL(resource instanceof Request ? resource.url : resource);
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.cache, 'no-store');
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.referrerPolicy, 'no-referrer');
    assert.equal(url.origin, 'https://identity.example');
    if (url.pathname.endsWith('/.well-known/openid-configuration')) {
      return Response.json({
        issuer: config.issuer,
        authorization_endpoint: `${config.issuer}/protocol/openid-connect/auth`,
        token_endpoint: `${config.issuer}/protocol/openid-connect/token`,
        jwks_uri: `${config.issuer}/protocol/openid-connect/certs`,
        revocation_endpoint: `${config.issuer}/protocol/openid-connect/revoke`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        id_token_signing_alg_values_supported: ['RS256'],
        authorization_response_iss_parameter_supported: true,
        ...this.metadataPatch,
      });
    }
    if (url.pathname.endsWith('/certs')) {
      return Response.json({ keys: [{ ...publicKey, kid: 'test-key', use: 'sig', alg: 'RS256' }] });
    }
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get('client_id'), config.clientId);
    assert.equal(body.has('client_secret'), false);
    if (url.pathname.endsWith('/revoke')) {
      if (this.failRevocation) throw new Error('Unavailable');
      assert.equal(body.get('token_type_hint'), 'refresh_token');
      this.revoked.push(body.get('token')!);
      return new Response(null, { status: 200 });
    }
    assert.ok(url.pathname.endsWith('/token'));
    this.tokenCalls++;
    const refresh = body.get('grant_type') === 'refresh_token';
    if (refresh) {
      this.refreshCalls++;
      if (this.invalidGrant || body.get('refresh_token') !== this.currentRefresh) {
        return Response.json(
          { error: 'invalid_grant', error_description: 'secret diagnostic' },
          { status: 400 },
        );
      }
    } else {
      assert.equal(body.get('grant_type'), 'authorization_code');
      assert.equal(body.get('code'), 'test-authorization-code');
      assert.equal(body.get('redirect_uri'), config.redirectUri);
      assert.ok(this.request);
      const challenge = Buffer.from(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.get('code_verifier')!)),
      ).toString('base64url');
      assert.equal(challenge, this.request.searchParams.get('code_challenge'));
    }
    if (this.beforeToken) await this.beforeToken();
    this.sequence++;
    const previousRefresh = this.currentRefresh;
    this.currentRefresh = `refresh-${this.sequence}`;
    const seconds = Math.floor(this.now() / 1000);
    const claims = {
      iss: config.issuer,
      aud: config.clientId,
      sub: 'representative-1',
      iat: Math.floor(Date.now() / 1000),
      exp: seconds + 60,
      nonce: this.request?.searchParams.get('nonce'),
      ...this.claimsPatch,
    };
    return Response.json({
      access_token: `access-${this.sequence}`,
      token_type: 'Bearer',
      expires_in: 60,
      refresh_token: this.keepRefresh && refresh ? previousRefresh : this.currentRefresh,
      id_token: await signedJwt(claims, this.wrongSignature),
    });
  };
}

export function harness() {
  let time = Date.now();
  const now = () => time;
  const store = new MemorySecureStore();
  const provider = new TestIdentityProvider(now);
  let callbackListener: ((url: string) => void) | null = null;
  let launchUrl: string | null = null;
  let transform = (url: string) => url;
  const browser: AuthorizationBrowser = {
    async authorize(url) {
      return transform(provider.authorize(url));
    },
    async getLaunchUrl() {
      return launchUrl;
    },
    async onCallback(listener) {
      callbackListener = listener;
      return async () => {
        callbackListener = null;
      };
    },
    clearCallback() {
      launchUrl = null;
    },
    async cancelAuthorization() {},
  };
  const create = () =>
    createAuthSession(config, { storage: store, browser, fetch: provider.fetch, now });
  return {
    create,
    client: create(),
    store,
    provider,
    browser,
    now,
    advance(ms: number) {
      time += ms;
    },
    launch(url: string) {
      launchUrl = url;
    },
    emitCallback(url: string) {
      callbackListener?.(url);
    },
    transformCallback(fn: (url: string) => string) {
      transform = fn;
    },
  };
}

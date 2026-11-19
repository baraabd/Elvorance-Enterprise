import * as oauth from 'oauth4webapi';
import { binding, matchesRedirect, type ValidatedConfig } from './configuration.ts';
import { AuthError, safeAuthError } from './errors.ts';
import type { AuthTransaction, StoredSession, ValidatedTokens } from './types.ts';

const REQUEST_TIMEOUT_MS = 15_000;
const CLOCK_TOLERANCE_SECONDS = 5;

/** Public-client OIDC code flow. The library owns OAuth/JWT parsing and cryptographic validation. */
export class OidcProtocol {
  readonly #client: oauth.Client;
  #metadata: Promise<oauth.AuthorizationServer> | null = null;

  constructor(
    private readonly config: ValidatedConfig,
    private readonly fetcher: typeof fetch,
    private readonly now: () => number,
  ) {
    this.#client = {
      client_id: config.clientId,
      id_token_signed_response_alg: 'RS256',
      [oauth.clockTolerance]: CLOCK_TOLERANCE_SECONDS,
    };
  }

  #request = async (
    url: string,
    init: oauth.CustomFetchOptions<'GET' | 'POST', URLSearchParams | undefined>,
  ): Promise<Response> => {
    const endpoint = new URL(url);
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.origin !== new URL(this.config.issuer).origin ||
      endpoint.username ||
      endpoint.password ||
      endpoint.hash
    )
      throw new AuthError('invalid_configuration');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetcher(url, {
        method: init.method,
        headers: init.headers,
        ...(init.body === undefined ? {} : { body: init.body }),
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      });
      if (response.redirected) throw new AuthError('invalid_response');
      if (response.status >= 500 || response.status === 429) {
        throw new AuthError('network_unavailable');
      }
      return response;
    } catch (error) {
      throw safeAuthError(error, 'network_unavailable');
    } finally {
      clearTimeout(timeout);
    }
  };

  #options() {
    return { [oauth.customFetch]: this.#request };
  }

  async #discover(): Promise<oauth.AuthorizationServer> {
    if (!this.#metadata) {
      this.#metadata = (async () => {
        const issuer = new URL(this.config.issuer);
        const response = await oauth.discoveryRequest(issuer, this.#options());
        const server = await oauth.processDiscoveryResponse(issuer, response);
        for (const key of [
          'authorization_endpoint',
          'token_endpoint',
          'jwks_uri',
          'revocation_endpoint',
        ] as const) {
          const value = server[key];
          if (typeof value !== 'string') throw new AuthError('invalid_configuration');
          const endpoint = new URL(value);
          if (
            endpoint.protocol !== 'https:' ||
            endpoint.origin !== issuer.origin ||
            endpoint.username ||
            endpoint.password ||
            endpoint.hash ||
            endpoint.search
          )
            throw new AuthError('invalid_configuration');
        }
        if (
          !server.code_challenge_methods_supported?.includes('S256') ||
          !server.response_types_supported?.includes('code') ||
          !server.id_token_signing_alg_values_supported?.includes('RS256') ||
          server.authorization_response_iss_parameter_supported !== true
        )
          throw new AuthError('invalid_configuration');
        return server;
      })().catch((error: unknown) => {
        this.#metadata = null;
        throw safeAuthError(error, 'invalid_response');
      });
    }
    return this.#metadata;
  }

  async authorization(): Promise<{ url: string; transaction: AuthTransaction }> {
    const server = await this.#discover();
    const transaction: AuthTransaction = {
      version: 1,
      ...binding(this.config),
      state: oauth.generateRandomState(),
      nonce: oauth.generateRandomNonce(),
      codeVerifier: oauth.generateRandomCodeVerifier(),
      createdAt: this.now(),
    };
    const url = new URL(server.authorization_endpoint!);
    const parameters: Record<string, string> = {
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      response_mode: 'query',
      scope: this.config.scopes.join(' '),
      code_challenge: await oauth.calculatePKCECodeChallenge(transaction.codeVerifier),
      code_challenge_method: 'S256',
      state: transaction.state,
      nonce: transaction.nonce,
      // Explicit sign-in after local logout must not silently reuse a browser SSO cookie.
      prompt: 'login',
    };
    for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
    return { url: url.href, transaction };
  }

  async exchange(callback: string, transaction: AuthTransaction): Promise<ValidatedTokens> {
    if (!matchesRedirect(callback, this.config.redirectUri))
      throw new AuthError('invalid_transaction');
    try {
      const server = await this.#discover();
      const parameters = oauth.validateAuthResponse(
        server,
        this.#client,
        new URL(callback),
        transaction.state,
      );
      const requestedAt = this.now();
      const response = await oauth.authorizationCodeGrantRequest(
        server,
        this.#client,
        oauth.None(),
        parameters,
        this.config.redirectUri,
        transaction.codeVerifier,
        this.#options(),
      );
      const tokens = await oauth.processAuthorizationCodeResponse(server, this.#client, response, {
        expectedNonce: transaction.nonce,
        requireIdToken: true,
      });
      await oauth.validateApplicationLevelSignature(server, response, this.#options());
      return this.#tokens(tokens, requestedAt, transaction.nonce);
    } catch (error) {
      if (error instanceof oauth.AuthorizationResponseError && error.error === 'access_denied') {
        throw new AuthError('operation_cancelled');
      }
      throw safeAuthError(error, 'invalid_response');
    }
  }

  async refresh(session: StoredSession): Promise<ValidatedTokens> {
    try {
      const server = await this.#discover();
      const requestedAt = this.now();
      const response = await oauth.refreshTokenGrantRequest(
        server,
        this.#client,
        oauth.None(),
        session.refreshToken,
        this.#options(),
      );
      const tokens = await oauth.processRefreshTokenResponse(server, this.#client, response);
      if (
        !tokens.id_token ||
        !tokens.refresh_token ||
        tokens.refresh_token === session.refreshToken
      ) {
        throw new AuthError('invalid_response');
      }
      await oauth.validateApplicationLevelSignature(server, response, this.#options());
      const result = this.#tokens(tokens, requestedAt, session.nonce, session.authTime);
      if (result.subject !== session.subject) throw new AuthError('invalid_response');
      return result;
    } catch (error) {
      if (error instanceof oauth.ResponseBodyError && error.error === 'invalid_grant') {
        throw new AuthError('session_expired');
      }
      throw safeAuthError(error, 'invalid_response');
    }
  }

  #tokens(
    tokens: oauth.TokenEndpointResponse,
    requestedAt: number,
    nonce: string,
    previousAuthTime?: number | null,
  ): ValidatedTokens {
    const claims = oauth.getValidatedIdTokenClaims(tokens);
    if (
      !claims ||
      typeof claims.sub !== 'string' ||
      claims.sub.length < 1 ||
      claims.sub.length > 512 ||
      !Number.isFinite(claims.iat) ||
      claims.iat > this.now() / 1000 + CLOCK_TOLERANCE_SECONDS ||
      (claims.nonce !== undefined && claims.nonce !== nonce) ||
      (claims.auth_time !== undefined &&
        (typeof claims.auth_time !== 'number' ||
          !Number.isFinite(claims.auth_time) ||
          claims.auth_time <= 0 ||
          (previousAuthTime !== undefined && claims.auth_time !== previousAuthTime))) ||
      typeof tokens.expires_in !== 'number' ||
      !Number.isFinite(tokens.expires_in) ||
      tokens.expires_in <= 0 ||
      tokens.expires_in > 3600 ||
      tokens.token_type !== 'bearer' ||
      tokens.access_token.length > 32 * 1024 ||
      !tokens.refresh_token ||
      tokens.refresh_token.length > 32 * 1024
    )
      throw new AuthError('invalid_response');
    const expiresAt = Math.min(requestedAt + tokens.expires_in * 1000, claims.exp * 1000);
    if (expiresAt <= this.now()) throw new AuthError('invalid_response');
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      subject: claims.sub,
      expiresAt,
      nonce,
      authTime: claims.auth_time ?? previousAuthTime ?? null,
    };
  }

  /** Local deletion is independent of whether this best-effort network operation succeeds. */
  async revoke(refreshToken: string): Promise<boolean> {
    try {
      const server = await this.#discover();
      const response = await oauth.revocationRequest(
        server,
        this.#client,
        oauth.None(),
        refreshToken,
        {
          ...this.#options(),
          additionalParameters: { token_type_hint: 'refresh_token' },
        },
      );
      await oauth.processRevocationResponse(response);
      return true;
    } catch {
      return false;
    }
  }
}

# Representative authentication

`createMobileAuth(config)` creates the single authentication coordinator shared by the representative workspace and API client. Feature modules receive `getAccessToken`; they do not read storage or implement their own login.

`attachAuthHost` supplies the shared account lifecycle for the representative, administrative and customer shells. It aborts the previous screen before switching accounts and disposes mounts that finish after logout. Web shells use `@elvorance/api-client/authenticated-workspace`, with a separate OIDC client per role; an explicit external token provider remains compatible and is verified through the API before mounting.

```ts
import { createMobileAuth } from '@elvorance/mobile-auth';

const auth = createMobileAuth({
  environment: 'staging',
  issuer: 'https://YOUR-STAGING-IDENTITY-HOST/realms/elvorance-staging',
  clientId: 'elvorance-rep-staging',
  redirectUri: 'com.elvorance.rep.staging:/oauth2redirect',
});

await auth.initialize();
const unsubscribe = auth.onSessionChanged(renderAuthenticationState);
// Call auth.signIn() from the user's sign-in action.
// Supply () => auth.getAccessToken() to the API client.
// await auth.signOut() returns { revoked: boolean }.
```

## Protocol and state ownership

- `oidc.ts` delegates Authorization Code + PKCE S256, state, nonce, issuer, audience, authorized party and JWT parsing to `oauth4webapi` 3.8.8. ID tokens are additionally verified cryptographically against the issuer's JWKS. RS256 is pinned. The API independently verifies the access token and enforces tenant, role and owner checks.
- Issuers and all discovery endpoints require HTTPS and the same issuer origin. Authorization responses must include the supported `iss` response parameter. Redirect URIs match the configured URI exactly; fragments and alternative paths are rejected.
- A transaction lasts five minutes and its verifier is consumed once. Native Android cold-start callbacks recover through Capacitor App launch URLs. Repeated callbacks cannot exchange the same transaction again. An interrupted flow without a callback starts a new login.
- `session.ts` coalesces concurrent refresh requests. A refresh must return a newly rotated refresh token and a verified ID token for the same subject. Nonce and authentication time remain bound to the original session. The new secure record is committed before an access token is returned to a feature.
- `vault.ts` orders native storage writes and removals. Generation checks prevent login or refresh results from restoring credentials after logout. Late successful grants are revoked. Raw provider errors, response bodies and callback URLs are not attached to public errors or logged.

## Storage and browser adapters

Native builds require the app-local `ElvoranceAuthBridge` plugin. The bridge provides iOS Keychain and Android Keystore-backed encrypted storage, system-browser authorization, explicit cancellation, and the fixed keys `auth-session` and `auth-transaction`. Its `authorizationEndpoint` configuration pins the destination of browser authorization. A missing bridge fails closed.

Only the refresh credential and its issuer/client/environment/subject binding are persisted in the native secure record. Access and ID tokens are not persisted. Session snapshots contain status, subject and access expiry, never credentials.

The web adapter keeps bearer and refresh tokens in memory. A short-lived state/nonce/PKCE transaction uses session storage across a full-document redirect and is removed when consumed. Refreshing the web page therefore requires authorization again. There is no plaintext token-storage fallback.

Staging uses `com.elvorance.rep.staging:/oauth2redirect`; production uses `com.elvorance.rep:/oauth2redirect`. Web previews require their own exact HTTPS callback and a separately registered web client. Native WebView origins are `capacitor://localhost` and `https://localhost`; both must be explicitly permitted in identity-provider and API CORS settings.

## Failure and logout semantics

An unavailable identity provider does not enable demo data or return an expired access token. An ambiguous network failure preserves the secure refresh credential for a later attempt; an invalid grant or unverifiable refresh removes it and requires sign-in.

Logout removes local credentials even if the revocation endpoint is offline. The returned `revoked` flag lets the UI distinguish confirmed server revocation from local-only logout. Failed secure deletion is reported explicitly. Interactive sign-in always requests `prompt=login`, so a retained system-browser SSO cookie cannot silently restore the application session.

API JWTs are verified without introspection. A previously copied access JWT remains bounded by its signed expiry; local deletion and refresh-token revocation do not constitute instantaneous invalidation of already-issued access JWTs. The supplied realm limits access tokens to five minutes.

## Verification

Package tests use actual RSA signatures and JWKS responses. They exercise forged signatures, issuer/audience/nonce/state failures, endpoint pinning, expiration, refresh rotation and replay behavior, concurrent refresh, logout during network/storage operations, storage failures, offline recovery, stale transactions, and cold-start callbacks. Separate representative lifecycle tests cover stale account mounts, GPS permission/watch races and native-listener disposal.

Native Keychain/Keystore behavior, OS browser callbacks, device permission dialogs, and process termination still require the Android/iOS device acceptance workflow. Protocol unit tests are not substitutes for those device checks.

References: [oauth4webapi](https://github.com/panva/oauth4webapi), [OAuth for Native Apps](https://www.rfc-editor.org/rfc/rfc8252), [OAuth security best practices](https://www.rfc-editor.org/rfc/rfc9700), [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html).

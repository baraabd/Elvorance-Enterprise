# Separate identity environments

This directory defines the representative app's Keycloak 26.8.2 public clients, application claims, role scopes and administrator-owned user attributes. Deploy Staging and production to separate Keycloak services and databases. A realm name alone does not prove infrastructure isolation.

The generated definition contains **no accounts, passwords, client secrets or signing keys**. Keycloak generates its signing material inside the environment. Bootstrap starts with a disabled realm, installs the user-profile policy, reads back the security configuration and enables sign-in only after those checks succeed.

## Generate and bootstrap

Provide public environment settings through the process environment:

```sh
export ELVORANCE_ENVIRONMENT=staging
export KEYCLOAK_BASE_URL=https://YOUR-STAGING-IDENTITY-HOST
node infra/identity/generate.mts
```

Generation writes the disabled realm import, user profile and public app settings under `dist/identity/staging`. `ELVORANCE_IDENTITY_OUTPUT_DIR` can select another output directory. The hostname placeholder must be replaced by the actual HTTPS hostname before deployment.

Supply an administrator access token through `KEYCLOAK_ADMIN_TOKEN_FILE` (owner-readable permissions only) or through a secret-injected `KEYCLOAK_ADMIN_TOKEN`. Do not place it in public settings or command-line arguments. Then run:

```sh
node infra/identity/bootstrap.mts
```

Bootstrap creates the realm if missing. A previously imported, disabled realm can be completed. Re-running against a correctly configured, enabled realm performs verification without overwriting its users or configuration. If existing policy differs, the command stops with the affected setting and leaves the live realm unchanged; apply a reviewed environment migration before rerunning it. Realm creation and configuration do not create representative accounts.

The administrative client requires HTTPS, pins every request to the supplied origin, disables redirects, applies request timeouts and prints redacted errors. The mobile clients use Authorization Code + S256; there is no password grant or administrator secret in the application.

## Public identifiers

| Setting                       | Staging                                     | Production                          |
| ----------------------------- | ------------------------------------------- | ----------------------------------- |
| Realm                         | `elvorance-staging`                         | `elvorance-production`              |
| Native client                 | `elvorance-rep-staging`                     | `elvorance-rep-production`          |
| API audience / role container | `elvorance-api-staging`                     | `elvorance-api-production`          |
| Native callback               | `com.elvorance.rep.staging:/oauth2redirect` | `com.elvorance.rep:/oauth2redirect` |

Backend `OIDC_ISSUER`, `OIDC_AUDIENCE` and `OIDC_JWKS_URL` come from the generated public settings. The native plugin's `authorizationEndpoint` and the mobile client's issuer must refer to the same environment.

The native client permits only the exact WebView origins `capacitor://localhost` and `https://localhost`. The gateway must independently allow these origins. `*`, `null`, wildcard callbacks and arbitrary dynamic origins are not accepted.

A web preview is optional and uses its own client, `elvorance-rep-web-{environment}`. Supply both `KEYCLOAK_REP_WEB_REDIRECT_URI` and `KEYCLOAK_REP_WEB_ORIGIN`. The canonical HTTPS callback must belong to that exact origin. Neither variable adds a callback to the native client.

Administrative and customer web applications also receive separate clients only when their public URLs are supplied:

| Application    | Required environment pair                                        | Client                               | Allowed API role scope                    |
| -------------- | ---------------------------------------------------------------- | ------------------------------------ | ----------------------------------------- |
| Administration | `KEYCLOAK_ADMIN_WEB_REDIRECT_URI`, `KEYCLOAK_ADMIN_WEB_ORIGIN`   | `elvorance-admin-web-{environment}`  | `admin`, `support`, `finance`, `delivery` |
| Customer       | `KEYCLOAK_CLIENT_WEB_REDIRECT_URI`, `KEYCLOAK_CLIENT_WEB_ORIGIN` | `elvorance-client-web-{environment}` | `client`                                  |

These clients use the same S256 and exact HTTPS callback checks. They do not grant roles to users; the user's administrator-assigned roles are intersected with the client scope. The generated settings expose `adminWebClientId`, `adminWebRedirectUri`, `clientWebClientId` and `clientWebRedirectUri` for the corresponding frontend configuration. `@elvorance/mobile-auth` can supply the authenticated API token seam for each web app using that app's own client and callback.

## Authorization claims and onboarding

The API's role container defines the role names from `packages/contracts`: admin, rep, client, finance, delivery and support. Representative clients have an explicit scope for **rep only**. The roles mapper reads this particular client-role container into a multivalued `roles` claim, so unrelated Keycloak realm and account roles cannot become application roles. `fullScopeAllowed` is disabled.

Provision a representative through an authorized administrator workflow:

1. Create the identity in the correct environment, complete password/verified-email requirements and assign the API client's `rep` role.
2. Set `tenant_id` to the organization's backend tenant and `rep_id` to that representative's backend identifier. Attribute identifiers use letters, numbers, underscores or hyphens and are limited to 100 characters.
3. Provision the corresponding backend membership/profile using the issued OIDC subject. Do not substitute a username or email for `sub`.
4. Verify that the issued access token is accepted by the gateway and contains the expected `aud`, `tenant_id`, `rep_id` and `roles: ["rep"]` claims. A missing role or representative attribute fails backend authorization.

`tenant_id`, `rep_id` and `client_id` can be viewed/edited only in administrator contexts. Unmanaged attributes are disabled. Users cannot assign tenant membership or permissions from Account Console. The basic client scope supplies `sub` and `auth_time`, which Keycloak moved to protocol mappers starting in version 25.

## Token and account policy

- Public native/web clients use code flow with mandatory S256, RS256 signatures, exact redirects, and issuer response parameters. Implicit, password, service-account, device, CIBA and token-exchange flows are disabled.
- Access tokens last five minutes; authorization codes last one minute. Sessions have 30-minute idle and eight-hour maximum lifetimes. Refresh rotation is enabled with zero reuse. Offline-access scopes are not assigned.
- Registration, username editing and remember-me are disabled. Password policy requires 14 characters, excludes username/email and retains five prior passwords. Brute-force protection is enabled.
- Email verification is required. Configure the environment's SMTP and onboarding process before inviting real users. Password reset remains disabled until that verified recovery channel is configured and reviewed.
- Audit events are enabled with a seven-day retention setting. Full administrator event representations are disabled to avoid storing submitted credential/profile bodies.

## Verification scope

`tests/backend/identity-configuration.test.ts` verifies environment isolation, exact web origins, administrator-only attributes, role allowlists, PKCE/client grant policy, redacted administration errors and the disabled-before-verified bootstrap sequence. Mobile authentication tests verify code exchange and signed-token validation separately. A successful configuration generation is not evidence that a hosted service, real user login or physical device test has succeeded.

For a real local provider check, start a disposable Keycloak 26.8.2 with an in-memory database and a loopback HTTPS hostname. Trust its temporary certificate through `NODE_EXTRA_CA_CERTS` without disabling TLS verification. Supply a short-lived administrator token using the same secret mechanism as bootstrap, then run:

```sh
export ELVORANCE_IDENTITY_LOCAL_TEST=1
export LOCAL_KEYCLOAK_BASE_URL=https://localhost:18443
node tooling/scripts/test-local-identity.mts
```

The guarded test rejects non-loopback servers, imports the isolated `elvorance-staging` realm, verifies idempotent bootstrap, creates a temporary representative, performs real Authorization Code/S256 login, validates the resulting JWT through the backend verifier, checks refresh rotation/replay rejection, revokes the session and deletes the fixture account. Its report is written to `dist/identity-local-verification.json` and contains no credentials. This local test does not substitute for deployed Staging or physical-device acceptance.

Official references:

- [Keycloak 26.8.2 Server Administration](https://www.keycloak.org/docs/26.8.2/server_admin/)
- [Keycloak 26.8.2 Admin REST API](https://www.keycloak.org/docs-api/26.8.2/rest-api/)
- [Built-in protocol mapper configuration](https://www.keycloak.org/admin-api/protocol-mappers)
- [User profile permissions](https://www.keycloak.org/docs/latest/server_admin/#user-profile)
- [Keycloak upgrading guide: basic scope](https://www.keycloak.org/docs/latest/upgrading/)

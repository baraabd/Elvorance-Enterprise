# Authenticated server applications

The representative now has a dedicated API-backed application in
`apps/rep-mobile/src/server/`, with a separate release entry point
`apps/rep-mobile/src/server-main.ts`. It uses the gateway and verified OIDC identity.
The release build rejects demo/runtime imports and has no fallback to local company
data. This is a new server interface; the preserved legacy preview's 64 routes are
not individually reclassified as migrated simply because a different interface exists.

## Implemented interfaces

| Role           | Live operations                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Representative | Dashboard; customer creation/editing and published discovery; visit scheduling, start, completion and cancellation; tasks, opportunities and ordered routes; catalog-priced quote drafting, revision, discount/custom-price approval requests and sending; contract/project/invoice/payment views; conversations, messages, read receipts, notifications and support; profile editing; explicit foreground location sharing. |
| Client         | Live invoice, quote, contract, project, support and notification views; support ticket creation; explicit quote acceptance, rejection or change request; separate contract signature and approval.                                                                                                                                                                                                                           |
| Admin          | Live membership, region, customer, visit, quote, contract, project, invoice, support, notification and commercial-approval views; customer creation with assignment; explicit approval or rejection of requested commercial exceptions.                                                                                                                                                                                      |

The client/admin workspaces implement the counterpart decisions required by the
representative workflow. Their entire legacy preview feature sets are not migrated.
Authoritative operations and business rules are documented in
[the backend integration contract](REP-BACKEND-API.md) and
`packages/contracts/openapi.json`.

## Authentication and environment setup

Use [the independent Staging operations guide](REP-STAGING-OPERATIONS.md),
[the identity-provider bootstrap](../infra/identity/README.md) and
[the native release guide](rep-native-release.md). The representative release needs
real HTTPS gateway/issuer configuration, an environment-specific client and the
corresponding authorized account. The configuration contains public connection
metadata only; never put tokens, passwords or signing material in a bundle.

The preferred interactive path configures `ELVORANCE_CONFIG.auth` and the matching
`environment`. Administrator and client web login use distinct role-restricted OIDC
clients with exact approved HTTPS redirects. Access tokens stay in memory. Native
refresh tokens use Android Keystore-backed encryption or iOS Keychain. Browser
sessions use memory and do not persist tokens in localStorage.

For existing integration development, the explicit
`window.ELVORANCE_AUTH.getAccessToken()` adapter remains supported. HTTP is permitted
only for local loopback development without a hosted environment; Staging and
production use HTTPS. The adapter is a compatibility integration point, not a way to
bypass authentication. A missing provider/configuration shows an error rather than
inserting demo records. Replaced accounts dispose active requests, screen state and
location listeners before initializing the new workspace.

`npm run build:apps` retains preview builds for development and regression checks.
Use `npm run build:rep:server` for the representative release; it produces the
server-only bundle, CSP and source/output integrity manifest. Native preparation
verifies the manifest before copying web assets into the native projects.

## Deliberate functional boundaries

- Location sharing is foreground-only, explicitly consented and stopped on app
  background, offline transitions or logout. No continuous background tracking is
  claimed.
- Notifications are in-app. This change does not register FCM/APNs devices or promise
  delivery while the app is closed.
- Billing shows server invoices and recorded payments. It does not charge a card or
  replace a payment processor.
- Route planning persists an ordered visit plan; no turn-by-turn navigation or
  automatic route optimization is claimed.
- Company catalog, questionnaire, accounts, roles and assignments must be configured
  by the authorized tenant administrator. Unconfigured tenants do not receive fake
  prices or synthetic customers.
- Data list APIs are cursor-paginated and filter actor ownership before the SQL limit.
  The current representative view adapter assembles pages for its list screens;
  large production datasets still require measured UI and service load acceptance.

## Verification and remaining release gates

The repository includes domain/HTTP tests, DOM-to-service integration, a real
PostgreSQL isolation/concurrency runner, a guarded real-Keycloak smoke runner,
distributed Docker/RabbitMQ CI, and native Android/iOS verification workflows.
Each proves only its stated scope. Emulator/simulator tests do not replace physical
devices, a local identity test does not create a hosted Staging deployment, and a
native verification harness is not a signed company release.

Production requires accepted evidence for the same source and image digests,
isolated hosted Staging, business journeys, security review, load and restore tests,
and signed candidates exercised on physical Android and iPhone devices. The
acceptance validator rejects missing, failed, stale or simulator-only reports.

`npm run audit:migration` continues to report the inherited preview/tooling files
with disabled type checking. The new representative release graph excludes the
legacy preview runtime; that does not make the entire repository a completed strict
TypeScript migration. Keep the delivery in draft until its outstanding deployment,
signing and device evidence is reviewed.

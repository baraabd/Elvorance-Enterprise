# Authenticated server workspace — incremental integration

This is an **opt-in, API-backed integration slice**, not the complete replacement for the legacy 64 routes/122 handlers.

## What works in server mode

All three frontends can initialize an authenticated workspace **without calling the demo data repository** when `ELVORANCE_CONFIG.dataMode === 'server'`. The server-only workspace uses `@elvorance/api-client/live-data` and routes all requests through the API Gateway:

| Role           | Read-only live views                                                                                           | Live mutations                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Representative | Customers, visits, quotes, contracts, projects, support tickets, notifications                                 | Create customer, create support ticket         |
| Client         | Invoices, quotes, contracts, projects, support tickets, notifications                                          | Create support ticket                          |
| Admin          | Memberships, regions, customers, visits, quotes, contracts, projects, invoices, support tickets, notifications | Create customer (with assigned representative) |

The backend enforces authorization using verified bearer identity, tenant scoping and record ownership. The browser does not connect directly to PostgreSQL or RabbitMQ. The API client does not persist bearer tokens or fall back to demo records on a failed request.

## Prerequisites

- Run the backend services and PostgreSQL using the documented Docker Compose setup.
- Configure `apiBaseUrl` to point to the reachable API Gateway (e.g. `http://127.0.0.1:3000` when testing in the same machine/browser).
- Provide a real sign-in adapter at `window.ELVORANCE_AUTH.getAccessToken()` that resolves the current signed-in user's access token. Authentication must be completed through the configured OIDC provider. **Do not include bearer tokens or signing secrets in the checked-in `config.example.ts`, bundled JavaScript, or browser localStorage.**
- Change the desired app's `config.example.ts` `dataMode` from `demo` to `server`, then rebuild the app. The bundled browser config file remains executable JavaScript; do not add TypeScript-only syntax to it.

The server workspace intentionally shows an actionable sign-in error if the provider is unavailable and never inserts fabricated company data. The client and representative must use claims issued for their own roles.

## Important release blockers

The **original feature routes and handlers are not migrated**. The separate server workspace displays only existing backend records and provides a small subset of commands. It does not provide the original design's full screens, dedicated CRUD views, quote workflow, payment flows, notifications UX, GPS collection, full authentication/login interface, or native-device acceptance.

The PostgreSQL service contracts do not yet cover every legacy user action (for example workforce assignments, tasks, discounts and business analytics). These require explicit service-owned domain models, authorization, migrations, API schemas and tests.

Release acceptance requires:

1. Remove and typecheck every remaining `@ts-nocheck` under strict compiler options. A renamed file extension is not enough.
2. Replace each preview-only feature action with an explicit server-side endpoint; avoid writing the entire browser state as an opaque JSON row to sidestep domain rules or tenant isolation.
3. Implement signed-in OIDC sessions and role-specific navigation, loading/error/retry/conflict states.
4. Verify cross-session persistence: write from one role, read from another, restart services, and confirm PostgreSQL data is unchanged.
5. Exercise all original 64 routes and 122 handlers (or update the formally approved scope) on desktop/mobile and native devices.

Keep the PR in draft until these requirements have evidence. `npm run audit:migration` deliberately fails while suppressed types and preview dependencies remain.

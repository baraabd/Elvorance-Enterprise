# Sprint 05 — Admin server platform increment

## Acceptance decision

**PARTIAL / NOT SPRINT DONE. Keep the PR draft until exact-source CI and remaining business acceptance are satisfied. No merge, deployment, infrastructure change or company-data mutation is authorized by this implementation.**

Base: `main@453242e1256f6d876d170142b8ad235be9120344`, tree `6534bc4e7c7475e54e855095f652236f672ed052` (re-read 23 November 2026). The current main contains Sprint 01 and the representative/backend work originally reviewed in PR #4. At initial inspection, a separately delivered Sprint 04 package was not found. During execution, draft PR #15 appeared at `e9cb217cdd3850fcac836ed211fc6c48a828b3df`. Its endpoint inventory and financial event producer/consumer were reviewed. The paired subtotal/discount contract and Sales price ceiling are now aligned. The backend branch was not merged: its eight new service-request, region, project and milestone endpoints remain explicit Admin integration gaps. This does not assert that Sprint 04 is complete or approved. The baseline and candidate contract basis are recorded in `contract-basis.json`.

The baseline source was obtained from Actions run 45043046687, artifact 14762163424, whose source revision has the same Git tree as the observed main. Archive SHA-256: `a819aa2e4f10d86e9a6c26f1e56d6a694438475f83bfeb55927f3fbb386cef2e`. Direct local clone/install DNS was unavailable. The verified diagnostic toolchain archive 14762491912 has SHA-256 `5ce6e4939b9fddab445659a2a75e950ced1987b7bced47ddbe7c5b24ba05883b`; Node 24.22.1 and locked installed dependencies were used. A successful local `npm ci` is **not** claimed.

## Implementation

The Admin authenticated host now mounts a dedicated, strictly typed server workspace instead of the previous generic limited workspace. Existing OIDC/refresh/session ownership is reused through an optional mounting port; other applications retain their existing default. No tokens are embedded in product builds and no membership row is represented as an effective identity-provider permission grant.

The workspace has 22 top-level pages and one retained `memberships` alias. It reads 16 resource types through real gateway/service APIs. Customers, visits, tasks, opportunities, route plans, commercial decisions, fulfillment, collections, messaging and support expose the commands their current contracts actually support. Quotes use the **published server catalog**, integer minor units and a validated payment plan. Catalog/configuration publication is versioned. Unsupported role governance/audit operations are visible blockers, not working mock buttons.

Dashboard/report counts traverse complete cursor sets with a 100-page / 10,000-record limit per resource; exceeding the limit or a repeated cursor fails rather than presenting a partial total. Amounts remain separate per currency and use the actual invoice ledger fields, not fabricated revenue. These reads are **not an atomic cross-service snapshot**. The all-page filter/search/sort mode is explicit, bounded and URL-backed; the default current-page mode is labelled. Related ledgers and conversations are also fully paginated within the same bound.

Writes require confirmation, local validation and the service's authorization/business rules. Versioned commands send the currently read version. A 409 retains entered values and never overwrites automatically. The same unresolved method/path/body keeps its idempotency key until success, permitting an explicit retry after a response is lost after commit. This intent cache is **session-memory only**: after closing/reloading the browser, reconcile an uncertain write against the server before submitting a new intent. Lifetime/route aborts and generation checks prevent stale reads from replacing the active screen; pending writes are not silently abandoned by normal in-app navigation.

Arabic RTL, semantic landmarks, explicit labels, skip navigation, focus indicators, live error/status regions and responsive layout rules are implemented. The local DOM run does **not** establish visual layout, complete WCAG conformance, screen-reader compatibility or keyboard usability of every operation.

## A real cross-service defect corrected

The new commercial journey exposed a pre-existing defect: approving a discounted contract could produce a project while the Billing consumer rejected the event, because the approved-contract snapshot omitted the discount and Billing compared gross line totals to net total.

`ContractSnapshot.subtotalMinor` and `discountMinor` are optional paired fields, matching Sprint04 PR #15. Sales emits both from the immutable quote snapshot. When either is present, Billing requires both, verifies the subtotal against line items and requires `gross - discount === totalMinor`, in addition to a balanced payment plan. Both absent retains legacy zero-discount semantics. Invalid, incomplete or unbalanced evidence does not partially create invoices. Thirteen targeted cases cover legacy compatibility, exact-once replay, malformed/partial evidence and the shared Sales/Billing unit-price ceiling. No database migration, cross-service database read or production event rewrite was added.

**Previously emitted malformed discounted events are not retroactively repaired.** Assess affected events and obtain a separately reviewed remediation/replay procedure; do not mutate immutable historical events or replay arbitrary production messages based only on this code change.

## Verification recorded locally

| Check                                                    | Observed result                                           | Boundary                                                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Strict TypeScript                                        | PASS                                                      | New modules included; legacy type-suppression debt remains.                                                   |
| Package boundaries                                       | PASS                                                      | No service-to-service database access added.                                                                  |
| Three app builds and service builds                      | PASS                                                      | Ordinary app builds still include the explicit preview path.                                                  |
| Node suite                                               | **338 passed / 339, 0 failed, 1 skipped**                 | PostgreSQL case skipped because no local PostgreSQL is available.                                             |
| Existing merged suite                                    | **53/53 PASS**                                            | Not a substitute for browser integration.                                                                     |
| Preserved design parity                                  | **64/64 routes PASS**, 7 checked assets, 0 runtime errors | Frozen legacy subset, not all migrated Admin workflows.                                                       |
| Existing regression groups                               | **7/7 PASS**                                              | Original suites retained.                                                                                     |
| Formatting                                               | PASS                                                      | Full repository check.                                                                                        |
| Source inventory integrity                               | PASS                                                      | Semantic tracing is distinct from execution acceptance.                                                       |
| New Admin DOM + HTTP diagnostic                          | **15/15 PASS** (14 children + parent)                     | Real HTTP, signed synthetic identities, actual handlers, **in-memory storage**, no real browser layout proof. |
| Chromium locally                                         | **BLOCKED**                                               | Managed browser policy blocks loopback; no policy bypass attempted.                                           |
| PostgreSQL / hosted company data / hosted OIDC in new UI | **NOT VERIFIED locally**                                  | No production or hosted staging test performed.                                                               |

The 15 diagnostic observations are not added to the 338 Node total as unique business workflows. Browser mode has one additional responsive-viewport child, resulting in 16 TAP observations including its parent when successful. The fixtures invoke the real domain outbox/inbox consumers deterministically; the new browser fixture itself does **not** use RabbitMQ. The existing independent Docker/PostgreSQL/RabbitMQ lane remains mandatory.

New local coverage includes customer create/edit/read after reload, optimistic conflict, lost-response idempotency, task completion, visit lifecycle, catalog publication, discounted quotation/commercial approval, separately authorized client consent, project/invoice propagation, payment ledger, delivery completion, support/messages, cursor traversal beyond 100 records, API errors/retry and non-admin/cross-tenant rejection. Mere list/page smoke checks are explicitly identified in the acceptance matrix.

## Mandatory CI, without weakening existing gates

`FULL-CI` retains its existing project Linux/Windows, native, identity, real broker/runtime and security lanes and adds **admin-browser** to the fail-closed aggregate contract. The new job uses a disposable PostgreSQL 16.16 service, actual gateway/service HTTP listeners, Chromium and synthetic isolated accounts. A missing browser/PG service fails; CI rejects the DOM driver and memory storage. The harness creates randomly named isolated databases/roles, runs service-owned migrations and closes/reopens CRM persistence to check survival. Test teardown is limited to resources it created; only a loopback test PostgreSQL administrative URL is accepted.

The artifact contains TAP, execution/source/driver/storage metadata and RTL screenshots at 390/768/1440 pixels, bound to the exact CI source/run/attempt by the existing evidence machinery. No previous revision's CI result transfers to this PR. This document records local results only; the PR/run decision artifact is authoritative for hosted CI. No green CI result is asserted before observing that run.

The first hosted run (`45161384908`, head `ab2e4af8d26a5624759de7b23d78130d54281613`) passed all 15 browser/PostgreSQL child scenarios but failed its parent teardown with `ENOTEMPTY`: the Chromium profile was removed before the process had fully closed. The test harness now waits for process close, escalates only for its own child process and retries transient profile cleanup. Two new normal/forced-termination tests prove bounded cleanup and idempotence. The original failed run remains failed; only a fresh exact-source run can establish acceptance.

Run the acceptance suite in an isolated development/CI environment:

```sh
npm ci
ELVORANCE_ADMIN_E2E_STORAGE=postgres \
ELVORANCE_TEST_POSTGRES_URL=postgresql://postgres:TEST_PASSWORD@127.0.0.1:5432/postgres \
ELVORANCE_CHROMIUM=/usr/bin/google-chrome \
node tests/admin/run-e2e.mts
```

For an explicitly limited local diagnostic only (never a CI/browser/PG substitute):

```sh
ELVORANCE_ADMIN_E2E_STORAGE=memory ELVORANCE_ADMIN_E2E_DRIVER=dom \
node tests/admin/run-e2e.mts
```

No fixtures or synthetic development tokens are included in the server-only product bundle.

## Server-only build, not a deployment

`npm run build:apps` continues to build the retained preview applications and must not be mistaken for production Admin acceptance. The separate `npm run build:admin:server` requires `ELVORANCE_ADMIN_CONFIG` pointing to a reviewed public configuration JSON file containing only `dataMode`, `environment`, `apiBaseUrl` and `auth` (`issuer`, `clientId`, `redirectUri`, `environment`, optional `scopes`). Values must match the intended reviewed environment, registered callback and API CORS allowlist. HTTPS is required for hosted settings. Unknown keys, secrets/external tokens and demo configuration are rejected.

The output `dist/admin-server` has a source-hash build manifest and a checked dependency graph excluding demo-data/local-demo/app-runtime/legacy feature imports. Its meta CSP limits scripts/styles/connections. Deployment still requires reviewed HTTP security headers (including frame protection), HTTPS, identity/CORS configuration and real-account acceptance; a meta CSP is not a complete hosting security configuration. No Railway/Vercel deployment, DNS, secret or environment change is included here.

## Inventory reconciliation and remaining gaps

See [ACCEPTANCE-MATRIX.md](ACCEPTANCE-MATRIX.md) and its machine-readable JSON: **all 25 original Admin preview routes**, 23 actual server route identifiers, operation scope, test evidence and unresolved requirements. These are migration mappings, not hidden hash-URL redirects. Existing preview code is retained separately for regression; its local actions are not credited as connected operations.

Source inventory tooling now probes the actual exported Admin route registry. Source-hash-bound semantic decisions identify the new route handlers and preserve original 11 server registrations. Baselines were not reset and no old test/gate was deleted. Legacy debt remains 95 `@ts-nocheck`, 211 non-null assertions and 20 explicit `any`. Inventory integrity passing does **not** eliminate the existing missing workflow-test links or grant full semantic/runtime acceptance.

Required before Sprint 05 can be accepted as complete:

- Reconcile and independently approve the draft Sprint 04 PR #15 contracts, especially missing account lifecycle, actual role/permission governance, audit read/query/export and resource delete/archive semantics.
- Complete remaining UI operations rather than counting read-only screens: workforce/live tracking, rich related-entity selection, full visual questionnaire/configuration editing, tenant/security settings, historical report/filter/export capabilities and resource-specific gaps in the matrix.
- Observe exact-source FULL-CI including Chromium/PostgreSQL, then complete broader allowed/denied role and tenant combinations, every requested mutation, reload durability, manual responsive/keyboard/screen-reader review and real OIDC session acceptance. The Admin-only gate does not prove a complete fine-grained RBAC administration feature.
- Review large-tenant server aggregation/search needs and idempotency reconciliation across browser reloads. Customer consent remains a separate customer operation; Admin cannot approve on the customer's behalf.
- Obtain independent code/acceptance review and explicit deployment approval. No zero-defect, production-ready or full Sprint DONE claim is made.

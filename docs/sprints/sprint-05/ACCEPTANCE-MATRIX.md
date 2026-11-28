# Sprint 05 — Admin acceptance matrix

**Decision: partial implementation; no screen is accepted as complete solely because it renders.**

The local diagnostic uses actual service/gateway HTTP handlers and synthetic identities/data with in-memory storage. Its reload/reopen checks are not PostgreSQL durability proof. Chromium/PostgreSQL execution is a mandatory CI lane, not a locally claimed pass. See README for the exact evidence boundary.

## 28 November 2026 reconciliation

The machine-readable matrix now adds Sales service-request review, region metadata updates, project/milestone metadata editing and explicit-scope CSV exports. Their local DOM/HTTP/memory journey passed; exact-candidate Chromium/PostgreSQL and hosted acceptance remain separate gates. The original matrix below is preserved as the earlier Sprint 05 snapshot, not an assertion that these newly implemented operations are still absent. Account/role administration, durable audit and other unimplemented capabilities remain blockers.

## Shared acceptance criteria

1. Load authenticated owning-service data without demo fallback.
2. Verify allowed role and tenant in the backend; direct forbidden access must fail.
3. Show loading, empty, error and explicit retry states.
4. Validate and confirm supported writes; persist through reload; reject a stale version without overwriting.
5. Distinguish current-page search from bounded all-page search; preserve filters/sort in the URL.
6. Verify keyboard/labels/focus, Arabic RTL and 390/768/1440 pixel layouts in Chromium.

## Current server routes

| Route             | Implemented operation scope                                                                                           | Local test evidence                                                                                                                             | Remaining acceptance gap                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `dashboard`       | Nine real-domain counts, state drilldowns and currency-separated invoice totals.                                      | Unit: invoice totals, cursor bounds, route/filter selection. E2E: navigation smoke only.                                                        | No atomic server snapshot, historical analytics, recognized-revenue metric or large-tenant aggregation API.                             |
| `reports`         | Refreshable bounded totals with status drilldowns and capture time.                                                   | Unit: aggregation rejects invalid money and incomplete traversal. E2E: smoke only.                                                              | No date-range historical reports, scheduled reports, CSV/PDF export or cross-service snapshot isolation.                                |
| `customers`       | Create, edit, contact preference, detail, cursor paging and bounded all-page search/filter/sort.                      | E2E: create/edit/reload/CRM reopen; 409 retains inputs; uncertain committed write retries once; >100 records/filter/reload; foreign tenant 404. | No delete/archive endpoint; related identifiers are entered manually rather than rich selectors.                                        |
| `regions`         | List, create and inspect a row obtained from the real list API.                                                       | E2E: list smoke.                                                                                                                                | Region update/delete, polygon assignment and map editor are not implemented by this contract/UI.                                        |
| `users`           | Read and create descriptive membership records with an explicit identity-provider warning.                            | E2E: list smoke; API identity/admin gate and negative authorization controls.                                                                   | NOT login-account provisioning, disabling, role assignment in OIDC or effective permission management. No membership update/delete API. |
| `representatives` | Filter and inspect representative membership records.                                                                 | E2E: list smoke.                                                                                                                                | No complete workforce CRUD, account lifecycle, team assignment, live tracking or measured performance history.                          |
| `roles`           | Explain backend-enforced token roles and the missing management contract; no fake save action.                        | E2E: explanatory-page smoke.                                                                                                                    | BLOCKED_API: actual role/permission CRUD and permission matrix administration are not implemented.                                      |
| `visits`          | Schedule/edit, manually justified start, completion, cancellation, detail and list controls.                          | E2E: schedule/start/complete/reload.                                                                                                            | Cancellation and every outcome are not individually browser-tested; no automatic geolocation proof is manufactured.                     |
| `tasks`           | Create/edit, priority/date and open/done/cancelled transitions.                                                       | E2E: create/done/reload.                                                                                                                        | No destructive delete contract; assignment/cancel edge cases need broader browser acceptance.                                           |
| `opportunities`   | Create/edit opportunity, value/stage and approved-contract reference.                                                 | E2E: list smoke; server tests remain separate.                                                                                                  | No exhaustive browser stage/ownership/contract linkage workflow acceptance.                                                             |
| `routes`          | Create/edit an ordered list of visit IDs and transition its allowed status.                                           | E2E: list smoke.                                                                                                                                | No route optimization or map editor; manual IDs; mutation browser journey pending.                                                      |
| `catalog`         | Read published configuration, edit actual services/prices, publish with version; advanced questionnaire JSON editing. | E2E: publish service, reload and use actual catalog in a quote.                                                                                 | Full legacy visual questionnaire designer, question-level CRUD UX and exhaustive configuration variants are NOT completed.              |
| `quotes`          | Catalog-only draft pricing, integer minor-unit totals, payment-plan validation, send/revise/request discount.         | E2E: real catalog -> 10000 gross / 2000 discount -> approval -> send; client acceptance performed as a separate test actor.                     | All revisions, rejected decisions and quote-editor validation combinations still need browser coverage.                                 |
| `approvals`       | Inspect and approve/reject pending commercial decisions with justification/version.                                   | E2E: approved discount, subsequent quote/contract/project/invoice flow.                                                                         | Rejected/expired/competing reviewer paths are not all browser-tested.                                                                   |
| `contracts`       | Read actual contract and consent state; no Admin impersonation of the customer.                                       | E2E: separately authorized client acceptance/approval -> domain events -> project/invoice.                                                      | No Admin contract authoring/amendment/termination API or UI. Read-only is not full contract management.                                 |
| `projects`        | Milestones, actual deliverables, requested revisions and completion with service guards.                              | E2E: each milestone stage -> deliverable -> separate client approval -> complete/reload.                                                        | Rejected/revised-deliverable browser path and all concurrency cases pending.                                                            |
| `invoices`        | Read invoice/complete paginated ledger; record externally verified collection with unique reference/version.          | E2E: discounted contract produces balanced invoice; collection and ledger reload.                                                               | Does not charge a payment provider. Refunds, invoice correction/void and accounting exports have no completed UI/contracts.             |
| `tickets`         | Read, reply and reopen/resolve support tickets.                                                                       | E2E: reply/resolve/reload.                                                                                                                      | Admin ticket creation, assignment/escalation and full reopen coverage are not completed.                                                |
| `conversations`   | Create/open conversations, read all message pages, send with version and read receipts.                               | E2E: send/read/reload.                                                                                                                          | No external email/SMS delivery or attachments; bounded related traversal is not a chat push/realtime guarantee.                         |
| `notifications`   | List real in-app notifications and mark read.                                                                         | E2E: list smoke.                                                                                                                                | No provider push/email delivery or exhaustive read-receipt browser test.                                                                |
| `settings`        | Read/create the tenant profile allowed by the current API; explain missing edit/security contracts.                   | E2E: page smoke only.                                                                                                                           | Tenant profile editing, security configuration, SSO admin and preferences are incomplete.                                               |
| `audit`           | Explicit blocked page; notifications are NOT substituted for audit events.                                            | E2E: explanatory-page smoke.                                                                                                                    | BLOCKED_API: audit query/filter/paging/export and tamper-evidence acceptance absent.                                                    |
| `memberships`     | Preserve the previous server route without inventing a second membership store.                                       | Unit: alias routing; browser semantics covered only by users page smoke.                                                                        | Same limitations as users; this is compatibility, not an extra completed screen.                                                        |

The exact API mapping is in `acceptance-matrix.json`. All rows retain `NOT_ACCEPTED_AS_COMPLETE`; roles/audit are explicitly blocked rather than labelled working screens.

## Reconciliation of the 25 original Admin preview routes

These are functional migration mappings, **not automatic redirects**. Legacy preview pages remain available only through the separate demo path. Their old local actions have not all been migrated.

| Original route     | Server replacement                  | Acceptance                |
| ------------------ | ----------------------------------- | ------------------------- |
| `analytics`        | `reports`                           | PARTIAL_SEE_SERVER_MATRIX |
| `approvals`        | `approvals`                         | PARTIAL_SEE_SERVER_MATRIX |
| `client-detail`    | `customers/{id}`                    | PARTIAL_SEE_SERVER_MATRIX |
| `clients`          | `customers`                         | PARTIAL_SEE_SERVER_MATRIX |
| `configuration`    | `catalog`                           | PARTIAL_SEE_SERVER_MATRIX |
| `conversation`     | `conversations/{id}`                | PARTIAL_SEE_SERVER_MATRIX |
| `home`             | `dashboard`                         | PARTIAL_SEE_SERVER_MATRIX |
| `invoice-detail`   | `invoices/{id}`                     | PARTIAL_SEE_SERVER_MATRIX |
| `invoices`         | `invoices`                          | PARTIAL_SEE_SERVER_MATRIX |
| `live-tracking`    | `none`                              | NOT_IMPLEMENTED           |
| `messages`         | `conversations`                     | PARTIAL_SEE_SERVER_MATRIX |
| `more`             | `settings/navigation`               | PARTIAL_SEE_SERVER_MATRIX |
| `opportunity`      | `opportunities/{id}`                | PARTIAL_SEE_SERVER_MATRIX |
| `pipeline`         | `opportunities`                     | PARTIAL_SEE_SERVER_MATRIX |
| `project-detail`   | `projects/{id}`                     | PARTIAL_SEE_SERVER_MATRIX |
| `projects`         | `projects`                          | PARTIAL_SEE_SERVER_MATRIX |
| `settings`         | `settings`                          | PARTIAL_SEE_SERVER_MATRIX |
| `support`          | `tickets`                           | PARTIAL_SEE_SERVER_MATRIX |
| `tasks`            | `tasks`                             | PARTIAL_SEE_SERVER_MATRIX |
| `team`             | `users/representatives`             | PARTIAL_SEE_SERVER_MATRIX |
| `team-member`      | `users/{id}`                        | PARTIAL_SEE_SERVER_MATRIX |
| `territories`      | `regions`                           | PARTIAL_SEE_SERVER_MATRIX |
| `ticket-detail`    | `tickets/{id}`                      | PARTIAL_SEE_SERVER_MATRIX |
| `visits-completed` | `visits?scope=all&status=completed` | PARTIAL_SEE_SERVER_MATRIX |
| `zone-detail`      | `regions/{id}`                      | PARTIAL_SEE_SERVER_MATRIX |

The 11 former server registrations (approvals, contracts, customers, invoices, memberships, notifications, projects, quotes, regions, tickets, visits) are preserved. `memberships` is a typed alias of `users`. Source-level inventory/binding acceptance is not executed business-workflow acceptance.

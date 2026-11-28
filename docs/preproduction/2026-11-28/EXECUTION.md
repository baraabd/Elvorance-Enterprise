# Preproduction readiness repair — 28 November 2026

## Scope and source

Base: `main@63a266cfcc8c968a65e8b61237494f71ef8ad4a7`, tree `7b11c96935ee3daaf3e2f2dcc0b87c6c7a62ecf1`.
This increment is not a declaration that all seven release gates are complete. Production, store publication, physical-device acceptance and independent approval remain separate evidence requirements. No existing quality/debt baseline, required CI lane, rate limit or permission policy is relaxed.

## Observed hosted defect

On 28 November, the existing staging services still deployed the earlier hosted branch, not merged main. Read-only diagnostics inside the exact Railway staging environment found five pending CRM outbox events. The `crm.configuration_published.v1` event had an unconfirmed-publication error and the actual `atlas.events` exchange had no matching binding. Later customer events remained leased/retried. Broker authentication and passive queue inspection succeeded; this was not evidence of a bad broker password.

Main already includes the missing Communications subscription and handler. Roll out the current consumer before producers; do not drop messages, acknowledge unsupported events, turn off mandatory publication, or weaken readiness to obtain a green deployment. Preserve the pre-upgrade backup and pending outbox first.

The temporary diagnostic was restricted to this project's staging environment, read-only SQL aggregates and passive broker inspection. No message payload or credential is evidence for publication.

## Admin implementation

- Connect the existing Sales service-request collection/detail/review contracts. Admin cannot create or cancel as a customer. Accepted review creates exactly one opportunity under the existing transaction/authorization contract.
- Connect versioned region metadata editing without transferring ownership or territory assignments.
- Connect project title and unfinished milestone title/date editing. The milestone form starts with milestone values, not the parent project title. Commercial snapshots and lifecycle rules stay server-owned.
- Add bounded, explicit-scope CSV exports for authorized loaded rows and current operational observations. Allowlist scalar fields, reject oversized/nested output, escape formula-like strings, preserve currencies, and disclose that the output is neither historical nor an atomic accounting snapshot.
- Extend the existing real-handler HTTP/browser suite with persisted rereads, stale-write rejection, denied client/foreign-tenant operations and exact-once opportunity creation. Its bulk-pagination fixture waits for a new request-budget window rather than modifying production rate limits.

Four unchanged regression assertions reproduced missing route/metadata behavior before the implementation (0/4 passed), then passed after it (4/4). Sixteen new unit checks passed, including authenticated backup-envelope tampering and CSV scope/injection cases. Full local Node suite: 473 tests, 472 passed, zero failed, one explicit PostgreSQL skip. Local DOM/HTTP/memory diagnostic: 18/18 passed. These local runs are not Chromium, PostgreSQL, OIDC, hosted or physical-device acceptance. A separate interrupted local run is not counted as success.

Existing Admin account/role provisioning, queryable durable audit, full historical reporting, workforce/live tracking, complete contract/invoice administration and visual configurator gaps are **not** claimed closed by these bounded changes. See the updated Sprint 05 matrix and the final exact-source CI evidence.

## Retained backup implementation

Provider-native manual backups were unavailable on the connected workspace's plan. The temporary database-agent feature opt-in was restored to its original disabled state; no subscription was changed.

`STAGING_OPERATION=backup-restore` performs bounded PostgreSQL 18 logical backups of the seven owned databases and verifies the Keycloak schema in the administrative `railway` database. Each source dump shares the same exported repeatable-read snapshot as its row/security comparison evidence. The operation retains AES-256-GCM encrypted archives and an encrypted manifest in the existing approved S3-compatible bucket, downloads them back, verifies SHA-256 and authenticated context, and restores only into newly created random scratch databases. It compares all table rows and RLS metadata and checks no-context tenant reads. Pending outbox records are preserved, not republished. Created scratch databases and private temporary files are cleaned up; encrypted retained objects are not deleted.

The AWS SDK is pinned to 3.1179.0. Its dependency materialization run was 46121438271; a locked reinstall and production dependency audit succeeded. Its ZIP and every declared inner hash were verified locally. That helper run is not product FULL-CI.

Successful hosted execution must be observed before any backup/restore claim. This design does not establish a cross-database atomic snapshot, RabbitMQ snapshot, PITR, cross-region recovery, approved retention schedule, externally escrowed encryption key, RPO or disaster RTO. Recovery outside the current cluster also needs the protected database-role provisioning and key custody procedures. Never substitute this drill for those operational decisions.

## Governance, mobile and release boundaries

At inspection main remained unprotected. The connected GitHub App has no Administration permission, and CODEOWNERS names only the author; do not turn an author/bot review into independent human approval. The existing guarded `protect-main.mts` procedure requires the administrator's normal authenticated `gh` session and a fresh expected main SHA. No credential belongs in chat, source or workflow logs.

No connected physical Android/iPhone session or approved signing material has been established by this task. Existing emulator/simulator checks and the representative signing workflow remain evidence tiers, not signed physical-device acceptance or a client release pipeline.

Use the deployment/rollback runbook and release gates, then attach actual source-bound CI, hosted and device results. Any missing mandatory evidence remains BLOCKED, never implicitly PASS.

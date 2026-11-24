# Sprint 04 — Backend and domain integration

Base reviewed: `453242e1256f6d876d170142b8ad235be9120344` (main, 23 November 2026). PR #4 is merged, not an unmerged implementation branch. This change does not merge, deploy to Railway/Vercel, mint credentials, or approve a production release.

**Acceptance: incomplete.** This PR delivers tested backend changes and failure-recovery coverage. It does not label all three applications fully connected. The source-derived feature inventory is not a substitute for an owner-approved product requirements catalog.

## Verified service ownership

There are seven independently implemented domain services, plus a database-free API Gateway:

| Service        | Owned business data                                                                                                  | Integration boundary                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Identity       | Tenant, memberships, personal profiles                                                                               | Verified OIDC claims; external identity provisioning remains separate                |
| CRM            | Customers, regions, questionnaire/catalog configuration, discovery                                                   | Customer/context/catalog HTTP contracts; CRM events                                  |
| Sales          | Visits, quotes, contracts, fulfillment state, tasks, opportunities, routes, discount approvals, **service requests** | Live CRM HTTP checks and owned transactional events                                  |
| Delivery       | Projects, milestones and versioned deliverables                                                                      | `contract.approved.v1`; delivery acknowledgements                                    |
| Billing        | Contract accounts, invoices, receipt/payment records                                                                 | `contract.approved.v1`; billing acknowledgements; no real payment collection implied |
| Tracking       | Consented sessions and location points                                                                               | Verified representative scope; no background-location acceptance implied             |
| Communications | Tickets, notifications, conversations, paginated messages and receipts                                               | Live CRM authorization and event consumption; in-app delivery only                   |

No application service imports another service's repository or queries another service database. Test-only SQL inspection and fault injection are confined to explicitly named disposable Compose databases. Real PostgreSQL integration checks all 42 cross-service connection denials and forced tenant RLS, including the new table.

## Delivered changes

Eight additive operations increase the documented/registered business API from 84 to 92. `ENDPOINTS.md` enumerates every endpoint. `packages/contracts/openapi.json` remains the complete OpenAPI entry point; `sprint04-additions.json` is the reviewed additive source, not a replacement public specification.

- Client service request creation/list/detail, representative/admin review, and owning-client cancellation. Intake uses only a published, version-matched, active CRM catalog. No default/mock catalog is accepted. Accepting a request creates an opportunity atomically in Sales; current CRM assignment and contact preferences are rechecked. After reassignment, an admin review can assign an unresolved request to the current CRM representative; automatic transfer of all historic sales records is not claimed.
- Admin region metadata editing, without changing customer or identity assignment. Disabling a region prevents new assignments; existing customer history is retained.
- Delivery project-title and unfinished-milestone metadata editing. Contract snapshots, financial terms, progress and status cannot be overwritten through these PATCH operations; the original lifecycle POST operations remain authoritative.
- Fixed discounted-contract billing: gross line items, explicit discount and net total now reconcile. Sales and Billing use the same unit-price ceiling. Legacy zero-discount events continue to work; ambiguous legacy discounted events fail closed rather than inventing commercial terms.
- Six existing emitted event types had no durable binding. They now have a Communications consumer producing staff-scoped notifications. Internal discovery, task, opportunity, configuration and visit-planning notifications are not exposed to clients. New service-request notifications are customer scoped.

All new writes use existing tenant transactions, actor-scoped idempotency and required version checks for updates. Request fields owned by the server are rejected. List access is scoped before bounded cursor pagination, with fresh CRM checks where representative ownership may have changed. A failed upstream lookup returns an error rather than silently switching to demo data or reporting a fabricated successful write.

## Validation and evidence

The initial regression run failed on discounted invoices and the Sales/Billing price-limit mismatch. The corrected local targeted suite passes; final counts and exact-commit CI results must be read from the PR/check artifacts, not inferred from this document.

`tests/backend/sprint04-scenarios.ts` runs the same API scenarios against memory and real PostgreSQL. PostgreSQL testing first installs Sales migrations 1–2, retains an existing row, applies migration 3 twice, checks forced RLS, and runs the new APIs. `tests/backend/discount-fulfillment.test.ts` covers net billing, legacy compatibility, duplicate delivery and rollback of invalid monetary snapshots. `sprint04-contracts.test.ts` checks all original 84 operation and schema fingerprints and compares actual Fastify registrations against every documented endpoint in both directions.

The required existing `backend-runtime` lane runs real Docker processes, PostgreSQL and RabbitMQ. The extended journey injects a tenant-limited PostgreSQL invoice-insert failure, observes the real RabbitMQ retry queue and atomic inbox/account/invoice rollback, verifies independent Delivery success, then removes the fault and requires net-balanced invoices. It also stops/restarts only the isolated broker, verifies a committed request/outbox survives, checks duplicate-message deduplication, and observes permanent invalid messages in the dead-letter queue. The failure harness rejects non-CI, hosted, production, remote-Docker and non-loopback targets before any destructive command.

No full-CI gate, suppression baseline, quality baseline, mandatory test, or existing production blocker is removed. Three source-review evidence hashes are refreshed only to explicitly reviewed hashes recorded in `source-review.json`; this is not independent review or owner approval.

## Remaining work and reasons

| Area                                  | Not completed                                                                                                                           | Reason / acceptance needed                                                                                                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin/Client/Representative UI parity | New request/review/metadata APIs are not yet bound to every live screen; legacy demo screens remain demo-only                           | Requires per-screen UI implementation and end-to-end acceptance, not a claim based on endpoint presence. `FEATURE-COMPARISON.tsv` retains every source observation and unresolved mapping.        |
| Contract incident repair              | Historical discounted approval messages already in a dead-letter queue are not automatically rewritten or replayed                      | The old event may lack discount evidence. Reconcile from the owning Sales immutable quote and approve an audited corrective event; never edit another service's database.                         |
| External payments and refunds         | Online collection, provider webhooks, refunds, reconciliation and tax/e-invoicing integration                                           | No approved provider, credentials, fiscal requirements or settlement evidence. Existing payment endpoints record verified receipts only.                                                          |
| Documents and attachments             | Upload scanning, object-storage lifecycle, generated legal/financial PDFs and signature provider                                        | Storage/provider contracts, retention/access policies and production acceptance are not supplied.                                                                                                 |
| Communications/support scale          | Email/SMS/push/provider delivery, attachments and unbounded support-ticket reply histories                                              | Current in-app conversation pagination is implemented; embedded ticket reply limits are not silently removed. Provider integration and a separate history migration remain.                       |
| Organization/territory administration | Identity-provider provisioning, full territory/team assignment and bulk transfer of historical sales ownership                          | Identity owns membership; CRM owns customer assignment. Cross-database shortcuts are deliberately excluded.                                                                                       |
| Broker production hardening           | Cluster/node-loss and DLX-target-outage verification; operator replay tooling and quorum retry at-least-once dead-letter policy rollout | This CI proves a single-broker restart and application retry, not distributed fault tolerance. Default quorum dead-lettering is not automatically upgraded by durable queues; see `MIGRATION.md`. |
| Production release                    | Hosted Staging verification, OIDC/device acceptance, independent review and owner sign-off                                              | This PR does not perform infrastructure rollout or replace the preceding security/staging sprints.                                                                                                |

## Reproducing source-derived artifacts

After a deliberate source review, run `node tooling/scripts/sprint04-contracts.mts`, `npm run inventory:write`, and `node tooling/scripts/sprint04-report.mts`. The first command rejects any unreviewed evidence hash. Run normal FULL-CI afterwards. Do not regenerate the contract compatibility baseline or quality/debt baselines to hide a regression.

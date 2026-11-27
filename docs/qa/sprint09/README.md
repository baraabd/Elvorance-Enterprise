# Sprint 09 — evidence-bound QA

Base: `main@453242e1256f6d876d170142b8ad235be9120344`, tree `6534bc4e7c7475e54e855095f652236f672ed052`.

Reviewed PRs #1–#8, #10 and #11. PR #6 reached its feature branch after that branch reached main; its nonempty-role guard and acceptance suites were absent from main. This PR ports the relevant checks without merging hosted deployment work. PRs #5, #7 and #8 are open historical/overlapping reviews; #11 is separate staging work. Requested Sprints 02–08 are not assumed complete.

## Confirmed defect

**S09-SEC-01 / High / FIXED IN BRANCH:** empty application roles passed `Array.every`, admitting signed roleless principals. Restore the shared guard for both development JWT and RS256 OIDC verification. Four new regressions: six legitimate-role positive controls, roleless principal denial, real service/gateway denial without forwarding, and actual RSA/JWKS verification. Local before: 1 pass / 3 fail. After: 4 pass / 0 fail. No real credentials or production probes.

## Matrix

`test-matrix.json` enumerates every discovered feature across all three applications and services, with source, roles, persistence, candidate test IDs and unresolved gaps. Links are not executed per-feature acceptance or instrumented coverage. Regenerate with `node tooling/qa/sprint09-matrix.mts --write`; check without `--write`.

| Area                          | Verification                                                                                                                              | Boundary                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Admin, Client, Representative | Existing unit/UI integration, parity and regression suites                                                                                | Frozen 64-route subset is not every discovered screen or hosted browser journey         |
| Seven services and gateway    | Type/build, API contract inventory, PostgreSQL/RabbitMQ Compose                                                                           | Synthetic CI authentication, not hosted company accounts                                |
| Cross-role workflow           | Rep discounted quote; blocked send/self-review; admin review; client decision; separate contract consent; one project/two unpaid invoices | Real HTTP/database/events, not three-browser UI automation or payment processing        |
| Identity                      | Signed roleless regressions and existing real Keycloak lifecycle lane                                                                     | Synthetic disposable account                                                            |
| Roles/tenants/owners          | 84-operation negative matrix with existing-record positive controls                                                                       | In-process handlers and memory storage, not exhaustive business states                  |
| Database isolation            | Owned roles, RLS, outbox/inbox/idempotency and cross-database denials                                                                     | Isolated CI PostgreSQL                                                                  |
| Recovery                      | Actual pg_dump/pg_restore to random new databases; exact rows, RLS, replay, outbox, cleanup                                               | Not hosted backup/PITR/coordinated cross-service RTO/RPO                                |
| Diagnostic load               | 120 gateway/CRM/PostgreSQL reads per concurrency 1, 4, 8                                                                                  | Not staging capacity/load/stress acceptance                                             |
| Security                      | npm audit, narrow source credential-pattern scan, CodeQL security-extended SARIF                                                          | Successful analysis is not zero findings; untriaged findings fail the SAST gate         |
| Native                        | Existing Android emulator and iOS simulator harness lanes                                                                                 | Physical Android/iPhone NOT EXECUTED; no connected devices; no signed final application |
| FULL-CI                       | Existing eight lanes and fail-closed aggregate retained                                                                                   | No baseline reset, test deletion or missing-evidence waiver                             |

## Hosted blockers and remaining risks

Read-only Railway observation on 23 November 2026: staging project `075e27d5-8edc-4ddd-8f27-a5eea3ef5d5a`, environment `49c49479-0810-491c-99cb-fc52ca547c04`; 14 successful latest deployment statuses, but staging-ops deployment `d434d8b0-cc8d-4b2a-8d4d-e231378208bc` CRASHED. Deployment status is not readiness or business acceptance. No live infrastructure/database/production changes were made by this sprint.

**S09-OPS-01 / High / OPEN:** operations deployment failure; cause not established here. Hosted recovery and service-failure tests not executed.

**S09-GOV-01 / High / OPEN:** main observed unprotected; no independent acceptance fabricated.

**S09-COV-01 / High / OPEN:** hosted original-screen journeys, physical devices and remaining legacy strict-typing/workflow gaps. Emulator or synthetic successes cannot close these.

## Performance agreement

`docs/production/budgets.json` says `PROPOSED_TARGETS_NOT_MEASURED_OR_APPROVED`. Proposed 100 users, 50/150 rps, 500/800 ms p95, 0.1% errors, 15-minute RPO and 60-minute RTO are neither agreed nor achieved. Hosted load/stress is BLOCKED until workload/cost and exact source/isolation are approved/verified.

Approval must specify role/tenant/data mix, endpoint read/write mix, arrival model, duration, latency/error definitions, event lag, saturation/abort limits, resource/cost caps, cleanup and recovery objectives. An environment name containing staging is insufficient isolation evidence. Report CI diagnostic measurements separately.

## Evidence decision

Local source and toolchain artifacts were hash-verified; all 515 declared baseline source hashes and 204 installed dependency versions matched. Local npm ci was unavailable due to DNS. Candidate source, exact command results, CI run/artifact IDs and hashes must be attached after execution; prior successes are historical only. This document does not predeclare current CI success. Keep draft/unmerged. **Production/store: NO-GO pending remaining evidence.**

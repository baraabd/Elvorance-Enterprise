# Production quality execution contract — S01

Contract version: 1. Source: the Sprint 1 execution request supplied on 22 November 2026.

**A separate accompanying execution-contract attachment was not available in the request, repository, or matching Project/Library search. This document implements the visible request; it does not claim to reproduce or obtain approval for an unseen contract. Any additional contract must be reconciled before acceptance.**

## Authority and scope

Work on a review branch. Preserve inspected implementation from PR #4 and the release gate from PR #3. Do not merge their heads into `main`, rewrite their branches, deploy hosted services, access customer records, submit to stores, or create provider credentials as part of S01. Disposable synthetic CI identities are test fixtures, never substitutes for company accounts or provider approval.

All three applications are in scope: administrator web, client mobile, representative mobile. Inventory actual registrations, handlers, forms, searches, filters, exports, background jobs, dashboards, permissions, account lifecycle, configuration and failure states. Demo and server implementations are separate records. A count from an old audit is not a completeness limit.

## Source and traceability

Record exact main, PR head, merge-base and tree identities. Recheck heads before publication. Use a new commit when anything changes and rerun mandatory checks on that commit. A pull-request merge ref and a branch head are different identities: report the **tested SHA and tree**, not merely the pull-request head. Historical run links retain their historical source only.

Every feature has a stable registration ID or source-derived observation ID, source path/line/fingerprint, app/mode, actual owning service (null for frontend-only observations), proposed target domain where unresolved, endpoints, authorization, persistence/event references, status, target sprint and contract/integration/E2E links. `PLANNED:` IDs are missing tests, not executed coverage. Static source references are traceability candidates, not proof that a test covers a workflow. Unknown or indirect mappings remain explicit review blockers. Full registration coverage and full semantic business acceptance are distinct.

Presentation-only exemptions require an explanation and source-bound fingerprint. Reviewed modal-open actions identify their separate business-submit action. Searches, exports, approval decisions, data mutations and privacy-sensitive actions are not exempt merely because their current implementation is local or demo.

## Code and architecture rules

Use strict typed, modular, maintainable changes; no new disabled type checking, unsafe `any`, non-null assertions or lint suppressions. Do not remove tests, routes or valid implementation to obtain a green build. New suppression debt cannot be offset by deleting unrelated old debt. `debt-baseline.json` is an explicitly measured legacy ceiling, not approval of that debt. A baseline edit requires review; `--baseline` refuses to overwrite existing files.

Maintain independent service-owned migrations and database roles, tenant/role/ownership authorization, validated input, safe output, scoped idempotency, optimistic concurrency and transactional outbox/inbox boundaries. Never read another domain database directly. Preserve backward-compatible public contracts or document and test an explicit migration. Do not change historical migration files as a repair for a deployed database without an approved compatibility plan.

Secrets belong in protected environments or secret stores, not source, reports, logs or chat. No fabricated external integrations, successful payments, push delivery, routing optimization, offline writes, staging acceptance or release approval.

## FULL-CI contract

The executable lane and command requirements are in `full-ci-contract.json`. The workflow `.github/workflows/full-ci.yml` invokes all existing verification suites through reusable workflows and adds inventory/debt checks, existing merged-example tests, real local-TLS identity integration, dependency audit, source secret-pattern checks and the new inventory/gate regression tests.

Required logical gates: Linux project checks with real PostgreSQL; Windows compatibility; distributed Docker/PostgreSQL/RabbitMQ journey; native verification prerequisites; Android lint/unit/build/emulator; iOS simulator; real disposable Keycloak PKCE/refresh/revocation integration; dependency/source-security checks. Formatting, boundaries, type checking, builds, the complete recursive existing tests, frozen design parity, all seven legacy regression scripts, examples and packaging remain present.

Only explicitly named **redundant platform** skips are allowed: the Windows duplicate PostgreSQL/Unix-permission checks and the native prerequisite job's duplicate PostgreSQL case. They must execute in the mandatory Linux project job. These exclusions are listed by exact test name, reported as skips, and cannot substitute for a mandatory logical gate. Any other skipped, missing, cancelled, pending, unexecuted or failed mandatory result means **BLOCKED**, never PASS. A zero-test or unparseable test report is BLOCKED.

`FULL-CI / required` runs with `always()` and depends on every logical group. It verifies each lane's source SHA/tree, run/attempt, repository, lockfile digest, command exit status, timestamps, counts and raw evidence hashes. It downloads artifacts from the **same run only**, verifies the archive SHA-256 against GitHub's digest and verifies every declared inner file. Expired, duplicate, foreign-run, modified or missing evidence blocks. The evidence manifest records actual source and output identities without a self-referential commit SHA in tracked documentation.

Workflow existence is not branch-protection enforcement. At source inspection, `main` was unprotected with no required checks. An administrator must enable this exact required check, strict up-to-date/merge-queue policy, review requirements and no bypass as appropriate; verify the live settings afterward. A reviewed recommendation is not a claim that enforcement was changed.

## Evidence, budgets and acceptance

Keep engineering CI, product completeness and production release decisions separate. S01 can deliver CI/inventory foundations while semantic mapping, external infrastructure or release readiness remains BLOCKED. Do not declare S01 DONE merely because the engineering pipeline is green. Report unresolved work and the next owner/action explicitly.

Report exact tested SHA/tree, run URL/attempt, command-level pass/fail/skip totals and artifact IDs/digests. Counts from repeated lanes are not unique workflow coverage. Preserve raw logs, TAP totals, native XML/xcresult summaries and runtime reports. CI artifacts have finite retention; archive reviewed evidence to approved long-term immutable storage before expiration. No long-term archive or signing attestation is claimed without evidence.

Capacity, availability, recovery and coverage numbers in `budgets.json` are **proposals, not measurements**. A passing build is not a load test, restore drill, threat assessment or vulnerability-free guarantee. No measured code-coverage percentage is available unless a corresponding coverage instrument/report is produced.

Final acceptance requires the exact final commit's complete mandatory gate evidence, reconciliation of any unavailable accompanying contract, review of unresolved inventory mappings, and approved owners for remaining blockers. Any last-minute change invalidates the previous final gate and requires a fresh complete run.

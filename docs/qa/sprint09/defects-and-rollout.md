# Sprint 09 follow-up defects and rollout constraints

## S09-FIN-01 — High — discounted contract fulfillment

Reproduction: FULL-CI run 45155075472 / runtime job 137625848022, PR head 85dd2b0e66443a95ee46cad3e4fed77b62840c5c / merge d980ef8cfa53319964b48ff1ca2663361eb8b268. The representative requested a 20% discount, administrator approved, client accepted and separately signed the contract. Billing compared gross line items (10000 minor units) with net total (8000), while the emitted snapshot omitted the approved discount. Fulfillment did not converge in 60 seconds. Increasing the timeout would not correct this accounting invariant.

Fix: preserve subtotal and discount from the immutable accepted quote in the approved snapshot; validate gross subtotal, integer discount, net total and installment sum independently before any billing write. Do not silently infer a discount from a mismatching total. Additive v1 fields are optional only for legacy _undiscounted_ events. Legacy snapshots with inconsistent totals continue to fail closed. Tests cover wire evidence, duplicate event IDs, duplicate business events, unchanged unpaid state, historical compatibility, eight invalid evidence variants and retry after rollback.

Local regression: before 1/4 pass and 3/4 fail; after 4/4 pass. Actual distributed rerun must be verified separately on the final source.

Deployment sequence is **consumer-first**, then sales producer. An old billing consumer cannot process a new discounted event. This PR does not deploy either service. Preexisting rejected discounted v1 events lack the new evidence and are not automatically repaired/replayed. Their remediation requires an owner-reviewed DLQ/outbox audit and reconstruction from the authoritative immutable accepted quote without modifying accepted financial terms. No database migration or historical data rewrite is performed here.

## S09-SAST-01 / 02 — OPEN, merge blocker

CodeQL security-extended executed in run 45155075585 and produced 13 warning-level results: two missing-rate-limiting findings (shared service authentication hook and gateway hook), and eleven file-system race warnings across secret/identity administration, local environment initialization, build/dev/release tooling and one build-output test. These are real analyzer findings, not 13 demonstrated exploits. The two hooks were inspected and have no application-level rate limiter; upstream infrastructure protection has not been established. Secret-file check/use races need descriptor-based access and platform-aware regression checks; tool/test-only warnings need separate threat-model triage. Provisional severity: High for unbounded public authentication work, Medium for sensitive credential-file race exposure, Low/Needs-review for build/test-only warnings. No finding is suppressed or waived. The SAST gate remains failing until reviewed remediation or justified exact-location triage is approved.

## Hosted and browser observations

Read-only Railway staging-ops log for deployment d434d8b0-cc8d-4b2a-8d4d-e231378208bc reports `GET /ready: HTTP 503, expected 200.` The internal failed dependency is not established from this log. Local Chromium navigation was prevented before application execution by `ERR_BLOCKED_BY_ADMINISTRATOR`; no screenshot or browser-render acceptance was obtained. Do not count blocked navigation as an application defect or as passing E2E.

Keep draft and unmerged. Production, stores, hosted load/stress and physical-device acceptance remain NO-GO / NOT EXECUTED as applicable.

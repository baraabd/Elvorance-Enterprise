# S01 pull-request reconciliation — 23 November 2026

This records source inspection and repair scope, not an independent approval, a successful future CI run, or a production release decision. Final commit/run identities are recorded in PR #5 after execution; never transfer earlier green runs to a changed commit.

## Observed references

| Reference           | Inspected SHA                              | Disposition                                                                                                                                                          |
| ------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current main        | `453242e1256f6d876d170142b8ad235be9120344` | Preserve current source; tree `6534bc4e7c7475e54e855095f652236f672ed052`.                                                                                            |
| PR #5 before repair | `a255f2d987a2e0992965ff9147d1ea7b78b2b9d6` | Already includes main; repair its additional diagnostic/tests and regenerate canonical inventory.                                                                    |
| PR #7               | `e90ebdc9f2ed783237714c1d83441793e3c7eb76` | Competing older S01 tooling, not a separate application feature. Preserve its branch/history; do not overlay it on the newer canonical foundation.                   |
| PR #8               | `04aec5b7fea1599c123623dd771a4010c7c69978` | Already an ancestor of main: main is four commits ahead, zero behind, and has an identical tree. No duplicate merge into its old feature-branch target is necessary. |

PR #5's four original Arabic audit documents are historical observations of their explicitly listed 21 November snapshots. Their old main/PR statuses and operation counts are not current runtime acceptance. The canonical current inventory is `docs/production/feature-matrix.json`.

## PR #5 repair

- Retain current main's gateway implementation, readiness probe, timeout and safe error contracts; avoid an unnecessary source-fingerprint change from alternate formatting.
- Preserve all current gateway assertions, including `cache-control: no-store`, and retain PR #5's additional unauthenticated/no-forwarding regression.
- Keep the source-only diagnostic, but remove new non-null assertions and validate the input contract. Resolve finite registrations with the canonical compiler-symbol resolver instead of treating unknown template expressions as wildcard proof.
- Preserve the original two fixture tests and add negative/finite-branch/schema cases. Place these under `tests/production/`, not business backend tests, so synthetic endpoint strings do not create false workflow-coverage candidates.
- Regenerate source-bound inventories from the final checkout. Extend only the test-preservation floor; do not reset the legacy type-debt ceiling, delete required suites, or relabel missing workflow tests as covered.

## PR #7 supersession and failure evidence

The archived Windows evidence from run `45000157448`, artifact `14744639792`, records 267 Node cases: 262 passed, zero failed, five skipped. The older `tooling/production/run-quality.mts` permits only one skip outside Linux, and explicitly accepts only the duplicated PostgreSQL case; this blocks the Windows job and aggregate despite zero failed assertions. Raising a raw skip ceiling is not an acceptable repair.

The canonical implementation already uses exact named platform exclusions in `full-ci-contract.json`, requires every logical test to run in Linux, and verifies source/run/attempt and archive/file evidence. Retain that implementation rather than reintroduce the old policy.

| Older PR #7 area                                                    | Canonical retained implementation                                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `extract.mts`, `runtime-census.mts`, separate runtime/test catalogs | `discover.mts`, `runtime.mts`, `registration-source.mts`, `semantic-bindings.mts`, and source-bound `feature-matrix.json` |
| `run-quality.mts`, old aggregate and evidence shape                 | `run-lane.mts`, `aggregate.mts`, `gate.mts`, `evidence.mts`, `full-ci-contract.json`                                      |
| Separate `s01-identity.yml`                                         | Required `identity` job in `full-ci.yml` and `identity-fixture.mts`                                                       |
| `NEXT-SPRINT.md`, infrastructure/ownership/coverage documents       | `S02-HANDOFF.md`, `blockers.json`, `ownership-dependency-map.json`, `workflow-debt.json`, `semantic-review.json`          |
| `tooling/scripts/test.mts`                                          | Byte-identical runner in the inspected archives; preserve recursive suites.                                               |
| Optional `S01_SOURCE_SHA` runtime override                          | Canonical runtime uses the actual `GITHUB_SHA`; do not reintroduce a caller-supplied evidence identity override.          |

This is deliberate selection of one foundation, not a claim that the two implementations or every test are byte-identical. The alternative source remains available at its original branch/SHA for review. Its historical failed run is not changed to PASS by closing or superseding a duplicate PR.

## Acceptance and manual operations

Owner adoption of the execution contract and interim backlog ownership was recorded on PR #8 in comment `7092887757`; it is not independent code approval. The named owner remains responsible for the accepted target-sprint allocations and release blockers.

The active connector cannot mutate repository protection. Main protection and independent approval must be verified from live settings and an actual authorized reviewer; neither is implied by this document or by green CI. CODEOWNERS currently routes only to the PR author. Add a real, authorized independent code owner in the base branch through reviewed, fully tested changes before relying on mandatory code-owner approval. Do not create a second self-owned account, self-approve, weaken checks, or bypass review.

For an authenticated administrator, the existing guarded `tooling/production/protect-main.mts` accepts a freshly read `--expected-main` SHA and writes actual settings readback. Do not reuse the obsolete `12264edf...` expected SHA after main has moved. Keep staging, external providers, signing/devices and measured load/restore separate from S01 code review and baseline measurement.

Gateway proxy registrations are reported separately from domain operations. Unknown proxy namespaces fail the supplemental audit; their presence cannot silently exempt a route.

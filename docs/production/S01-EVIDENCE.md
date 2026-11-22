# S01 implementation and evidence report

## Decision

Source reconciliation, reproducible inventory/debt tooling and fail-closed CI foundations are delivered as reviewable branch changes. **Final execution acceptance is determined only by the final-commit FULL-CI artifact.** This committed document intentionally does not claim a future run is successful or embed a self-referential final commit SHA. Production, hosted integration and store approval remain BLOCKED by the items below even when code-verification gates pass.

## Input source reconciliation

`source-reconciliation.json` records the live main and PR #3/#4 heads, comparison and input check references. PR #4 is nine commits ahead of observed main and not behind; its valid implementation is retained as the baseline. PR #3 contributes a single independent release-readiness document, preserved byte-for-byte, not a competing implementation. The original PRs and main are not merged or rewritten. Historical descriptions and prior check totals are not imported into S01 results.

The analysis environment recovered the source and Linux toolchain from GitHub artifacts and verified their SHA-256 digests. The export contains review-generated files and can normalize executable modes, so a synthetic local export checkpoint is **not** an upstream commit. Remote review changes are applied against the real PR #4 tree; final CI checks out the real final head. The final source-package gate compares tracked source against Git blobs and records generated differences explicitly.

## Implemented controls

The TypeScript AST extractor inventories route/action declarations and handlers, forms/control call sites, search/filter/export surfaces, failure handlers, background timers and event edges. Isolated runtime loading proves the three demo registration sets, shared live sections and Fastify method/path registrations. Runtime business operations are checked bidirectionally against declared API contracts; source hashes prevent silent drift outside recognized syntax. No historical count is treated as exhaustive. The current 69 demo registrations include five routes absent from the 64-case frozen parity set; `coverage-gaps.json` names them explicitly, without modifying the historical baseline. A separate workflow-gap ratchet blocks new missing test links.

The matrix distinguishes demo-local functionality, live server implementation, compatibility-only representative workspace, DOM-only actions and unresolved semantics. Technical owners, endpoints, authorization and persistence/event source references, sprint proposals and existing/planned test IDs are present per entry. Unknown effect chains and missing executable-test links are retained as gaps. Semantic completeness and measured workflow coverage are not inferred from a registration count or a test title.

The debt baseline measures lexical TypeScript suppression directives, explicit `any` AST nodes, static test skip/todo/only declarations and TypeScript files outside the root check scope. New S01 scripts/tests are included in strict TypeScript. Per-item identity comparison prevents replacing one legacy suppression with a new one while keeping the same total. `debt-baseline.json` contains measured values; it is not evidence that legacy debt was eliminated.

FULL-CI preserves the pre-existing Linux/Windows quality, real PostgreSQL, distributed runtime and Android/iOS verification suites, adds the previously separately runnable real local identity lifecycle, runs standalone merged/example suites and adds inventory/gate regression tests. It requires actual results, exact source/run/attempt agreement, source archives and artifact/file digests. Missing or unsuccessful dependencies cannot make the aggregate green. An advisory outage also blocks rather than inventing a clean security result.

## Measured versus proposed

Read current measured static counts from `feature-matrix.json.summary`, `runtime-registrations.json` and `debt-baseline.json`. Read execution totals, failures and skips from the final `FULL-CI.json` and each linked gate artifact. The same suites execute on several platforms; their totals must remain separate. Existing source audit reports, test declarations and generated inventory counts are not current executed test totals.

`budgets.json` contains proposed capacity, recovery and coverage targets with null measurements. `infrastructure-blockers.json` contains sanitized read-only platform observations and missing provider/operational evidence. No credentials, deployments or external provider functionality were fabricated. No source changes claim to complete unimplemented workflows from later sprints.

## Closure still requiring evidence or action

The exact-source FULL-CI run must finish and its aggregate must verify every mandatory gate after the last change. Main-branch protection must independently require FULL-CI and review; the observed repository configuration did not enforce this. Symbolic controls and currently unmapped workflow/test relationships need semantic review. Hosted staging identity/service integration, external delivery providers, data recovery, capacity, on-call ownership and native/store release requirements remain open. See `NEXT-SPRINT.md` for owners, acceptance conditions and dependency order.

A remote PASS means the S01 verification contract passed, not that these production blockers disappeared. If the final aggregate is absent, pending, failed or otherwise unverifiable, report S01 final CI as **BLOCKED**, including the exact missing gates and run link.

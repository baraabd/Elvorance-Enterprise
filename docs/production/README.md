# Production foundation inventories

Start with [the quality contract](QUALITY-CONTRACT.md), [source reconciliation](source-reconciliation.json), [the S01 report](S01-EVIDENCE.md) and [the S02 handoff](NEXT-SPRINT.md).

## Reproduce and review

```sh
npm ci
npm run inventory:check
npm run test:production
npm run ci:quality -- local
```

The final command is a local diagnostic run, **not** the remote FULL-CI aggregate. It cannot manufacture Docker, native runners, hosted infrastructure or external credentials. Run `.github/workflows/full-ci.yml` for the complete contract and inspect the aggregate artifact after every job finishes.

When a legitimate feature changes, run `npm run inventory:write`, inspect the semantic/source diff and commit the updated generated files. This command does not raise the debt baseline. Stable registration IDs include application/mode/source/symbol; anonymous repeated controls include an occurrence discriminator. Source reordering/renaming can change anonymous IDs and requires review. No historical count is a coverage ceiling.

## Machine-readable artifacts

| File                           | Meaning                                                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feature-matrix.json`          | Source-derived registrations and surfaces, source hashes, ownership, endpoint/authorization/persistence links, status, proposed sprint and test-ID gaps. |
| `runtime-registrations.json`   | Actual demo registrations, live shared sections and Fastify method/path registrations including automatic HEAD and gateway expansions.                   |
| `test-catalog.json`            | Actual test declarations with stable IDs and locations. This is not an execution report; dynamic/native totals come from CI.                             |
| `architecture-inventory.json`  | Package manifests, all production-source hashes, migrations, native permissions/configuration and infrastructure file hashes.                            |
| `data-flow-inventory.json`     | Event publication/subscription sites, timers/jobs, broker topology and trust boundaries.                                                                 |
| `ownership-dependencies.json`  | Technical owner inventory and source import graph; personnel assignments are not invented.                                                               |
| `debt-baseline.json`           | Exact allowed legacy debt identities, not a target or a claim of clean legacy source.                                                                    |
| `infrastructure-blockers.json` | Sanitized fresh platform observations and missing integration/operational evidence.                                                                      |
| `budgets.json`                 | Proposed measurable targets and required future experiments; measurements remain null.                                                                   |

## Counting and completeness

Do not sum routes, controls, event sites and HTTP expansions as “features”. A filter call site, a form, its submit handler and its HTTP endpoint are different inventory layers and can describe the same user workflow. The current counts are generated in `feature-matrix.json.summary`; the application registry sets, not a manually written number, are authoritative.

Local demo applications and their local-storage actions remain separate from server mode. Admin/client use the shared authenticated live workspace. The representative uses a dedicated server entry; the shared representative sections are retained compatibility code, not evidence that both UIs are deployed. The source census exposes dashboards, account/profile/settings and permissions surfaces in these different modes rather than asserting parity between them.

Empty endpoint/effect/test lists mean **unresolved or absent evidence**, not presentation-only behavior. The extractor follows local/imported symbols conservatively and preserves unresolved effects. Contract roles describe declared authorization, not proven ownership/tenant enforcement. Only explicitly inspected DOM-only actions receive the presentation-only exemption. UI empty/loading/error/retry branches are source observations; complete user-visible failure-state acceptance still needs named scenario tests.

The census checks registration completeness mechanically. Semantic completeness remains BLOCKED until symbolic controls and all workflow mappings are reviewed. `evidenceLinkedWorkflowCoveragePercent: 0` means no per-feature executed E2E evidence has yet been attached to this inventory; it does **not** say the repository has no tests or no passing workflows. Planned `required.*` test IDs are backlog identifiers, not test implementations. Preserve this distinction in reports.

## Evidence retrieval

The full workflow uploads `s01-full-ci-<source-SHA>-a<attempt>` containing `FULL-CI.json` and `FULL-CI.sha256`. The JSON links every gate artifact by GitHub ID, run attempt and archive SHA-256 and includes measured per-gate totals. Individual artifacts include original paths and a per-file digest manifest; the aggregate verifies those bytes. The source archives additionally contain a source-to-Git-blob proof in the quality evidence. Historical runs in source reconciliation are input observations only.

The current frozen-parity gap is five registered routes: `admin/configuration`, `admin/visits-completed`, `client/decisions`, `client/needs-survey` and `rep/visit-questionnaire`. These are not silently added to or removed from the historical snapshot suite. The generated gap inventory tracks them separately; another regression suite may exercise them, but that is not a frozen-parity case.

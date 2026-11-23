# PR #5 / #7 / #8 reconciliation — 23 November 2026

This record describes source integration, not independent approval, a merge into main,
live branch protection, hosted deployment or production release.

## Fresh source, not historical PR descriptions

| Reference | Inspected SHA                              | Disposition                                                                                                                                                                   |
| --------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| main      | `453242e1256f6d876d170142b8ad235be9120344` | Current integration base; FULL-CI run `45122862230` completed successfully for this exact SHA.                                                                                |
| PR #5     | `a255f2d987a2e0992965ff9147d1ea7b78b2b9d6` | Preserve historical audit documents, the extra authentication regression and the secondary source scanner; reconcile onto current main.                                       |
| PR #7     | `e90ebdc9f2ed783237714c1d83441793e3c7eb76` | Alternative S01 implementation, not a sequential dependency of #8. Preserve useful unique safeguards below; do not overwrite canonical tooling with its incompatible schemas. |
| PR #8     | `04aec5b7fea1599c123623dd771a4010c7c69978` | Already an ancestor of main, with identical tree `6534bc4e7c7475e54e855095f652236f672ed052`; no remaining code diff to integrate.                                             |

PR #5's initial current-main merge candidate was
`0aa4928f1e434d3c2df6f70bf6de2178aa48ac46`, tree
`f4c9f7687fb2e7fcef652077b3f0d409f01ca18a`. Its run `45123062801`
failed inventory drift despite 312/312 Linux Node tests passing. Further inspection
found two new non-null assertions in its scanner and a dropped `no-store` assertion.
Neither is accepted into the reconciled source. Main's gateway implementation is
preserved byte-for-byte; the extra authentication regression retains cache protection.

## Preserve valid #7 work, not its failed alternative pipeline

The old #7 run `45000157448` failed its Windows lane and final aggregation.
Its Windows runner permitted only one PostgreSQL skip and rejected the existing
POSIX-only duplicate skips. Canonical main's reviewed contract already names those
platform duplicates individually and executes every logical case on Linux.
No skip policy is broadened here, and historical failing runs are not relabeled PASS.

| #7 capability                                                                                      | Canonical disposition                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime/AST census, architecture/data flow, ownership, threat/debt and test-gap inventory          | Retain current `tooling/production/{runtime,discover,inventory,registration-source,semantic-bindings}.mts` and source-bound generated records. Their schemas are not compatible with the older alternative.                                |
| Fail-closed aggregate, source/run/attempt binding, artifact hashes, identity/native/runtime checks | Retain current `gate.mts`, `aggregate.mts`, `evidence.mts`, `run-lane.mts` and eight-lane FULL-CI contract. No existing main suite is removed.                                                                                             |
| Parser-aware comment trivia                                                                        | Port into `debt.mts` with four regression cases. A template-text case fails against the original scanner, then passes after the repair. Preserve legacy item fingerprints and ceilings.                                                    |
| Source archive / Git blob comparison                                                               | Port into strict `source-proof.mts`, add six regression cases, and make it mandatory after packaging in Linux AND Windows. Preserve Git-attribute normalization; only the existing parity result may be a declared generated tracked file. |
| Old generated reports and alternative fixtures                                                     | Preserve in the original branch/commit as historical evidence, not as a second active incompatible gate or proof of current workflow coverage.                                                                                             |

The secondary #5 scanner now uses the canonical finite compiler-symbol resolver.
An unknown dynamic template cannot verify an arbitrary declared endpoint. Four fixtures
cover finite registrations, missing operations, unresolved dynamic expressions and
undocumented domain operations. Gateway proxy registrations are retained separately
rather than mislabeled as undocumented domain-service business operations.

## Non-regression and final evidence

Regenerate all six source-bound inventory outputs. Do NOT reset `debt-baseline.json`.
Extend only the test-ID floor in `quality-baseline.json`; preserve registered IDs and
the existing uncovered-workflow ceiling. The 244 unmapped workflows and their accepted
later-sprint allocations remain explicit; this repair does not invent their coverage.

The executable FULL-CI contract gains only the mandatory `source-package-integrity`
command in both packaging lanes. No mandatory lane, test suite, skip restriction or
security check is removed. This stronger contract change still requires code-owner review.

Final commit, exact run/attempt, counts, skips and artifact digests must be linked from
the PR after publication. Local diagnostics are not FULL-CI; pending or missing evidence
is BLOCKED. This document cannot assert success for its own future commit.

## Governance and release boundaries

Prior owner adoption of the unchanged QUALITY-CONTRACT and interim backlog ownership
is retained. Fresh inspection still found main unprotected. The connected integration
has no Administration mutation access; do not harvest credentials, self-approve or bypass
the independent review to obtain a green acceptance state.

Use the administrator's normal authenticated gh session and the fresh main SHA with
`tooling/production/protect-main.mts`, then retain its actual settings readback.
A real reviewer other than the author/last pusher must approve the exact final source.
CODEOWNERS routing must include an eligible independent reviewer; the author-only
CODEOWNERS file is not an independent approval.

Close #8 as already incorporated and #7 as superseded only with these provenance links.
Keep their branches/history. Use #5 as the remaining current-main integration review;
do not merge three overlapping S01 implementations sequentially. Production stays
NO-GO independently of engineering CI and Sprint 1 governance acceptance.

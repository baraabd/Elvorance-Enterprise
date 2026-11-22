# Production foundations — S01

Start with [QUALITY-CONTRACT.md](QUALITY-CONTRACT.md), [S01-EVIDENCE.md](S01-EVIDENCE.md), [SOURCE-RECONCILIATION.md](SOURCE-RECONCILIATION.md) and [INVENTORY-METHODOLOGY.md](INVENTORY-METHODOLOGY.md).

Generated machine views: `feature-matrix.json`, `architecture-inventory.json`, `data-flow-inventory.json`, `ownership-dependency-map.json`, `workflow-debt.json`. Non-regression: `debt-baseline.json`, `quality-baseline.json`. Execution: `full-ci-contract.json`, `CI-OPERATIONS.md`. Risk and planning: `THREAT-MODEL.md`, `blockers.json`, `budgets.json`, `S02-HANDOFF.md`.

Run `npm run inventory:check`. Review changes before `npm run inventory:write`; never reset baselines to conceal debt. Final acceptance requires the exact final commit's complete FULL-CI evidence. Missing mandatory gates and unresolved acceptance dependencies remain BLOCKED. Production remains NO-GO until separately reviewed operational and release evidence exists.

## Registration-source closure follow-up

`registration-source.mts` reconciles runtime registrations with finite source-defined loops, imported literal registries and role-selected server sections. Bindings use compiler symbols rather than identifier text. The resolver does not execute unknown calls; mutable variable values, cycles, ambiguous property overrides and unsupported dynamic inputs remain unresolved. Automatic HTTP HEAD registrations inherit their real source declaration, but are **not** presentation-only UI exemptions.

`semantic-review.json` is generated with the other inventories and checked for drift. It partitions extractor warnings into registration anchors, unresolved/dynamic endpoints, native-policy review, test-mapping debt and unknown warnings. All record IDs and warning text remain visible. Unknown warnings fail closed, and zero warnings is explicitly **not** exhaustive business acceptance. `workflow-debt.json` continues to measure unmapped workflows without pretending candidate links or planned test IDs are executed tests.

The live governance verifier and guarded administration helper are documented in `CI-OPERATIONS.md`. Their presence and passing unit tests do not establish live branch protection. Contract reconciliation, named ownership, unresolved semantics, final-source FULL-CI and actual administration readback remain separate acceptance requirements.

## Source-bound semantic traceability

`semantic-bindings.json` records individually reviewed source observations, not broad ignore rules. Every binding carries its feature fingerprint and complete evidence-file hashes. The loader validates registered endpoint templates, all conditional request branches, delegates and native declaration/export anchors before applying any binding. Original expressions remain in `sourceTrace`; backend policies are referenced per operation instead of being collapsed into an invented UI authorization policy.

`semantic-review.json.semanticStatus` distinguishes source-trace closure from the separate missing-test backlog. `status` remains BLOCKED while that backlog is present. Nothing in these fields is human approval, runtime acceptance, a coverage percentage, external-provider verification or a production release decision. See `SEMANTIC-TRACEABILITY.md`.

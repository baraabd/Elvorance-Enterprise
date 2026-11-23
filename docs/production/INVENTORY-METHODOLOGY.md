# Inventory discovery and review

`npm run inventory:check` regenerates the inventory in memory and compares canonical results with the committed files. `npm run inventory:write` updates the generated views but still enforces the legacy non-regression baselines. Initial baseline creation is explicit: `node tooling/production/inventory.mts --write --baseline`; it cannot overwrite an existing baseline.

The generator executes actual demo feature registrations in disposable JSDOM fixtures without rendering/mutating business state, probes actual Fastify `onRoute` registrations without listening on a network, invokes shared live-section definitions for administrator/client, and parses the representative's actual private page registry. Dynamic registry shapes fail closed rather than falling back to a historical route list. The business OpenAPI inventory is checked in both directions against actual explicit backend routes; implicit HEAD companions and gateway proxy routes remain separately visible.

The TypeScript compiler API discovers source handlers, HTML form/delegation attributes, API calls, resource-path bindings, search/filter/pagination, exports, scheduling/consumption, authorization controls, account lifecycle, configuration and error states. It follows callable declarations up to six levels for endpoint/persistence/event/control references. File digests catch drift even when a new construct is not recognized by a specialized extractor. Reviewers must inspect that changed source; running `--write` is not semantic approval.

## Reading the machine-readable files

- `feature-matrix.json`: each actual registration and each source observation, source evidence, status, proposed sprint and test references. `owningService:null` means a frontend/shared observation has no proven backend owner; `targetService` is then a proposed allocation, not an implemented endpoint. An empty endpoint list is explicit missing/unresolved mapping, not an invented API.
- `architecture-inventory.json` and `ownership-dependency-map.json`: actual workspace manifests, imports, domain ownership, migrations and entrypoints. Accountable roles are proposals; named operating owners remain unassigned.
- `data-flow-inventory.json`: source-backed endpoint/table/event edges and trust boundaries. An edge is not evidence of successful persistence or cross-app execution.
- `workflow-debt.json`: unmapped workflows and missing contract/integration/E2E candidates. Coverage percentage is null/NOT_MEASURED, not a guessed percentage.
- `debt-baseline.json` and `quality-baseline.json`: exact legacy suppression identities and retained registration/test IDs. Unrelated removals cannot buy new suppressions or uncovered workflows.
- `inventory-dispositions.json`: narrowly reviewed presentation-only modal-open exceptions, bound to the whole source-file digest. The save actions remain separate business work.

## Completeness boundaries

Actual registered routes/actions are compared bidirectionally and never capped at old counts. Source-level inventory is broader than those registrations; totals include overlapping observations (for example a submit handler can also contain an API call and a failure state). They are **not a count of unique product features or verified workflows**.

Semantic completeness remains BLOCKED while unresolved bindings exist. Dynamic dispatch, delegated behavior, native adapter methods, external providers and real-device/browser journeys require owner review and executed tests. Native files are assigned to their actual app, not automatically to the representative. Native adapters are listed per source file, with method-level acceptance explicitly pending. No blanket claim of exhaustively tested business functionality is made.

Static test mappings are candidates. Each feature also carries `PLANNED:contract:...`, `PLANNED:integration:...` and `PLANNED:e2e:...` IDs with a NOT_EXECUTED implementation status. Completing a future sprint requires implementing/linking those tests and retaining current-run results, not merely renaming the planned IDs. JSDOM is not browser E2E; native simulator/harness results are not physical-device/store acceptance.

Review order: high-risk server writes and authorization; account lifecycle and fail-closed configuration; all cross-app commercial state transitions; original demo UI migration; dynamic forms and filters/exports; background event delivery and privacy-sensitive tracking; native lifecycle and permission failures. Remove an unresolved marker only with source and corresponding contract/integration/E2E evidence.

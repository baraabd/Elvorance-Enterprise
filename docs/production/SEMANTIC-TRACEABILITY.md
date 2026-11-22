# S01 source-bound semantic traceability

## What is resolved, and what is not

The source reconciliation continuation resolves the extractor's current indirect-endpoint and per-adapter warning queue using explicit, individual source decisions in `semantic-bindings.json`. It does not implement missing production features, certify completeness of product requirements, grant independent approval, or measure test coverage. A domain workflow may be accurately inventoried as unimplemented or untested.

The generated `semantic-review.json` separates these dimensions. `semanticStatus: SOURCE_TRACE_COMPLETE_NOT_RUNTIME_ACCEPTANCE` means no current extractor semantic warning remains after validated bindings. Its overall `status` remains BLOCKED while test-mapping debt remains. The quality execution contract, live branch enforcement, final-source FULL-CI and acceptance review remain separate gates.

## Evidence and validation

Each binding targets an exact feature ID and source fingerprint, gives a specific rationale and hashes every cited source file. Evidence paths must be in the scanned app/service/package source. Any source change, deleted observation, unknown category, duplicate binding, stale declaration anchor or unbound delegate fails before any feature is mutated. This intentionally requires review even for a harmless edit in a cited file; it prefers false alarms to silent stale approval.

Parameterized request expressions retain the original method/path and are matched against the actual registered backend operations. The two current quote branches require both POST collection and PATCH entity operations. Arbitrary runtime expressions cannot be reduced to a convenient endpoint by annotation. The generated feature includes `sourceTrace.originalEndpoints`, `dynamicEndpointBindings`, and `backendPolicies` with each owning service, authorization source, persistence/event source and registration anchor. These are source observations; the API still needs actual authorization/persistence/journey tests.

Finite shared form helpers list their current caller set, with create/update and command/read operations distinguished. Generic event callbacks, cleanup, local draft state, intent keys, OIDC discovery and navigation delegation are described according to the actual code. Local state is not called durable business persistence. A shared renderer is not claimed to be a server-integrated legacy screen. Provider endpoint URLs obtained from validated discovery are not fabricated domain-service routes.

Presentation-only classifications are limited to controls that have no backend endpoints or domain operations and whose source performs only the described UI behavior. HTTP HEAD, searches, exports, privacy controls and business commands are not exempted. Their future workflow tests remain planned where absent.

## Native boundary

The native inventory includes current Java/Swift declaration starts, computed policy properties and bridge-export registrations. Multi-line signatures are anchored at their declaration start; whole-file hashes bind their complete implementations. Calls are not miscounted as declarations. This is not a universal Java/Swift semantic compiler or an instrumented method-coverage report.

The representative adapters delegate to validated browser sessions and secure storage. Empty client native entrypoints, generic lifecycle stubs, package manifests and marker constants are explicitly classified as scaffold. They are not credited with the representative bridge's security behavior. AppDelegate and SceneDelegate presence alone does not establish background sync, recovery or account lifecycle acceptance.

## Non-regression and tests

The binding loader cannot remove the missing-test warning or rewrite contract/integration/E2E candidate links and planned IDs. The existing 244 unmapped workflow baseline is retained rather than populated with unrelated tests. The new unit tests exercise stale source, deleted features, duplicate/foreign policy references, unsupported runtime URLs, incomplete conditional branches, wrong verbs, atomic validation, fabricated presentation exemptions, native call/declaration confusion and preserved test debt. The repository-snapshot integration test binds all current decisions to actual files and still requires the missing-test backlog to remain visible.

Source policy references and a passing inventory gate never substitute for FULL-CI. Hosted provider readiness, final signed binaries, physical-device acceptance, recovery and capacity budgets retain their documented release dispositions.

# S02 handoff — configuration, identity and inventory closure

**Entry condition:** review S01's exact final-commit evidence and unresolved blockers. A generated inventory is not authorization to mark all applications production-ready. The proposed sprint allocations in feature records are planning targets pending the owner's ten-sprint plan, not a claim that missing planning context was supplied.

## Priority work

First reconcile the unavailable accompanying execution contract, assign named owners and activate/read back required-check enforcement. Review unresolved dynamic endpoints and native method-level behavior in `feature-matrix.json`. Keep the source/registration inventory intact and implement test IDs rather than claiming candidate links as coverage.

Next make all three application production configuration paths explicit, server-only and fail-closed: approved HTTPS gateway/issuer/origins, no default demo config, no production secrets in a browser bundle, clear environment separation and startup/error states. Preserve the dedicated representative entry. Administrator/client original screens are not all migrated by their small shared live workspaces.

Close account lifecycle: real hosted company identity provisioning, roles/tenant/ownership changes, refresh/logout/expiry, disabled users, recovery and the approved deletion/retention/export contract. Use authorization tests for every operation and native callback/storage/permission failure acceptance. Do not invent email/SMS/provider delivery or credentials.

For each workflow, bind the real endpoint and owning service, DTO/schema/version, auth policy, persistence/event result, idempotency/conflict behavior, loading/empty/offline/permission/server-failure state, and contract/integration/browser-E2E tests. Replace planned IDs only when implemented. Keep demo and server results distinct.

## Blocking external dependencies

`blockers.json` holds observed hosted infrastructure and unverified provider/signing/device/operational prerequisites. Railway's staged patch is not a deployment; apply it only in a separately authorized deployment workflow after configuration/security review. No Elvorance project was found in the connected Vercel team. Other accounts were not inspected. Route optimization, external notification channels, payment-provider charges and offline writes are not delivered capabilities.

## Debt and acceptance

Reduce the exact legacy suppression baseline incrementally; new code remains strict. Add instrumented coverage before claiming a percentage, using `budgets.json` as proposed targets. Establish actual load and recovery evidence on isolated staging before promotion. Update inventories, threat controls and ownership/dependency maps with each change.

Final S02 output: scoped review branch, migration/rollback decisions, updated inventory and implemented test traceability, external blockers with named owners, then **complete FULL-CI on the last commit**, with exact SHA/tree/run/attempt/totals/skips/artifact digests. Missing or pending mandatory evidence remains BLOCKED. Do not merge or release based solely on a historical green run.

# Production foundations — S01

Start with [QUALITY-CONTRACT.md](QUALITY-CONTRACT.md), [S01-EVIDENCE.md](S01-EVIDENCE.md), [SOURCE-RECONCILIATION.md](SOURCE-RECONCILIATION.md) and [INVENTORY-METHODOLOGY.md](INVENTORY-METHODOLOGY.md).

Generated machine views: `feature-matrix.json`, `architecture-inventory.json`, `data-flow-inventory.json`, `ownership-dependency-map.json`, `workflow-debt.json`. Non-regression: `debt-baseline.json`, `quality-baseline.json`. Execution: `full-ci-contract.json`, `CI-OPERATIONS.md`. Risk and planning: `THREAT-MODEL.md`, `blockers.json`, `budgets.json`, `S02-HANDOFF.md`.

Run `npm run inventory:check`. Review changes before `npm run inventory:write`; never reset baselines to conceal debt. Final acceptance requires the exact final commit's complete FULL-CI evidence. Missing mandatory gates and unresolved acceptance dependencies remain BLOCKED. Production remains NO-GO until separately reviewed operational and release evidence exists.

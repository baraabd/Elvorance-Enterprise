# FULL-CI operation and required-check enforcement

## Entry and evidence

`.github/workflows/full-ci.yml` runs on every pull request, `main`/`sprint/**` push, merge group, and manual dispatch. It calls the preserved project, distributed runtime and native suites as reusable workflows. There are no path filters or `continue-on-error` escapes. Every mandatory lane uploads evidence under `full-ci-<lane>-<testedSHA>-<runAttempt>` even after failures where collection is possible.

`FULL-CI / required` always evaluates all five logical job groups and all eight lane reports. Same-run archive digests are verified against GitHub metadata, then every inner log/report digest is verified. A missing report or unsuccessful setup does not silently pass. Project Linux requires actual PostgreSQL; the exact redundant platform skips are documented in the contract. Logs and reports distinguish node test cases, parity routes, legacy regression scripts, runtime assertions, native test cases and the identity suite rather than adding incomparable counts into a fake coverage percentage.

The decision artifact is `full-ci-decision-<testedSHA>-<runAttempt>` (90-day retention); lane evidence is 30 days. Record artifact IDs, SHA-256 digests, source/tree, lock digest, run URL and attempt in the PR review. Preserve reviewed artifacts in an approved immutable archive before expiration. No signed artifact attestation or permanent archive is claimed by this implementation.

## Required repository administration

Observed `main` is unprotected with zero required status contexts. Code alone cannot enforce a required check. After a successful final candidate, configure a main ruleset/protection with:

1. Pull-request review and code-owner review for CI contracts/workflows, inventory/debt baselines, authorization and migrations; no self-approval shortcut.
2. Exact required check `FULL-CI / required` from GitHub Actions, strict up-to-date checks or merge queue, blocked force pushes/deletions and reviewed bypass policy.
3. Protected release environments with independent approval and scoped signing credentials; never expose release secrets to pull-request jobs.

Re-read the live branch/ruleset API and attach the effective enforcement result. Until that readback exists, enforcement is **BLOCKED**, not implemented by documentation. CODEOWNERS routing to the repository maintainer does not invent named service/on-call ownership.

## Local and remote execution

Use the locked dependencies and the workflow-pinned Node/npm versions. `npm run inventory:check`, `npm run check:types`, `npm run check:boundaries`, `npm run build`, `npm test`, `npm run test:parity`, `npm run test:regression`, `npm run test:merged`, `node examples/instant-close/build.mts`, `npm run check:format` and `npm run package` are the project sequence. Real PostgreSQL must be configured for the mandatory Linux lane. `npm run ci:project` records provenance and refuses to turn a missing mandatory database into success.

Docker/PostgreSQL/RabbitMQ, real loopback-TLS Keycloak, Android SDK/emulator and macOS/Xcode are separate mandatory hosted runner lanes. Do not relabel local executions lacking those environments as FULL-CI. Reuse a prior run only as historical evidence, never as the final-commit gate.

## Failure repair and rollback

Fix the owning source or test; do not lower thresholds, remove suites, add broad skips or refresh a baseline to conceal a regression. Regenerate the inventory after a reviewed source change, run formatting, commit, then execute the **entire** FULL-CI again. Re-running only failed jobs is diagnostic; final acceptance requires one complete consistent run/attempt for the frozen candidate. The aggregator deliberately rejects mixed-attempt artifacts.

S01 changes CI, tooling and documentation only; it does not deploy database migrations. Rollback is a reviewed revert of S01 changes on a new branch, preserving PR #4 implementation and PR #3 release restrictions. Reverting the gate must not be used to authorize a release with missing evidence. No `docker compose down -v` against a live environment is permitted; runtime CI cleanup addresses its unique disposable project only.

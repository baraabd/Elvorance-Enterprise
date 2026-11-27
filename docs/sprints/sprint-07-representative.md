# Sprint 07 — Representative application implementation and acceptance

Date: 2026-11-23. Reviewed baseline: `453242e1256f6d876d170142b8ad235be9120344`.

Status: implementation and automated verification candidate; **not physical-device, hosted-Staging or production acceptance**. See the PR's exact-commit CI results for hosted runner outcomes. Existing working functionality was retained rather than rewritten. No merge, production deployment, store upload or infrastructure change is authorized by this report.

## Implementation inventory and acceptance matrix

The representative's `dataMode: server` entry starts the OIDC-backed server workspace. The demo application has separate local state and is not evidence of backend integration. Server views use `createRepApi`; no operational fallback to demo data was introduced.

| Requirement                 | Actual server implementation / change                                                                                             | Verification and remaining boundary                                                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customers                   | `server/views/customers.ts`, CRM scoped list/detail/create/edit; contact withdrawal and discovery retained                        | Existing real-handler UI tests; tenant/assignment enforcement remains server-owned                                                                                                |
| Opportunities               | `server/views/planning.ts`; create and versioned stage changes; won requires approved contract                                    | Existing real-handler integration and runtime journey; not independently accepted on a device                                                                                     |
| Tasks                       | Sales task create, due date, completion and expected version                                                                      | Added offline input-retention and explicit-retry UI regression; real runtime journey adds stale-write and other-rep denial                                                        |
| Visits                      | Schedule, arrival, completion, outcome/next step; default arrival is now manual                                                   | Explicit per-arrival GPS consent; new network and permission checks; browser journey exercises manual arrival                                                                     |
| Work schedule               | New `schedule-model.ts` and `schedule.ts`; authorized visits/tasks, date selector, previous/today/next, mobile RTL                | Calendar, leap date, DST, time-zone boundary, sorting and non-mutating filtering tests                                                                                            |
| Catalog / quotes            | `quote-editor.ts`, `quotes.ts`, `records.ts`; server catalog prices, installment validation, approval, revision and explicit send | Existing handler UI tests; browser journey covers quote creation/send and Client decision                                                                                         |
| Client decisions / contract | Representative reads status; Client separately accepts quote and approves contract                                                | Browser uses actual Client UI; real-runtime assertions verify convergence with representative contract and Admin visit data                                                       |
| Messages                    | Conversations, send, explicit actor-specific read receipt                                                                         | Prevent refresh/close while sending; show own receipt and unacknowledged count, correct sender label; **counterparty read state is not available in this API and is not claimed** |
| Support / profile           | Communications ticket create/reply; Identity profile save/logout                                                                  | Existing view tests; browser journey checks Admin ticket visibility and profile persistence                                                                                       |
| Location                    | `tracking.ts`, visit arrival and shared `location-permission.ts`                                                                  | Precise and Android coarse-only permission supported; unresolved native permission fails closed; foreground/session/consent-bound; lifecycle tests use adapters, not an OS        |
| Route plans                 | Existing ordered visit lists and plan status                                                                                      | Explicit disclosure: **no route optimization, road-network routing, ETA or optimal order calculation**                                                                            |
| Offline / conflicts         | Online-only writes, in-page unsent form inputs, expectedVersion, per-intent idempotency                                           | No durable offline writes/cache/outbox, no background replay; see policy below                                                                                                    |
| Native shell                | Android/iOS Capacitor projects retained; back handles editors; idempotent all-listener cleanup; partial registration cleanup      | Source inspection and existing automated native verification; physical permissions and lifecycle remain untested                                                                  |

No feature is declared complete merely because a control renders or a build succeeds. Backend ownership/tenant checks are not replaced with client-side filtering. No database ownership or migration change was required for these changes.

## Explicit location policy

Arrival has a manual/no-location default. Selecting GPS explicitly explains that one position reading will be sent to record arrival. Live tracking separately requires an unchecked affirmative consent and a server session. OS permission is necessary but is not treated as business consent.

The permission helper accepts `coarseLocation: granted` even when fine `location` is denied, without escalating the request to precise location. Native prompt states that remain unresolved are denied; on web the browser itself prompts during acquisition. No background permission was added. No coordinates are persisted for later replay. Cancellation is checked after asynchronous permission/position operations before submission.

Existing tracking generation guards prevent late GPS callbacks from uploading after account change, logout, backgrounding or network loss. Reconnection does not automatically resume tracking. iOS reduced accuracy cannot be inferred solely from the common permission flag; accuracy remains part of the returned position and no precision guarantee is made.

Primary platform reference: Capacitor Geolocation API (`https://capacitorjs.com/docs/apis/geolocation`), including Android coarse-only permission and high-accuracy limitations. Platform documentation is not evidence of actual hardware behavior.

## Offline and concurrency contract

| Situation                           | Supported behavior                                                                                       | Deliberate limit / recovery                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Connection lost with an open form   | Keep unsent values in the current page; show error; no API mutation when browser reports offline         | Not saved across reload, navigation or process termination; UI explicitly warns not to close the page                       |
| Reconnection                        | No automatic mutation replay                                                                             | User reviews values and explicitly retries                                                                                  |
| Ambiguous response after a mutation | Existing API retains the idempotency key for the same intent/body until success                          | Key is memory-only; after process loss, fetch server state before recreating an operation                                   |
| Concurrent update                   | Send expectedVersion; server returns 409 on stale version                                                | Keep local input visible, refresh authoritative data and manually reconcile; no silent last-writer-wins or forced overwrite |
| Save in progress                    | Form made inert without disabling data-bearing fields; submit single-flight; close/back/replace rejected | This protects dynamic FormData serialization and prevents local input loss during an uncertain save                         |
| Location unavailable/offline        | Stop/pause collection and pending sends; no location queue                                               | Explicit user restart after conditions recover                                                                              |
| Offline reads                       | Only information already rendered in the current in-memory page                                          | No persistent customer-data cache, offline route maps or cross-account storage                                              |

Persistent offline operation requires a separately approved encrypted storage design, retention policy, entity conflict rules and process-death recovery tests. It is intentionally not represented as delivered here.

## Scheduling semantics

Visit timestamps are instants and are grouped by the displayed device time zone. Task `dueOn` values are calendar dates, not instants. Date-only formatting uses UTC to avoid shifting a date to the previous day in western time zones. Previous/next navigation uses calendar arithmetic rather than adding 24 elapsed hours across DST. Route plan dates retain the existing UTC contract and are not converted into an optimizer.

## Executed local verification

Source and pinned dependencies came from authenticated GitHub Actions artifacts. The source artifact corresponds to the reviewed main SHA. Node 24.22.1 and the repository lockfile were used in an isolated Linux container. This local checkout has synthetic local Git history; it is **not** a substitute for exact-remote-SHA CI evidence.

| Command / scope                                  | Observed result                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check:types`                            | Passed                                                                                                                         |
| `npm run check:boundaries`                       | Passed: 22 workspaces, 225 source files, 226 internal edges, zero static boundary violations                                   |
| `npm run check:format`                           | Passed                                                                                                                         |
| `npm run build`                                  | Passed: three web applications and eight service/gateway build outputs                                                         |
| `npm test`                                       | 321 cases reported: **320 passed, zero failed, one skipped** because local real PostgreSQL was unavailable                     |
| Targeted schedule/lifecycle suite                | 16 passed, zero failed/skipped; overlaps with the main test count                                                              |
| Targeted representative server-view suite        | 17 passed, zero failed/skipped; overlaps with the main test count                                                              |
| `npm run test:merged`                            | 53 passed, zero failed/skipped; not a unique additional-coverage count                                                         |
| `npm run test:regression`                        | Seven named modular regression groups passed; these include demo regressions and do not establish server acceptance            |
| `npm run test:parity`                            | Zero route/asset failures and zero runtime errors; visual/static parity is not end-to-end backend acceptance                   |
| `npm run inventory:check`                        | Passed for integrity and drift; unchanged suppression/debt baseline                                                            |
| Local actual Chromium attempt                    | **Blocked** by the environment's `ERR_BLOCKED_BY_ADMINISTRATOR`; zero successful browser-journey steps, not reported as a pass |
| Local Docker/PostgreSQL/RabbitMQ runtime journey | Not executed locally; retained mandatory hosted CI lane                                                                        |
| Android/iOS physical devices                     | Not available and not tested                                                                                                   |

An initial full-suite run exposed a real regression from disabling form fields during save: dynamic quote/discovery serializers omitted those fields. The fix uses `inert` while preserving FormData participation. The final local full-suite run above passed after this correction; failing intermediate attempts were not relabeled as successes.

## New browser and runtime evidence gates

`tests/browser/run-rep-field.mts` builds and serves the actual representative workspace and the actual Client/Admin live workspace. Python Playwright drives Chromium at a mobile viewport in RTL, over real loopback HTTP, through existing application handlers. The fixture deliberately uses **synthetic identities and in-memory repositories**; it does not fake server success using request interception. It cannot target a production URL. A run must finish all ten named checks, without uncaught browser errors. Reports explicitly identify this evidence tier.

Reproduce in a disposable Linux CI environment:

```sh
npm ci
python3 -m venv /tmp/rep-browser
/tmp/rep-browser/bin/python -m pip install -r tests/browser/requirements.txt
/tmp/rep-browser/bin/python -m playwright install --with-deps chromium
PYTHON=/tmp/rep-browser/bin/python node tooling/production/run-lane.mts browser
```

The new browser lane is mandatory in `FULL-CI`; a missing/failed report, mismatched source revision or fewer than ten passing checks fails acceptance. Artifacts include the report, trace, screenshots and fixture logs. Existing project, real runtime, identity, security and native lanes remain mandatory. Real-runtime additions in `tests/runtime/compose-journey.mts` test durable Admin/Client convergence, stale task updates and actor-specific message receipts using the existing Docker/PostgreSQL/RabbitMQ journey.

The changed FULL-CI contract requires independent CODEOWNERS review. No quality or suppression baseline was raised, no existing test lane was skipped, and no independent approval is implied by this implementation.

## Remaining release blockers

| Gate                             | Required evidence not supplied by this implementation                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosted Staging field acceptance  | Exact deployed SHA, real OIDC test accounts, isolated tenant, operational gateway/services/DB/broker and a three-application journey on that deployment                                                       |
| Android physical device          | Exact model/OS/build SHA; precise/approximate/denied/never-ask/settings revocation; location disabled; network transitions; background/foreground; process termination; secure session restoration and logout |
| iOS physical device              | Exact model/OS/signed build SHA; Allow Once/While Using/reduced accuracy/deny/settings revocation; location disabled; interruption, process termination, Keychain/session and logout                          |
| Native distribution              | Signing, entitlements, provisioning and approved store/internal-distribution credentials; emulator/simulator output is insufficient                                                                           |
| Persistent offline work          | Encrypted storage, retention/account isolation, durable idempotency, conflict UI and crash/restart/replay tests; intentionally not shipped                                                                    |
| Counterparty message read status | Explicit backend authorization/contract for publishing the other party's receipt plus UI/integration tests                                                                                                    |
| Route optimization               | Routing provider/algorithm, traffic/time-window objectives, privacy/cost approval and route-quality tests; intentionally not shipped                                                                          |
| Repository-wide completeness     | Existing inventory still contains unmapped workflow/test evidence and legacy TypeScript suppression debt; source traceability is not exhaustive runtime coverage                                              |

A reviewer must use the PR's final exact-SHA CI decision, not main's earlier green run or this local log table, before merging. Device and Staging gates remain separate even when all CI jobs are green.

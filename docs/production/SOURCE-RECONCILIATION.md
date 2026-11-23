# S01 source reconciliation

Observed 22 November 2026 using live GitHub repository/PR/commit/compare/Actions APIs. This snapshot is not a moving-branch assertion.

| Source | Exact head                                 | Findings and disposition                                                                                                                                                                                                            |
| ------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main` | `12264edff0f8e5f1d241188aed65a0aa8e9992cb` | Tree `3c4e70b0d557896ade6c51831918d50690686aa9`; supports limited authenticated server workspaces. Preserve.                                                                                                                        |
| PR #3  | `a664aec49646c365bf5cbed24fd094360677d80e` | Open draft, GitHub mergeable. One added release-gate document, not a representative implementation. Preserve the file unchanged; historical assertions stay dated.                                                                  |
| PR #4  | `161e7fdb39c02e43c4761f6385a28b7dff832ecb` | Open draft, GitHub mergeable. Tree `77282a9cd71e3e76c0440168c205b2c9fc3a5058`. Ahead of main by nine commits, behind by zero; merge base equals main. Use as the new review-branch implementation base, not as permission to merge. |

PR #4's body named an older head (`b471f5ac...`) and old test totals. The actual head contains the typed gateway error fixture. PR #3's PR base metadata named an older main snapshot; neither description is used as the live source identity.

## Inspected pre-S01 checks — not final S01 evidence

| Source                          | Run                                                                      | Observed conclusion |
| ------------------------------- | ------------------------------------------------------------------------ | ------------------- |
| main                            | https://github.com/baraabd/Elvorance-Enterprise/actions/runs/44141745364 | success             |
| PR #3 head                      | https://github.com/baraabd/Elvorance-Enterprise/actions/runs/44480253199 | success             |
| PR #4 head, project             | https://github.com/baraabd/Elvorance-Enterprise/actions/runs/44484026552 | success             |
| PR #4 head, distributed runtime | https://github.com/baraabd/Elvorance-Enterprise/actions/runs/44484026470 | success             |
| PR #4 head, native              | https://github.com/baraabd/Elvorance-Enterprise/actions/runs/44484026605 | success             |

The downloaded PR #4 source artifact `14725360870` has SHA-256 `ebf29deb2b67e78b75a2b5230d80cea69122987232ccbfa8e83bea32553dc714`; its paired Linux toolchain artifact `14724324799` has SHA-256 `0ccd64afbb35a5adc66b8dac955a05bea24331dc2cb180c7e0134d92fe2555de`. Both archive digests were verified before local use. A packaged source archive is not a Git checkout and may include generated assets. Publication uses the actual upstream Git tree and only reviewed changed files, not an invented local parent history. The final GitHub checkout generates and validates inventory against the real tree.

## Conflict and preservation decision

Main is an ancestor of PR #4, so no main-to-PR4 content merge is required at the inspected heads. PR #3 adds a distinct release-gate document; its content can be retained without replacing PR #4 implementation. Preserve domain services, native code, source contracts, tests and release tooling. No production release or original PR merge is performed by S01. Concurrent upstream changes require another compare and full tested candidate; do not force-update original branches.

At inspection, main branch protection was disabled and required-status contexts were empty. `CI-OPERATIONS.md` specifies the intended enforcement, separately from the code changes.

# Rep mobile — production release gate

Reviewed: 19 November 2026.

Status: **BLOCKED — no approval to submit to App Store or Google Play**.

This is a documentation-only gate. Merging it does not merge the representative implementation in PR #4, deploy services, sign an application, or approve a release.

## Source snapshots and corrections

The original 17 November document described an earlier source snapshot. Its statement that `apps/rep-mobile/src/main.ts` rejects every non-demo mode is no longer correct for current `main`.

### Main branch

At review, `main` was `12264edff0f8e5f1d241188aed65a0aa8e9992cb`. Its representative bootstrap accepts `demo` and `server`, and the server branch mounts the limited authenticated live workspace. This is not evidence that every original representative screen or action is integrated, and it is not the dedicated mobile release implementation.

### Representative implementation in PR #4

The inspected implementation snapshot was `2a85823cbd04160e4e321bc3933c4687ef847205` on `feat/rep-staging-mobile-20261117`. It adds a dedicated server entry, representative workflows, OIDC/PKCE authentication, native secure storage, separate staging/production identities, and signed-build and acceptance tooling. These changes were still in draft PR #4, not merged into `main`.

GitHub reported these runs successful for that snapshot:

- General project verification: run `44265005115`.
- Distributed backend runtime verification: run `44265005125`.
- Native Android/iOS verification: run `44265005107`.

The distributed runtime uses synthetic CI data and development authentication. Native verification produces an unsigned verification harness and simulator results, not the final signed representative application. Neither establishes hosted staging acceptance or physical-device acceptance. Subsequent commits require their own successful checks; do not transfer these results to a different source revision.

### Hosted environments

On 19 November, the connected Railway project `elvorance-staging` had 33 staged changes and no live services. No Elvorance project appeared in the connected Vercel team's project list. These observations describe the accessible account scope, not every possible deployment account.

Do not apply claims about old branding, disabled type checking, version numbers, or unavailable server mode to newer branches without inspecting their exact source. The implementation documentation in PR #4 tracks its remaining limitations separately.

## Required release evidence

Every unchecked item below requires evidence for the exact source, environment and signed binaries intended for distribution. The existence of implementation code or a workflow is not completion of the item.

- [ ] Review and merge the intended implementation only after its latest type, boundary, build, integration, security and native checks pass. Record the source revision and immutable service images.
- [ ] Deploy an isolated hosted staging environment with gateway, all seven domain services, PostgreSQL, RabbitMQ and the identity provider. Verify migrations, readiness, network isolation, HTTPS, allowed web origins and company account provisioning.
- [ ] Exercise real hosted OIDC Authorization Code with PKCE on Android and iPhone: system-browser login, callback validation, secure storage, refresh rotation, logout, session expiry, account changes and role/tenant isolation.
- [ ] Validate every release-scope representative workflow with persisted server data: customers, discovery, visits, routes, opportunities, quotes, tasks, messages, support and account. Complete administrator commercial review and the separate client quote/contract decisions.
- [ ] Use the dedicated server-only representative build with validated HTTPS endpoints and no demo fallback or embedded credentials. Do not distribute the default demo build or the unsigned native verification harness.
- [ ] Validate connectivity failures, retry idempotency, concurrent updates, expired sessions and logout cleanup. Do not claim offline writes, encrypted caching or synchronization unless explicitly implemented and tested.
- [ ] Validate consented foreground location, permission denial and revocation, battery use and retention. Do not claim background tracking or push notifications; the inspected implementation provides foreground location and in-app notifications only.
- [ ] Build the final signed Android AAB and iOS archive/IPA using protected signing material. Verify bundle IDs, signing certificates, release versions, source/output integrity and current store SDK requirements.
- [ ] Test those exact release candidates on physical Android and iPhone devices, including RTL, accessibility, safe areas, small screens, background/resume and interrupted network/auth flows.
- [ ] Complete load, event-recovery and database backup/restore tests; record reviewed staging and physical-device acceptance before production promotion.
- [ ] Prepare approved store accounts, icons, screenshots, support and privacy information, data disclosures and account-deletion handling where applicable. Provide reviewer access without exposing production customer data.
- [ ] Complete the applicable Google Play test track and TestFlight validation, then obtain product-owner approval before submission. Store submission and store approval are separate outcomes.

## Evidence handling

Keep signing keys, passwords and private certificates in protected CI environments or an approved secrets manager, never in Git or chat. Record only sanitized evidence, source/image identifiers and binary hashes in review artifacts.

A passing CI job is engineering evidence, not proof of a production deployment. A successful native build is build evidence, not proof of physical-device testing or store approval. Update this gate only when the corresponding evidence is available.

## Release decision

**NO-GO for store submission and production promotion** until the hosted staging, final signed binaries, physical-device tests and reviewed release evidence above are complete. Keep unfinished implementation work explicit rather than treating this document as an approval to publish.

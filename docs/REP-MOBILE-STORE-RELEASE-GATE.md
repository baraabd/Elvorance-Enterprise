# Rep mobile — production release gate (2026-11-17)

Status: **BLOCKED — do not submit to App Store or Google Play**.

## Verified source blockers
1. `apps/rep-mobile/config.example.ts` sets `dataMode: 'demo'` and `apiBaseUrl: 'http://localhost:3000'`.
2. `apps/rep-mobile/src/main.ts` throws if `dataMode !== 'demo'`; production server mode is not implemented.
3. `apps/rep-mobile/src/app.ts` wires `createLocalDemo` into the representative feature actions.
4. `apps/rep-mobile/src/app.ts` and `src/main.ts` use `@ts-nocheck`; remove after type-safe migration.
5. Android application ID is `com.elvorance.rep`; iOS bundle identifier, signing team and release profiles must be confirmed.
6. iOS `Info.plist` still displays the older Atlas name; branding must be aligned before submission.
7. Android `build.gradle` starts at `versionCode 1`, `versionName 1.0`; define managed release versioning.
8. Native foreground location permissions exist; verify explicit consent, accuracy, retention, denial/revocation handling, and that background location is NOT claimed without a real implementation.

## Required implementation sequence
- [ ] Define production API contract and auth: OIDC Authorization Code + PKCE, deep-link callback, secure token storage, refresh/logout/revocation, tenant scoping and role authorization.
- [ ] Migrate each representative feature from local demo to authenticated server reads/writes: customers, visits, routes, opportunities, quotes, tasks, messages and account. Preserve idempotency keys for mutations; reject unsafe offline replay.
- [ ] Add production configuration validation: HTTPS API only, no localhost, no demo fallback, no embedded secrets; fail closed with an actionable error screen.
- [ ] Implement connectivity and offline states; define encrypted local cache, synchronization conflict handling, data minimization and logout cleanup.
- [ ] Review location permission prompts, foreground-only tracking behavior, battery use, data processing and privacy disclosures.
- [ ] Validate accessibility, RTL, responsive layouts, loading/error/empty states and device-specific safe areas.
- [ ] Add automated unit, integration, contract, security and end-to-end tests; run them in CI.
- [ ] Build and test signed Android AAB on a clean runner; run Android emulator + physical-device tests.
- [ ] Build and test iOS archive on a macOS runner with Xcode; TestFlight testing on real iPhone.
- [ ] Set up signing and provisioning through protected CI secrets, never in Git; prepare store icons, screenshots, privacy policy, account deletion where applicable, data safety/privacy labels and support contact.
- [ ] Submit only after documented product-owner sign-off and store-account access.

## Evidence policy
No native build, physical-device test, live API test, store submission or approval is claimed by this document. Each checkbox requires linked CI logs, artifacts or test evidence before marking complete.

## Release decision
**NO-GO** until the demo adapter is replaced with tested server integration and both native builds pass.

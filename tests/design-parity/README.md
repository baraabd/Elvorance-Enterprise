# v1.1 design and DOM parity

Run from the standalone `enterprise` workspace after `npm ci`:

```sh
npm run test:parity
```

The runner uses the checked-in `baseline-v1.1.json`. It does not need the old repository, a browser process, a native SDK, or a running API. It bundles the real ES modules with esbuild, installs the extracted runtime, calls each app's `registerApp`, and renders every frozen route fixture in JSDOM.

## Coverage

- 64 complete `#app` DOM snapshots: 20 representative, 21 client, 23 administration routes. This includes the shared shell, navigation, page content, SVG markup and tracking controls.
- Exact route IDs, names of all 122 app handlers, and navigation definitions.
- Document title and the full semantic icon map.
- Three shared CSS files, three extracted app CSS files, the two Arabic font binaries, and the font license.
- A populated active visit and a completed agreement snapshot, so visit review routes exercise their intended content.

The clock is fixed to `2027-02-10T12:00:00.000Z`, the random sequence is seeded, and the timezone is UTC. All cases start from the same frozen synthetic state plus an explicit fixture patch. Tracking uses deterministic, read-only in-memory responses for its status and empty team list. No GPS permission is requested, and any unexpected request fails the fixture.

## Normalization

DOM comparison removes only `style` elements from a cloned `#app`, because those rules now live in `src/styles.css`. It retains text, classes, IDs, form values, labels, accessibility attributes, action/route hooks, inline styles, and SVG data. There is no blanket removal of dates, numbers or generated identifiers.

App CSS comparison removes the old enclosing `<style>` wrapper and trims file-boundary whitespace only. Every internal CSS byte and rule order must match. Shared CSS, fonts and license use exact byte SHA-256 comparisons. All application CSS must be loaded after shared CSS, as in the original cascade.

This verifies source-rendered DOM and assets; it does not claim pixel layout or native-device rendering.

## Evidence and failures

Each run writes `artifacts/latest-results.json` with every route hash, registration result, asset hash, and failure detail. A mismatch in DOM, title, icons, registration or assets causes a nonzero exit. Failed DOM cases also write their actual HTML beside the report. The initial migration passed 64/64 routes and 9/9 asset checks, with all 122 handlers present.

## Reviewing a deliberate baseline update

The frozen JSON contains snapshots and synthetic data, not a copy of the old application implementation. Ordinary verification never regenerates it. To regenerate deliberately from a reviewed v1.1 checkout:

```sh
node tests/design-parity/generate-baseline.mjs --reference /path/to/reviewed-v1.1-repository
```

The generator records source hashes, uses the same deterministic harness, and rejects a reference whose inventory is not 64 routes and 122 handlers. Review baseline changes as a design change; do not regenerate it to hide an unexpected mismatch.

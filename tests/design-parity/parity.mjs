import fs from 'node:fs/promises';
import path from 'node:path';
import {
  directory,
  workspace,
  hash,
  bundleApps,
  createSurface,
  executeScript,
  settle,
  snapshot,
  applyFixture,
  canonicalAppCss,
  readJson,
  writeJson,
  firstDifference,
} from './harness.mjs';

const baselineFile = path.join(directory, 'baseline-v1.1.json');
const evidenceFile = path.join(directory, 'artifacts/latest-results.json');
const result = {
  schemaVersion: 1,
  method: 'Frozen v1.1 full-route DOM + exact CSS/font/icon parity against bundled ES modules',
  startedAt: new Date().toISOString(),
  cases: [],
  registrations: [],
  assets: [],
  errors: [],
};
try {
  const baseline = await readJson(baselineFile);
  result.baselineSha256 = hash(await fs.readFile(baselineFile));
  result.reference = baseline.reference;
  if (baseline.schemaVersion !== 1 || baseline.cases.length !== 64)
    throw new Error('Unexpected frozen baseline schema or route count.');
  const bundles = await bundleApps(),
    registered = new Set();
  for (const expected of baseline.cases) {
    const surface = createSurface({
      app: expected.app,
      route: expected.route,
      params: expected.params,
      state: applyFixture(baseline.seedState, baseline.fixtures[expected.fixture]),
      fixedClock: baseline.determinism.clock,
      fixedSeed: baseline.determinism.randomSeed,
    });
    const item = { id: expected.id, status: 'passed', expectedHash: expected.sha256 };
    try {
      executeScript(surface, bundles[expected.app], expected.app + '-esm-bundle');
      await settle(surface);
      if (!registered.has(expected.app)) {
        const definition = surface.w.AtlasParityDefinition;
        if (!definition) throw new Error('registerApp did not provide a definition.');
        const names = (values) => [...values].sort();
        const matches =
          JSON.stringify(names(Object.keys(definition.routes))) ===
            JSON.stringify(names(baseline.apps[expected.app].routes)) &&
          JSON.stringify(names(Object.keys(definition.actions))) ===
            JSON.stringify(names(baseline.apps[expected.app].actions)) &&
          JSON.stringify(definition.nav) === JSON.stringify(baseline.apps[expected.app].nav);
        result.registrations.push({
          app: expected.app,
          routes: Object.keys(definition.routes).length,
          actions: Object.keys(definition.actions).length,
          status: matches ? 'passed' : 'failed',
        });
        if (!matches) result.errors.push('Route/action/nav registration differs: ' + expected.app);
        registered.add(expected.app);
      }
      const actual = snapshot(surface);
      item.actualHash = hash(actual.html);
      item.title = actual.title;
      item.trackingFixtureRequests = surface.requests;
      const differences = {};
      if (actual.title !== expected.title)
        differences.title = { expected: expected.title, actual: actual.title };
      if (actual.html !== expected.html)
        differences.dom = firstDifference(expected.html, actual.html);
      if (actual.iconsHash !== expected.iconsHash)
        differences.icons = { expected: expected.iconsHash, actual: actual.iconsHash };
      if (surface.logs.length) differences.runtime = surface.logs;
      if (Object.keys(differences).length) {
        item.status = 'failed';
        item.differences = differences;
        const filename = expected.id.replace('/', '--') + '.actual.html';
        await fs.mkdir(path.join(directory, 'artifacts'), { recursive: true });
        await fs.writeFile(path.join(directory, 'artifacts', filename), actual.html);
        item.actualSnapshot = 'tests/design-parity/artifacts/' + filename;
      }
    } catch (error) {
      item.status = 'failed';
      item.error = String(error.stack || error);
    } finally {
      surface.close();
    }
    result.cases.push(item);
  }
  for (const asset of baseline.assets) {
    try {
      const file = await fs.readFile(path.join(workspace, asset.target));
      const actualHash = hash(
        asset.kind === 'app-css' ? canonicalAppCss(file.toString('utf8')) : file,
      );
      result.assets.push({
        id: asset.id,
        kind: asset.kind,
        target: asset.target,
        expectedHash: asset.sha256,
        actualHash,
        status: actualHash === asset.sha256 ? 'passed' : 'failed',
      });
    } catch (error) {
      result.assets.push({ id: asset.id, status: 'failed', error: String(error.message) });
    }
  }
} catch (error) {
  result.errors.push(String(error.stack || error));
}
result.finishedAt = new Date().toISOString();
result.summary = {
  routes: result.cases.length,
  routesPassed: result.cases.filter((row) => row.status === 'passed').length,
  routesFailed: result.cases.filter((row) => row.status === 'failed').length,
  actions: result.registrations.reduce((sum, row) => sum + row.actions, 0),
  assets: result.assets.length,
  assetsPassed: result.assets.filter((row) => row.status === 'passed').length,
  assetsFailed: result.assets.filter((row) => row.status === 'failed').length,
  runtimeErrors: result.errors.length,
};
await writeJson(evidenceFile, result);
console.log(
  JSON.stringify(
    {
      ...result.summary,
      evidence: 'tests/design-parity/artifacts/latest-results.json',
      failures: result.cases
        .filter((row) => row.status === 'failed')
        .map((row) => ({ id: row.id, differences: row.differences, error: row.error })),
      assetFailures: result.assets.filter((row) => row.status === 'failed'),
      errors: result.errors,
    },
    null,
    2,
  ),
);
if (
  result.summary.routes !== 64 ||
  result.summary.routesFailed ||
  result.summary.assetsFailed ||
  result.errors.length ||
  result.registrations.some((row) => row.status === 'failed')
)
  process.exitCode = 1;

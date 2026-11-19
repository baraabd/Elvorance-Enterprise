import { build } from 'esbuild';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { repReleaseConfig } from './rep-release/release-config.mts';
import {
  repositoryRoot,
  repOutput,
  sha256,
  inputHash,
  type RepBuildManifest,
} from './rep-release/build-proof.mts';

const config = repReleaseConfig();
await rm(repOutput, { recursive: true, force: true });
await mkdir(resolve(repOutput, 'assets'), { recursive: true });
const result = await build({
  absWorkingDir: repositoryRoot,
  entryPoints: ['apps/rep-mobile/src/server-main.ts'],
  outfile: resolve(repOutput, 'assets/app.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2022'],
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  metafile: true,
});
const inputNames = Object.keys(result.metafile.inputs);
const forbidden = inputNames.filter((file) =>
  /(?:demo-data|local-demo|app-runtime|live-workspace|\/features\/)/.test(file),
);
if (forbidden.length)
  throw new Error(`Demo code entered the release graph: ${forbidden.join(', ')}`);
const cssInput = 'apps/rep-mobile/src/server/styles.css';
const arabicCssInput = 'packages/design-system/src/arabic-accessibility.css';
await writeFile(
  resolve(repOutput, 'assets/app.css'),
  (await readFile(resolve(repositoryRoot, cssInput), 'utf8')) +
    '\n' +
    (await readFile(resolve(repositoryRoot, arabicCssInput), 'utf8')),
);
await writeFile(
  resolve(repOutput, 'config.js'),
  `window.ELVORANCE_CONFIG = Object.freeze(${JSON.stringify(config)});\n`,
);
const issuer = new URL(config.auth.issuer).origin;
const csp = `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' ${config.apiBaseUrl} ${issuer}; base-uri 'none'; object-src 'none'; form-action 'none'; frame-src 'none'`;
await writeFile(
  resolve(repOutput, 'index.html'),
  `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#17221b"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>إلفورانس الميداني</title><link rel="stylesheet" href="./assets/app.css"><script src="./config.js" defer></script><script src="./assets/app.js" defer></script></head><body><div id="app" aria-live="polite"></div><noscript>يتطلب التطبيق تفعيل JavaScript.</noscript></body></html>\n`,
);
const inputs: Record<string, string> = {};
for (const name of [
  ...new Set([
    ...inputNames,
    cssInput,
    arabicCssInput,
    'package-lock.json',
    'tooling/scripts/build-rep-server.mts',
    'tooling/scripts/rep-release/release-config.mts',
    'tooling/scripts/rep-release/build-proof.mts',
  ]),
].sort()) {
  inputs[name] = sha256(await readFile(resolve(repositoryRoot, name)));
}
const outputs: Record<string, string> = {};
for (const name of ['index.html', 'config.js', 'assets/app.js', 'assets/app.css']) {
  outputs[name] = sha256(await readFile(resolve(repOutput, name)));
}
const manifest: RepBuildManifest = {
  schemaVersion: 1,
  dataMode: 'server',
  environment: config.environment,
  apiBaseUrl: config.apiBaseUrl,
  auth: config.auth,
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim(),
  sourceHash: inputHash(inputs),
  inputs,
  outputs,
  createdAt: new Date().toISOString(),
};
await writeFile(resolve(repOutput, 'rep-build.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `Built representative server application for ${config.environment}; ${inputNames.length} verified dependencies, no demo runtime.`,
);

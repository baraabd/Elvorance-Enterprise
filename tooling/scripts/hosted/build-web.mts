import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { hostedStyles, hostedStylePaths } from './styles.mts';
import { stagingTarget, sourceRevision, ensure } from '../../../infra/railway/staging/target.mts';
const source = sourceRevision();
for (const [role, app] of [
  ['admin', 'admin-web'],
  ['client', 'client-mobile'],
  ['rep', 'rep-mobile'],
] as const) {
  const out = `dist/hosted-web/${role}`;
  await mkdir(out, { recursive: true });
  const result = await build({
    entryPoints: [`apps/${app}/src/server-main.ts`],
    outfile: `${out}/app.js`,
    platform: 'browser',
    target: 'es2022',
    format: 'iife',
    bundle: true,
    minify: true,
    metafile: true,
  });
  const inputs = Object.keys(result.metafile.inputs);
  ensure(
    !inputs.some((path) =>
      /packages\/(demo-data|app-runtime)\/|apps\/[^/]+\/src\/(features\/|app\.ts)/.test(path),
    ),
    'Hosted bundles must not include demo repositories or legacy app registration.',
  );
  const cssPaths = hostedStylePaths(role);
  await writeFile(`${out}/styles.css`, await hostedStyles(role));
  const config = {
    dataMode: 'server',
    environment: 'staging',
    apiBaseUrl: stagingTarget.gatewayOrigin,
    auth: {
      environment: 'staging',
      issuer: stagingTarget.identityOrigin + '/realms/elvorance-staging',
      clientId: `elvorance-${role}-web-staging`,
      redirectUri: stagingTarget.web[role] + '/callback',
      scopes: ['openid', 'profile'],
    },
  };
  await writeFile(
    `${out}/config.js`,
    'window.ELVORANCE_CONFIG=Object.freeze(' + JSON.stringify(config) + ');\n',
  );
  await writeFile(
    `${out}/index.html`,
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Elvorance — Staging</title><link rel="stylesheet" href="/styles.css"></head><body><div id="app" aria-live="polite"></div><script src="/config.js" defer></script><script src="/app.js" defer></script></body></html>`,
  );
  const assets: Record<string, string> = {};
  for (const name of ['app.js', 'styles.css', 'config.js', 'index.html'])
    assets[name] = createHash('sha256')
      .update(await readFile(`${out}/${name}`))
      .digest('hex');
  await writeFile(
    `${out}/build.json`,
    JSON.stringify(
      {
        schemaVersion: 1,
        source,
        role,
        environment: 'staging',
        demoFallback: false,
        assets,
        inputs,
        styles: cssPaths,
      },
      null,
      2,
    ),
  );
}
await build({
  entryPoints: ['infra/railway/staging/web-main.mts'],
  outfile: 'dist/hosted-web/server.mjs',
  platform: 'node',
  target: 'node24',
  format: 'esm',
  bundle: true,
});

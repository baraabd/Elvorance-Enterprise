import { build } from 'esbuild';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type { MobileAuthConfig } from '../../packages/mobile-auth/src/types.ts';
import { createApiClient } from '../../packages/api-client/src/index.ts';

const root = resolve(import.meta.dirname, '../..');
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Public server configuration is required.');
  return value as Record<string, unknown>;
}
export function adminBuildConfig(input: unknown) {
  const value = object(input);
  if (
    Object.keys(value).some(
      (key) => !['dataMode', 'apiBaseUrl', 'environment', 'auth'].includes(key),
    )
  )
    throw new Error('Unexpected configuration key; never embed secrets or external tokens.');
  const auth = object(value.auth);
  if (
    Object.keys(auth).some(
      (key) => !['issuer', 'clientId', 'redirectUri', 'environment', 'scopes'].includes(key),
    )
  )
    throw new Error('Only public OIDC configuration is allowed.');
  if (
    !['development', 'staging', 'production'].includes(String(auth.environment)) ||
    typeof auth.clientId !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(auth.clientId) ||
    typeof auth.issuer !== 'string' ||
    typeof auth.redirectUri !== 'string'
  )
    throw new Error('Invalid public OIDC configuration.');
  const issuer = new URL(auth.issuer);
  const callback = new URL(auth.redirectUri);
  for (const [url, raw] of [
    [issuer, auth.issuer],
    [callback, auth.redirectUri],
  ] as const)
    if (url.username || url.password || url.search || url.hash || url.href !== raw)
      throw new Error('OIDC URLs must be canonical without credentials, query or fragment.');
  if (
    issuer.protocol !== 'https:' ||
    (callback.protocol !== 'https:' &&
      !(
        auth.environment === 'development' &&
        callback.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname)
      ))
  )
    throw new Error('OIDC URLs require HTTPS outside development loopback callbacks.');
  const scopes = auth.scopes ?? ['openid', 'profile'];
  if (
    !Array.isArray(scopes) ||
    !scopes.includes('openid') ||
    scopes.some((scope) => typeof scope !== 'string' || !scope || /\s/.test(scope))
  )
    throw new Error('Invalid OIDC scopes.');
  const validated: MobileAuthConfig = {
    issuer: auth.issuer,
    clientId: auth.clientId,
    redirectUri: auth.redirectUri,
    environment: auth.environment as MobileAuthConfig['environment'],
    scopes: scopes as string[],
  };
  if (
    value.dataMode !== 'server' ||
    value.environment !== validated.environment ||
    typeof value.apiBaseUrl !== 'string'
  )
    throw new Error('Explicit consistent server configuration is required.');
  const endpoint = new URL(value.apiBaseUrl);
  const redirect = new URL(validated.redirectUri);
  if (validated.environment !== 'development' && endpoint.protocol !== 'https:')
    throw new Error('Hosted API requires HTTPS.');
  if (!['https:', 'http:'].includes(redirect.protocol))
    throw new Error('Admin redirect must be a web URL.');
  createApiClient({ baseUrl: value.apiBaseUrl, accessToken: async () => null });
  return {
    dataMode: 'server' as const,
    environment: validated.environment,
    apiBaseUrl: endpoint.href.replace(/\/$/, ''),
    auth: validated,
  };
}
export async function buildAdminServer(input: unknown, sourceRoot = root) {
  const config = adminBuildConfig(input);
  const output = resolve(sourceRoot, 'dist/admin-server');
  await rm(output, { recursive: true, force: true });
  await mkdir(resolve(output, 'assets'), { recursive: true });
  const result = await build({
    absWorkingDir: sourceRoot,
    entryPoints: ['apps/admin-web/src/server-main.ts'],
    outfile: resolve(output, 'assets/app.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    minify: true,
    metafile: true,
    legalComments: 'none',
  });
  const inputs = Object.keys(result.metafile.inputs);
  if (inputs.some((path) => /(?:demo-data|local-demo|app-runtime|\/features\/)/.test(path)))
    throw new Error('Demo implementation entered the server-only dependency graph.');
  await writeFile(
    resolve(output, 'assets/app.css'),
    await readFile(resolve(sourceRoot, 'apps/admin-web/src/server/styles.css')),
  );
  await writeFile(
    resolve(output, 'config.js'),
    `window.ELVORANCE_CONFIG=Object.freeze(${JSON.stringify(config)});\n`,
  );
  const origins = [new URL(config.apiBaseUrl).origin, new URL(config.auth.issuer).origin];
  const csp = `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self' ${origins.join(' ')}; img-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'`;
  await writeFile(
    resolve(output, 'index.html'),
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>إلفورانس — الإدارة</title><link rel="stylesheet" href="./assets/app.css"><script src="./config.js" defer></script><script src="./assets/app.js" defer></script></head><body><div id="app"></div><noscript>يتطلب التطبيق JavaScript.</noscript></body></html>\n`,
  );
  const sha256 = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
  const hashes: Record<string, string> = {};
  for (const file of [...inputs, 'apps/admin-web/src/server/styles.css', 'package-lock.json'])
    hashes[file] = sha256(await readFile(resolve(sourceRoot, file)));
  await writeFile(
    resolve(output, 'admin-build.json'),
    JSON.stringify(
      { dataMode: 'server', environment: config.environment, inputs: hashes },
      null,
      2,
    ) + '\n',
  );
  return { output, inputs };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.env.ELVORANCE_ADMIN_CONFIG;
  if (!file)
    throw new Error('Set ELVORANCE_ADMIN_CONFIG to a reviewed JSON public configuration file.');
  const result = await buildAdminServer(
    JSON.parse(await readFile(resolve(file), 'utf8')) as unknown,
  );
  console.log(
    `Admin server-only build: ${result.output}; ${result.inputs.length} input files. No deployment performed.`,
  );
}

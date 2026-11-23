import { mkdir, writeFile } from 'node:fs/promises';
import { stagingTarget, domains } from '../../../infra/railway/staging/target.mts';
const observations: Record<string, unknown>[] = [];
for (const [service, origin, paths] of [
  ['gateway', stagingTarget.gatewayOrigin, ['/health', '/ready']],
  [
    'identity',
    stagingTarget.identityOrigin,
    ['/realms/elvorance-staging/.well-known/openid-configuration'],
  ],
  ...Object.entries(stagingTarget.web).map(([role, origin]) => [
    role,
    origin,
    ['/ready', '/build.json'],
  ]),
] as [string, string, string[]][]) {
  for (const path of paths) {
    const row: Record<string, unknown> = {
      service,
      url: origin + path,
      observedAt: new Date().toISOString(),
      passed: false,
    };
    try {
      const result = await fetch(origin + path, {
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
        headers: { accept: 'application/json' },
      });
      row.httpStatus = result.status;
      row.tlsVerified = true;
      const value = (await result.json()) as Record<string, unknown>;
      row.status = ['alive', 'ready', 'degraded', 'unavailable'].includes(String(value.status))
        ? value.status
        : null;
      row.source =
        typeof value.source === 'string' && /^[a-f0-9]{40}$/.test(value.source)
          ? value.source
          : null;
      if (service === 'gateway' && path === '/ready') {
        const dependencies = value.dependencies as Record<string, unknown> | undefined;
        row.dependencies = Object.fromEntries(
          domains.map((name) => [name, dependencies?.[name] === true]),
        );
        row.passed =
          result.status === 200 &&
          value.status === 'ready' &&
          domains.every((name) => dependencies?.[name] === true);
      } else if (service === 'identity')
        row.passed =
          result.status === 200 &&
          value.issuer === stagingTarget.identityOrigin + '/realms/elvorance-staging';
      else if (path === '/build.json')
        row.passed =
          result.status === 200 &&
          value.environment === 'staging' &&
          row.source !== null &&
          value.demoFallback === false;
      else
        row.passed =
          result.status === 200 && (value.status === 'alive' || value.status === 'ready');
    } catch {
      row.error = 'HTTP_TLS_DNS_OR_JSON_FAILURE';
    }
    observations.push(row);
  }
}
await mkdir('dist/staging', { recursive: true });
const passed = observations.every((row) => row.passed === true);
await writeFile(
  'dist/staging/observation.json',
  JSON.stringify(
    {
      observedAt: new Date().toISOString(),
      mode: 'read-only-no-authentication',
      passed,
      observations,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ event: 'staging-observation', passed, checks: observations.length }));
if (!passed) process.exitCode = 1;

import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { stagingTarget, ensure } from '../../../infra/railway/staging/target.mts';
export interface VercelTarget {
  role: 'admin' | 'client' | 'rep';
  name: string;
  projectId: string | null;
  origin: string | null;
}
export function validateVercelTarget(
  target: VercelTarget,
  teamId: string,
  env: NodeJS.ProcessEnv,
): string {
  ensure(
    teamId === 'team_LGL2uTTsmbGU72EMvonS1E5j' && env.VERCEL_ORG_ID === teamId,
    'Wrong Vercel team.',
  );
  ensure(
    env.VERCEL_ENV === 'preview' && env.ELVORANCE_ENVIRONMENT === 'staging',
    'Only an isolated staging preview build is permitted.',
  );
  ensure(
    ['admin', 'client', 'rep'].includes(target.role) &&
      target.name === `elvorance-staging-${target.role}`,
    'Unexpected project name.',
  );
  ensure(
    target.projectId &&
      /^prj_[A-Za-z0-9]+$/.test(target.projectId) &&
      env.VERCEL_PROJECT_ID === target.projectId,
    'Project ID must be reviewed and bound before build.',
  );
  ensure(
    target.origin && target.origin === `https://${target.name}.vercel.app`,
    'Exact enrolled staging origin required.',
  );
  return target.origin;
}
export async function emitVercelOutput(
  role: VercelTarget['role'],
  origin: string,
  sourceDirectory: string,
  destination: string,
) {
  ensure(origin === `https://elvorance-staging-${role}.vercel.app`, 'Unapproved web origin.');
  const output = resolve(destination, '.vercel/output'),
    directory = resolve(output, 'static');
  await mkdir(directory, { recursive: true });
  for (const file of ['index.html', 'app.js', 'styles.css', 'config.js', 'build.json'])
    await cp(resolve(sourceDirectory, file), resolve(directory, file));
  const provenance = JSON.parse(await readFile(resolve(directory, 'build.json'), 'utf8')) as {
    source: string;
    role: string;
    environment: string;
    assets: Record<string, string>;
    demoFallback: boolean;
  };
  ensure(
    provenance.role === role &&
      provenance.environment === 'staging' &&
      provenance.demoFallback === false &&
      /^[a-f0-9]{40}$/.test(provenance.source),
    'Invalid source-bound hosted bundle.',
  );
  const config = {
    dataMode: 'server',
    environment: 'staging',
    apiBaseUrl: stagingTarget.gatewayOrigin,
    auth: {
      environment: 'staging',
      issuer: stagingTarget.identityOrigin + '/realms/elvorance-staging',
      clientId: `elvorance-${role}-web-staging`,
      redirectUri: origin + '/callback',
      scopes: ['openid', 'profile'],
    },
  };
  await writeFile(
    resolve(directory, 'config.js'),
    'window.ELVORANCE_CONFIG=Object.freeze(' + JSON.stringify(config) + ');\n',
  );
  provenance.assets['config.js'] = createHash('sha256')
    .update(await readFile(resolve(directory, 'config.js')))
    .digest('hex');
  await writeFile(
    resolve(directory, 'build.json'),
    JSON.stringify({ ...provenance, platform: 'vercel', target: 'preview', origin }, null, 2),
  );
  await writeFile(
    resolve(directory, 'ready.json'),
    JSON.stringify({
      status: 'ready',
      service: role + '-web',
      source: provenance.source,
      environment: 'staging',
      note: 'Static build readiness only; upstream readiness is separate.',
    }),
  );
  const headers = {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'strict-transport-security': 'max-age=31536000',
    'content-security-policy': `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src ${stagingTarget.gatewayOrigin} ${stagingTarget.identityOrigin}; base-uri 'none'; frame-ancestors 'none'; form-action 'self' ${stagingTarget.identityOrigin}`,
  };
  await writeFile(
    resolve(output, 'config.json'),
    JSON.stringify(
      {
        version: 3,
        routes: [
          { src: '/(.*)', headers, continue: true },
          { src: '/ready', dest: '/ready.json' },
          { src: '/callback', dest: '/index.html' },
          { handle: 'filesystem' },
          { src: '/.*', status: 404 },
        ],
      },
      null,
      2,
    ),
  );
}

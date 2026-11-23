import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  validateVercelTarget,
  emitVercelOutput,
  type VercelTarget,
} from '../../tooling/scripts/hosted/vercel-output.mts';
const team = 'team_LGL2uTTsmbGU72EMvonS1E5j';
test('Vercel staging fails closed on missing registration, wrong team and production target', () => {
  const target: VercelTarget = {
    role: 'admin',
    name: 'elvorance-staging-admin',
    projectId: 'prj_SyntheticOnly',
    origin: 'https://elvorance-staging-admin.vercel.app',
  };
  const env = {
    VERCEL_ORG_ID: team,
    VERCEL_PROJECT_ID: target.projectId!,
    VERCEL_ENV: 'preview',
    ELVORANCE_ENVIRONMENT: 'staging',
  };
  assert.equal(validateVercelTarget(target, team, env), target.origin);
  assert.throws(() => validateVercelTarget({ ...target, projectId: null }, team, env));
  assert.throws(() => validateVercelTarget(target, team, { ...env, VERCEL_ENV: 'production' }));
  assert.throws(() => validateVercelTarget(target, 'other-team', env));
  assert.throws(() =>
    validateVercelTarget({ ...target, origin: 'https://production.example' }, team, env),
  );
});
test('Vercel output carries exact source, callback, asset digest and restrictive routing headers', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'elvorance-vercel-unit-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = join(directory, 'input'),
    output = join(directory, 'output');
  await mkdir(input);
  for (const file of ['index.html', 'app.js', 'styles.css', 'config.js'])
    await writeFile(join(input, file), 'synthetic fixture');
  await writeFile(
    join(input, 'build.json'),
    JSON.stringify({
      role: 'admin',
      environment: 'staging',
      source: 'a'.repeat(40),
      assets: {},
      demoFallback: false,
    }),
  );
  await emitVercelOutput('admin', 'https://elvorance-staging-admin.vercel.app', input, output);
  const base = join(output, '.vercel/output'),
    config = await readFile(join(base, 'static/config.js'), 'utf8');
  assert(config.includes('https://elvorance-staging-admin.vercel.app/callback'));
  const build = JSON.parse(await readFile(join(base, 'static/build.json'), 'utf8'));
  assert.equal(build.assets['config.js'], createHash('sha256').update(config).digest('hex'));
  assert.equal(build.source, 'a'.repeat(40));
  assert.equal(build.demoFallback, false);
  const routes = JSON.parse(await readFile(join(base, 'config.json'), 'utf8')).routes;
  assert.equal(routes[0].headers['x-frame-options'], 'DENY');
  assert.equal(routes.at(-1).status, 404);
});

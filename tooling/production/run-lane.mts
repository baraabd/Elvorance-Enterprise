import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { identity, sourceDigest, execute, finish, copyEvidence, filesUnder } from './evidence.mts';
import { parseTap, type Counts, type CommandReport, type FullContract } from './gate.mts';

const lane = process.argv[2] ?? '';
const contract = JSON.parse(
  await readFile('docs/production/full-ci-contract.json', 'utf8'),
) as FullContract;
const spec = contract.lanes.find((item) => item.name === lane);
if (!spec) throw new Error(`Uncontracted lane ${lane}`);
const context = await identity(),
  startedAt = new Date().toISOString(),
  before = await sourceDigest();
const directory = resolve('dist/full-ci', lane);
await mkdir(directory, { recursive: true });
const commands: CommandReport[] = [],
  blockers: string[] = [];
const npm =
  process.platform === 'win32'
    ? [
        'node',
        process.env.npm_execpath ?? 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js',
      ]
    : ['npm'];
// Resolve npm's installed CLI portably on Windows; cmd.exe is never used with interpolated arguments.
if (process.platform === 'win32') {
  const resolved = spawnSync('where.exe', ['npm.cmd'], { encoding: 'utf8' });
  const command = resolved.stdout.trim().split(/\r?\n/)[0];
  if (command) npm[1] = resolve(command, '..', 'node_modules/npm/bin/npm-cli.js');
}
const run = (script: string): string[] => [...npm, 'run', script];
const definitions: Record<string, string[]> = {
  'migration-report': run('audit:migration:report'),
  types: run('check:types'),
  boundaries: run('check:boundaries'),
  build: run('build'),
  inventory: run('inventory:check'),
  tests: run('test'),
  parity: run('test:parity'),
  regression: run('test:regression'),
  merged: run('test:merged'),
  'example-build': ['node', 'examples/instant-close/build.mts'],
  format: run('check:format'),
  package: run('package'),
  'production-tests': run('test:production'),
  'runtime-env': ['node', 'infra/compose/init-env.mts'],
  'runtime-build': run('infra:up'),
  'database-isolation': [
    'docker',
    'compose',
    '--env-file',
    'infra/compose/.env',
    '-f',
    'infra/compose/compose.yaml',
    'exec',
    '-T',
    'postgres',
    'sh',
    '/opt/atlas/check-isolation.sh',
  ],
  'runtime-journey': ['node', 'tests/runtime/compose-journey.mts'],
  'identity-integration': ['node', 'tooling/production/identity-fixture.mts'],
  'dependency-audit': [...npm, 'audit', '--audit-level=high', '--json'],
  'source-secrets': ['node', 'tooling/production/security-source.mts'],
  'browser-field-journey': ['node', 'tests/browser/run-rep-field.mts'],
  'windows-repair-syntax': [
    'pwsh',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    "$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile('tooling/windows/repair-npm-install.ps1',[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count -gt 0){$errors|ForEach-Object{Write-Error $_.Message};exit 1}",
  ],
};
const counts = (
  total: number,
  passed: number,
  failed: number,
  skipped: number,
  unit: string,
  skipNames: string[] = [],
): Counts => ({ total, passed, failed, skipped, unit, skipNames });
if (lane === 'project-linux' && !process.env.ELVORANCE_TEST_POSTGRES_URL)
  blockers.push(
    'Mandatory PostgreSQL URL is missing; optional local skip cannot satisfy this lane',
  );
for (const id of spec.commands) {
  const argv = definitions[id];
  if (!argv) {
    blockers.push(`No implementation for mandatory command ${id}`);
    continue;
  }
  try {
    const command = await execute(
      directory,
      id,
      argv,
      ['tests', 'merged', 'production-tests'].includes(id) ? parseTap : undefined,
    );
    if (id === 'parity' && command.exitCode === 0) {
      const report = JSON.parse(
        await readFile('tests/design-parity/artifacts/latest-results.json', 'utf8'),
      ) as { summary: { routes: number; routesPassed: number; routesFailed: number } };
      command.tests = counts(
        report.summary.routes,
        report.summary.routesPassed,
        report.summary.routesFailed,
        0,
        'frozen baseline route checks; NOT the exhaustive inventory',
      );
      await copyEvidence(
        directory,
        'tests/design-parity/artifacts/latest-results.json',
        'parity.json',
      );
    }
    if (id === 'regression' && command.exitCode === 0) {
      const summary = JSON.parse(
        await readFile('dist/evidence/regression/summary.json', 'utf8'),
      ) as { results: Array<{ suite: string; status: string }> };
      command.tests = counts(
        summary.results.length,
        summary.results.filter((row) => row.status === 'passed').length,
        summary.results.filter((row) => row.status !== 'passed').length,
        0,
        'legacy regression suites (individual scenario logs retained)',
      );
      await copyEvidence(directory, 'dist/evidence/regression', 'regression');
    }
    if (id === 'runtime-journey' && command.exitCode === 0) {
      const report = JSON.parse(await readFile('dist/runtime/compose-journey.json', 'utf8')) as {
        passed: boolean;
        sourceRevision: string;
        checks: unknown[];
      };
      if (report.sourceRevision !== context.sourceSha || !report.passed)
        throw new Error('Runtime report is stale or nonpassing');
      command.tests = counts(
        report.checks.length,
        report.checks.length,
        0,
        0,
        'persisted cross-service HTTP/event journey checks',
      );
      await copyEvidence(directory, 'dist/runtime/compose-journey.json', 'runtime-journey.json');
    }
    if (id === 'browser-field-journey' && command.exitCode === 0) {
      const report = JSON.parse(await readFile('dist/browser/field-report.json', 'utf8')) as {
        passed: boolean;
        sourceRevision: string;
        environment: string;
        checks: Array<{ name: string; passed: boolean }>;
      };
      if (
        !report.passed ||
        report.sourceRevision !== context.sourceSha ||
        report.environment !== 'loopback-chromium-memory-synthetic-auth' ||
        report.checks.length !== 10 ||
        report.checks.some((check) => check.passed !== true)
      )
        throw new Error('Missing, stale or incomplete browser journey evidence.');
      command.tests = counts(
        report.checks.length,
        report.checks.length,
        0,
        0,
        'Chromium UI journey checks; synthetic identity and memory storage, not native or hosted acceptance',
      );
      await copyEvidence(directory, 'dist/browser', 'browser');
    }
    if (id === 'identity-integration' && command.exitCode === 0) {
      const report = JSON.parse(
        await readFile('dist/identity-local-verification.json', 'utf8'),
      ) as Record<string, unknown>;
      const keys = [
        'idempotentBootstrap',
        'authorizationCodePkceS256',
        'idTokenSignatureJwks',
        'apiClaimsAndAudienceVerified',
        'adminOnlyAttributeSchema',
        'refreshRotationAndReplayRejection',
        'logoutRevocation',
      ];
      if (keys.some((key) => report[key] !== true))
        throw new Error('Identity integration assertions missing');
      command.tests = counts(
        1,
        1,
        0,
        0,
        'real loopback TLS Keycloak integration suite; named assertions retained',
      );
      await copyEvidence(directory, 'dist/identity-local-verification.json', 'identity.json');
      await copyEvidence(directory, 'dist/identity-fixture-images.json', 'identity-images.json');
    }
    if (id === 'package' && command.exitCode === 0) {
      const paths = (await filesUnder('dist')).filter((path) =>
        /Elvorance-Enterprise-[^/]+\.zip$/.test(path),
      );
      if (paths.length !== 1) throw new Error('Expected one source package');
      const path = paths[0];
      if (path) await copyEvidence(directory, path, 'source-package.zip');
    }
    if (spec.countedCommands.includes(id) && !command.tests) command.status = 'BLOCKED';
    commands.push(command);
  } catch (error) {
    blockers.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (lane === 'backend-runtime') {
  const images = spawnSync(
    'docker',
    [
      'compose',
      '--env-file',
      'infra/compose/.env',
      '-f',
      'infra/compose/compose.yaml',
      'images',
      '--format',
      'json',
    ],
    { encoding: 'utf8' },
  );
  if (images.status === 0) await writeFile(resolve(directory, 'images.json'), images.stdout);
  else blockers.push('Runtime image identity collection failed');
}
const report = await finish(
  directory,
  lane,
  startedAt,
  context,
  commands,
  before,
  blockers,
  spec.scope,
);
console.log(
  JSON.stringify(
    {
      lane,
      status: report.status,
      sourceSha: report.sourceSha,
      blockers: report.blockers,
      counts: commands.filter((c) => c.tests).map((c) => ({ command: c.id, counts: c.tests })),
    },
    null,
    2,
  ),
);
if (report.status !== 'PASS') process.exitCode = 1;

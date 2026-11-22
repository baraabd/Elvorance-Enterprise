import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { digest, json } from './source.mts';
import {
  parseTap,
  provenance,
  listEvidence,
  stageEvidence,
  type GateEvidence,
  type Totals,
} from './evidence.mts';

const gate = process.argv[2] ?? 'local';
if (!['quality-linux', 'quality-windows', 'native-linux', 'local'].includes(gate))
  throw new Error('Unsupported quality gate');
const npm = process.env.npm_execpath;
if (!npm)
  throw new Error(
    'Run through npm run ci:quality -- <gate> so the installed npm CLI is used portably.',
  );
const root = process.cwd();
const output = resolve(root, `dist/full-ci/${gate}`);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const source = provenance();
const failures: string[] = [];
const steps: {
  id: string;
  command: string[];
  exitCode: number | null;
  status: string;
  durationMs: number;
  logSha256: string;
  totals: Totals | null;
}[] = [];
const npmRun = (name: string): string[] => [npm, 'run', name];
const commands: { id: string; args: string[]; tests?: boolean; maxSkips?: number }[] = [
  { id: 'inventory-and-debt', args: npmRun('inventory:check') },
  { id: 'typecheck', args: npmRun('check:types') },
  { id: 'architecture', args: npmRun('check:boundaries') },
  { id: 'legacy-measurement', args: npmRun('audit:migration:report') },
  { id: 'all-builds', args: npmRun('build') },
  {
    id: 'all-node-tests',
    args: npmRun('test'),
    tests: true,
    maxSkips: gate === 'quality-linux' ? 0 : 1,
  },
  { id: 'design-parity', args: npmRun('test:parity') },
  { id: 'seven-regression-suites', args: npmRun('test:regression') },
  { id: 'standalone-merged-suites', args: npmRun('test:merged'), tests: true, maxSkips: 0 },
  { id: 'example-build', args: ['examples/instant-close/build.mts'] },
  { id: 'format', args: npmRun('check:format') },
  { id: 'source-package', args: npmRun('package') },
  { id: 'source-package-integrity', args: ['tooling/production/source-proof.mts'] },
];
if (gate === 'quality-linux' && !process.env.ELVORANCE_TEST_POSTGRES_URL)
  failures.push(
    'Mandatory real PostgreSQL URL absent; the Linux gate cannot waive its database test.',
  );
for (const command of commands) {
  const started = Date.now();
  let text = '';
  let timeout = false;
  console.log(`\n=== ${gate}/${command.id} ===`);
  const exitCode = await new Promise<number | null>((resolveRun) => {
    const child = spawn(process.execPath, command.args, {
      cwd: root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(
      () => {
        timeout = true;
        child.kill();
      },
      15 * 60 * 1000,
    );
    child.stdout.on('data', (chunk: Buffer) => {
      text += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      text += chunk.toString();
      process.stderr.write(chunk);
    });
    child.once('error', (error) => {
      text += error.message;
      clearTimeout(timer);
      resolveRun(null);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolveRun(code);
    });
  });
  writeFileSync(resolve(output, `${command.id}.log`), text);
  const totals = command.tests ? parseTap(text) : null;
  let status =
    exitCode === 0 && !timeout ? 'PASS' : timeout || exitCode === null ? 'BLOCKED' : 'FAIL';
  if (command.tests) {
    if (
      !totals ||
      totals.tests < 1 ||
      totals.failed ||
      totals.cancelled ||
      totals.todo ||
      totals.skipped > (command.maxSkips ?? 0)
    )
      status = 'BLOCKED';
    if (
      totals?.skipped &&
      !(totals.skipped === 1 && /^ok .*PostgreSQL: seven owned databases.*# SKIP/m.test(text))
    )
      status = 'BLOCKED';
  }
  if (status !== 'PASS') failures.push(`${command.id}: ${status}${timeout ? ' (timeout)' : ''}`);
  steps.push({
    id: command.id,
    command: [process.execPath, ...command.args],
    exitCode,
    status,
    durationMs: Date.now() - started,
    logSha256: digest(text),
    totals,
  });
  writeFileSync(resolve(output, 'steps.json'), json({ ...source, steps }));
}
const metrics: GateEvidence['metrics'] = steps
  .filter((step) => step.totals)
  .map((step) => ({ name: step.id, totals: step.totals }));
for (const [name, path] of [
  ['design-parity', 'tests/design-parity/artifacts/latest-results.json'],
  ['regression', 'dist/evidence/regression/summary.json'],
] as const) {
  if (!existsSync(path)) failures.push(`${name}: result file missing`);
  else {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    metrics.push({ name, totals: null, facts: value });
  }
}
const report: GateEvidence = {
  schemaVersion: 1,
  ...source,
  gate,
  status: failures.length ? 'BLOCKED' : 'PASS',
  blockers: failures,
  metrics,
  files: listEvidence(root, [
    `dist/full-ci/${gate}`,
    'dist/evidence/regression',
    'tests/design-parity/artifacts/latest-results.json',
    'dist/source-proof.json',
  ]),
};
writeFileSync(resolve(output, 'evidence.json'), json(report));
stageEvidence(report);
console.log(
  json({
    gate,
    status: report.status,
    blockers: failures,
    tests: steps.filter((step) => step.totals).map((step) => ({ step: step.id, ...step.totals })),
  }),
);
if (report.status !== 'PASS') process.exitCode = 1;

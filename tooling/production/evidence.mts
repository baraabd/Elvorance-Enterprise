import { execFileSync } from 'node:child_process';
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  copyFileSync,
} from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { digest, json } from './values.mts';

export interface Totals {
  tests: number;
  passed: number;
  failed: number;
  skipped: number;
  cancelled: number;
  todo: number;
}
export interface EvidenceFile {
  path: string;
  bytes: number;
  sha256: string;
}
export interface Provenance {
  sourceSha: string;
  sourceTree: string;
  repository: string | null;
  runId: string | null;
  attempt: number | null;
  runUrl: string | null;
  execution: 'github-actions' | 'local-not-remote-attestation';
  lockSha256: string;
}
export function provenance(root = process.cwd()): Provenance {
  const git = (args: string[]): string =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const repository = process.env.GITHUB_REPOSITORY ?? null;
  const runId = process.env.GITHUB_RUN_ID ?? null;
  return {
    sourceSha: git(['rev-parse', 'HEAD']),
    sourceTree: git(['rev-parse', 'HEAD^{tree}']),
    repository,
    runId,
    attempt: process.env.GITHUB_RUN_ATTEMPT ? Number(process.env.GITHUB_RUN_ATTEMPT) : null,
    runUrl:
      repository && runId
        ? `https://github.com/${repository}/actions/runs/${runId}/attempts/${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`
        : null,
    execution:
      process.env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local-not-remote-attestation',
    lockSha256: digest(readFileSync(resolve(root, 'package-lock.json'))),
  };
}
export function parseTap(text: string): Totals | null {
  const number = (label: string): number | null => {
    const value = [...text.matchAll(new RegExp(`^# ${label} (\\d+)\\s*$`, 'gm'))].at(-1)?.[1];
    return value === undefined ? null : Number(value);
  };
  const tests = number('tests'),
    passed = number('pass'),
    failed = number('fail'),
    skipped = number('skipped'),
    cancelled = number('cancelled'),
    todo = number('todo');
  if ([tests, passed, failed, skipped, cancelled, todo].some((value) => value === null))
    return null;
  return {
    tests: tests!,
    passed: passed!,
    failed: failed!,
    skipped: skipped!,
    cancelled: cancelled!,
    todo: todo!,
  };
}
export function listEvidence(root: string, paths: string[]): EvidenceFile[] {
  const output: EvidenceFile[] = [];
  function visit(path: string): void {
    const absolute = resolve(root, path);
    const rel = relative(root, absolute).replaceAll('\\', '/');
    if (rel.startsWith('../') || rel === '..')
      throw new Error('Evidence path must stay inside the repository.');
    if (!existsSync(absolute)) return;
    if (statSync(absolute).isDirectory())
      for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) =>
        a.name.localeCompare(b.name, 'en'),
      )) {
        if (!entry.isSymbolicLink()) visit(`${rel}/${entry.name}`);
      }
    else {
      // Evidence inputs are explicit build/report paths, never an environment or credentials directory.
      if (/(^|\/)\.env(?:\.|$)|\.p12$|\.jks$|\.keystore$|\.mobileprovision$|\.key$/i.test(rel))
        throw new Error(`Private material cannot be evidence: ${rel}`);
      const buffer = readFileSync(absolute);
      output.push({ path: rel, bytes: buffer.length, sha256: digest(buffer) });
    }
  }
  paths.forEach(visit);
  return [...new Map(output.map((item) => [item.path, item])).values()].sort((a, b) =>
    a.path.localeCompare(b.path, 'en'),
  );
}
export function parseJUnit(text: string): Totals | null {
  const values = [...text.matchAll(/<testsuite\s+([^>]+)>/g)];
  if (!values.length) return null;
  const total: Totals = { tests: 0, passed: 0, failed: 0, skipped: 0, cancelled: 0, todo: 0 };
  for (const value of values) {
    const attributes = Object.fromEntries(
      [...value[1]!.matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)].map((match) => [
        match[1]!,
        match[2]!,
      ]),
    );
    const tests = Number(attributes.tests),
      failed = Number(attributes.failures ?? '0') + Number(attributes.errors ?? '0'),
      skipped = Number(attributes.skipped ?? '0');
    if (![tests, failed, skipped].every(Number.isSafeInteger) || tests < failed + skipped)
      return null;
    total.tests += tests;
    total.failed += failed;
    total.skipped += skipped;
    total.passed += tests - failed - skipped;
  }
  return total;
}
export function addTotals(values: Totals[]): Totals {
  return values.reduce(
    (sum, value) => ({
      tests: sum.tests + value.tests,
      passed: sum.passed + value.passed,
      failed: sum.failed + value.failed,
      skipped: sum.skipped + value.skipped,
      cancelled: sum.cancelled + value.cancelled,
      todo: sum.todo + value.todo,
    }),
    { tests: 0, passed: 0, failed: 0, skipped: 0, cancelled: 0, todo: 0 },
  );
}
export interface GateEvidence extends Provenance {
  schemaVersion: 1;
  gate: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  blockers: string[];
  metrics: { name: string; totals: Totals | null; facts?: Record<string, unknown> }[];
  files: EvidenceFile[];
}
export function stageEvidence(report: GateEvidence, root = process.cwd()): string {
  const destination = resolve(root, `dist/evidence-upload/${report.gate}`);
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  for (const file of report.files) {
    const target = resolve(destination, file.path);
    const rel = relative(destination, target).replaceAll('\\', '/');
    if (rel.startsWith('../') || rel === '..')
      throw new Error('Evidence cannot escape its archive.');
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(resolve(root, file.path), target);
  }
  writeFileSync(resolve(destination, 'evidence.json'), json(report));
  return destination;
}
export function capturePlatform(gate: string, root = process.cwd()): GateEvidence {
  const blockers: string[] = [];
  const metrics: GateEvidence['metrics'] = [];
  let paths: string[] = [];
  if (process.env.S01_JOB_STATUS !== 'success')
    blockers.push(`Previous job steps: ${process.env.S01_JOB_STATUS ?? 'missing-status'}`);
  if (gate === 'native-android') {
    paths = [
      'apps/rep-mobile/android/app/build/test-results',
      'apps/rep-mobile/android/app/build/outputs/androidTest-results',
      'apps/rep-mobile/android/app/build/reports',
      'apps/rep-mobile/android/app/build/outputs/bundle/stagingRelease',
    ];
    const files = listEvidence(root, paths);
    for (const [name, match] of [
      ['unit', '/test-results/'],
      ['emulator', '/androidTest-results/'],
    ] as const) {
      const reports = files.filter(
        (file) => file.path.includes(match) && file.path.endsWith('.xml'),
      );
      const parsed = reports.map((file) =>
        parseJUnit(readFileSync(resolve(root, file.path), 'utf8')),
      );
      const totals =
        parsed.every((value) => value !== null) && parsed.length
          ? addTotals(parsed as Totals[])
          : null;
      metrics.push({ name, totals });
      if (!totals || totals.tests < 1 || totals.failed || totals.skipped)
        blockers.push(`Missing or non-passing Android ${name} JUnit results`);
    }
    if (!files.some((file) => file.path.endsWith('.aab')))
      blockers.push('Unsigned verification bundle absent');
  } else if (gate === 'native-ios') {
    paths = ['ios-verification.log', 'dist/rep-native/ios-verification.xcresult'];
    const log = existsSync(resolve(root, paths[0]!))
      ? readFileSync(resolve(root, paths[0]!), 'utf8')
      : '';
    const match = [...log.matchAll(/Executed (\d+) tests?, with (\d+) failures?/g)].at(-1);
    let totals: Totals | null = match
      ? {
          tests: Number(match[1]),
          passed: Number(match[1]) - Number(match[2]),
          failed: Number(match[2]),
          skipped: 0,
          cancelled: 0,
          todo: 0,
        }
      : null;
    try {
      const result = execFileSync(
        'xcrun',
        ['xcresulttool', 'get', 'test-results', 'summary', '--path', paths[1]!],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      const value = JSON.parse(result) as Record<string, unknown>;
      if (
        ['totalTestCount', 'passedTests', 'failedTests', 'skippedTests'].every(
          (key) => typeof value[key] === 'number',
        )
      )
        totals = {
          tests: Number(value.totalTestCount),
          passed: Number(value.passedTests),
          failed: Number(value.failedTests),
          skipped: Number(value.skippedTests),
          cancelled: 0,
          todo: 0,
        };
      else {
        totals = null;
        blockers.push(
          'Unsupported xcresult summary fields; do not infer zero skips from a successful xcodebuild exit.',
        );
      }
      const output = resolve(root, 'dist/rep-native/ios-test-summary.json');
      writeFileSync(output, result);
      paths.push('dist/rep-native/ios-test-summary.json');
    } catch {
      totals = null;
      blockers.push('xcresult summary could not be read');
    }
    metrics.push({ name: 'iPhone-simulator', totals });
    if (
      !totals ||
      totals.tests < 1 ||
      totals.failed ||
      totals.skipped ||
      !log.includes('** TEST SUCCEEDED **')
    )
      blockers.push('Missing or non-passing iOS simulator results');
  } else if (gate === 'runtime') {
    paths = ['dist/runtime'];
    const path = resolve(root, 'dist/runtime/compose-journey.json');
    if (!existsSync(path)) blockers.push('Runtime journey report missing');
    else {
      const value = JSON.parse(readFileSync(path, 'utf8')) as {
        passed?: boolean;
        checks?: unknown[];
        requests?: number;
        sourceRevision?: string;
        productionPromotionAllowed?: boolean;
      };
      if (
        value.passed !== true ||
        value.sourceRevision !== provenance(root).sourceSha ||
        !Array.isArray(value.checks) ||
        !value.checks.length ||
        !value.requests ||
        value.productionPromotionAllowed !== false
      )
        blockers.push('Invalid runtime source or journey result');
      metrics.push({
        name: 'real-distributed-journey',
        totals: null,
        facts: {
          checks: value.checks?.length ?? null,
          requests: value.requests ?? null,
          syntheticData: true,
          authentication: 'dev-hs256-not-hosted-oidc',
        },
      });
    }
  } else if (gate === 'identity') {
    paths = ['dist/identity-local-verification.json'];
    if (!existsSync(resolve(root, paths[0]!))) blockers.push('Real Keycloak report missing');
    else {
      const value = JSON.parse(readFileSync(resolve(root, paths[0]!), 'utf8')) as Record<
        string,
        unknown
      >;
      const checks = [
        'idempotentBootstrap',
        'authorizationCodePkceS256',
        'idTokenSignatureJwks',
        'apiClaimsAndAudienceVerified',
        'adminOnlyAttributeSchema',
        'refreshRotationAndReplayRejection',
        'logoutRevocation',
      ];
      if (value.keycloak !== '26.8.2' || checks.some((key) => value[key] !== true))
        blockers.push('Incomplete Keycloak lifecycle verification');
      metrics.push({
        name: 'loopback-real-Keycloak-lifecycle',
        totals: null,
        facts: {
          scenarios: 1,
          reportedChecks: checks.length,
          physicalDevice: false,
          hostedStaging: false,
        },
      });
    }
  } else throw new Error(`Unknown platform gate: ${gate}`);
  const report: GateEvidence = {
    schemaVersion: 1,
    ...provenance(root),
    gate,
    status: blockers.length ? 'BLOCKED' : 'PASS',
    blockers,
    metrics,
    files: listEvidence(root, paths),
  };
  const output = resolve(root, `dist/full-ci/${gate}`);
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'evidence.json'), json(report));
  stageEvidence(report, root);
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const gate = process.argv[2];
  if (!gate) throw new Error('Provide a platform gate.');
  const report = capturePlatform(gate);
  console.log(json(report));
  if (report.status !== 'PASS') process.exitCode = 1;
}

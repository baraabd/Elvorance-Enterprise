import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { digest, json } from './values.mts';
import { provenance, type GateEvidence } from './evidence.mts';

export const requiredJobs = ['project', 'distributed', 'native', 'identity', 'security'] as const;
export const requiredGates = [
  'quality-linux',
  'quality-windows',
  'native-linux',
  'native-android',
  'native-ios',
  'runtime',
  'identity',
  'security',
] as const;
/** Mandatory measured result sections; an arbitrary nonempty report is insufficient. */
export const requiredMetrics: Record<(typeof requiredGates)[number], readonly string[]> = {
  'quality-linux': ['all-node-tests', 'standalone-merged-suites', 'design-parity', 'regression'],
  'quality-windows': ['all-node-tests', 'standalone-merged-suites', 'design-parity', 'regression'],
  'native-linux': ['all-node-tests', 'standalone-merged-suites', 'design-parity', 'regression'],
  'native-android': ['unit', 'emulator'],
  'native-ios': ['iPhone-simulator'],
  runtime: ['real-distributed-journey'],
  identity: ['loopback-real-Keycloak-lifecycle'],
  security: ['dependency-and-source-scans'],
};
const countedMetrics = new Set([
  'all-node-tests',
  'standalone-merged-suites',
  'unit',
  'emulator',
  'iPhone-simulator',
]);
export interface Artifact {
  id: number;
  name: string;
  digest?: string;
  expired: boolean;
  workflow_run?: { head_sha: string };
  size_in_bytes: number;
  created_at: string;
}
export interface GateInput {
  sourceSha: string;
  sourceTree: string;
  repository: string;
  runId: string;
  attempt: number;
  needs: Record<string, { result?: string }>;
  evidence: GateEvidence[];
  artifacts: Artifact[];
}
export function evaluate(input: GateInput): { status: 'PASS' | 'BLOCKED'; blockers: string[] } {
  const blockers: string[] = [];
  if (
    !/^[a-f0-9]{40}$/.test(input.sourceSha) ||
    !/^[a-f0-9]{40}$/.test(input.sourceTree) ||
    !Number.isSafeInteger(input.attempt) ||
    input.attempt < 1
  )
    blockers.push('Invalid immutable source or attempt');
  for (const job of requiredJobs)
    if (input.needs[job]?.result !== 'success')
      blockers.push(`${job}: ${input.needs[job]?.result ?? 'MISSING'}`);
  for (const [job, state] of Object.entries(input.needs))
    if (state.result !== 'success')
      blockers.push(`Non-successful dependency ${job}: ${state.result ?? 'MISSING'}`);
  for (const gate of requiredGates) {
    const reports = input.evidence.filter((value) => value.gate === gate);
    if (reports.length !== 1) {
      blockers.push(`${gate}: expected exactly one evidence report, found ${reports.length}`);
      continue;
    }
    const report = reports[0]!;
    if (report.status !== 'PASS' || report.blockers.length)
      blockers.push(`${gate}: evidence is ${report.status}`);
    if (
      report.sourceSha !== input.sourceSha ||
      report.sourceTree !== input.sourceTree ||
      report.repository !== input.repository ||
      report.runId !== input.runId ||
      report.attempt !== input.attempt ||
      report.execution !== 'github-actions'
    )
      blockers.push(`${gate}: stale or mismatched evidence provenance`);
    for (const name of requiredMetrics[gate]) {
      const matches = report.metrics.filter((metric) => metric.name === name);
      if (matches.length !== 1 || (countedMetrics.has(name) && !matches[0]?.totals))
        blockers.push(`${gate}: missing/duplicate measured result ${name}`);
    }
    for (const metric of report.metrics)
      if (metric.totals) {
        const values = Object.values(metric.totals);
        const totals = metric.totals;
        const permittedComplementarySkip =
          (gate === 'quality-windows' || gate === 'native-linux') &&
          metric.name === 'all-node-tests' &&
          totals.skipped === 1;
        if (
          !values.every((value) => Number.isSafeInteger(value) && value >= 0) ||
          totals.tests < 1 ||
          totals.failed ||
          totals.cancelled ||
          totals.todo ||
          (totals.skipped > 0 && !permittedComplementarySkip) ||
          totals.tests !==
            totals.passed + totals.failed + totals.skipped + totals.cancelled + totals.todo
        )
          blockers.push(`${gate}: invalid or non-passing measured totals for ${metric.name}`);
      }
    if (!/^[a-f0-9]{64}$/.test(report.lockSha256) || !report.files.length || !report.metrics.length)
      blockers.push(`${gate}: missing measured results or file digests`);
    const artifacts = input.artifacts.filter(
      (artifact) => artifact.name === `s01-${gate}-a${input.attempt}`,
    );
    if (artifacts.length !== 1) blockers.push(`${gate}: evidence artifact missing or ambiguous`);
    else {
      const artifact = artifacts[0]!;
      if (
        !Number.isSafeInteger(artifact.id) ||
        artifact.id < 1 ||
        artifact.expired ||
        artifact.size_in_bytes <= 0 ||
        !/^sha256:[a-f0-9]{64}$/.test(artifact.digest ?? '') ||
        artifact.workflow_run?.head_sha !== input.sourceSha
      )
        blockers.push(`${gate}: invalid/expired artifact or mismatched artifact SHA`);
    }
  }
  if (new Set(input.evidence.map((report) => report.lockSha256)).size !== 1)
    blockers.push('Dependency lock hashes differ between gates');
  for (const artifactName of [
    'elvorance-enterprise-source',
    'elvorance-enterprise-source-windows',
  ]) {
    const artifacts = input.artifacts.filter(
      (artifact) => artifact.name === `${artifactName}-a${input.attempt}`,
    );
    if (
      artifacts.length !== 1 ||
      artifacts[0]?.expired ||
      !/^sha256:[a-f0-9]{64}$/.test(artifacts[0]?.digest ?? '') ||
      artifacts[0]?.workflow_run?.head_sha !== input.sourceSha
    )
      blockers.push(`${artifactName}: source artifact missing, stale or without digest`);
  }
  return { status: blockers.length ? 'BLOCKED' : 'PASS', blockers: [...new Set(blockers)] };
}
export function verifyEvidenceFiles(
  directory: string,
  reports: { report: GateEvidence; artifactRoot: string }[],
): string[] {
  const errors: string[] = [];
  for (const { report, artifactRoot } of reports)
    for (const file of report.files) {
      const path = resolve(artifactRoot, file.path);
      const within = relative(artifactRoot, path).replaceAll('\\', '/');
      const collection = relative(directory, artifactRoot).replaceAll('\\', '/');
      if (
        within.startsWith('../') ||
        within === '..' ||
        collection.startsWith('../') ||
        collection === '..'
      ) {
        errors.push(`${report.gate}: path escaped artifact`);
        continue;
      }
      if (!existsSync(path)) {
        errors.push(`${report.gate}: evidence file absent ${file.path}`);
        continue;
      }
      const bytes = readFileSync(path);
      if (bytes.length !== file.bytes || digest(bytes) !== file.sha256)
        errors.push(`${report.gate}: digest mismatch ${file.path}`);
    }
  return errors;
}
async function main(): Promise<void> {
  const source = provenance();
  const directory = resolve(process.env.S01_EVIDENCE_DIRECTORY ?? 'dist/downloaded-evidence');
  const reports: { report: GateEvidence; artifactRoot: string }[] = [];
  function visit(path: string, artifactRoot: string): void {
    if (!existsSync(path)) return;
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = resolve(path, entry.name);
      if (entry.isDirectory()) visit(child, artifactRoot);
      else if (entry.isFile() && entry.name === 'evidence.json')
        reports.push({
          report: JSON.parse(readFileSync(child, 'utf8')) as GateEvidence,
          artifactRoot,
        });
    }
  }
  if (existsSync(directory))
    for (const entry of readdirSync(directory, { withFileTypes: true }))
      if (entry.isDirectory())
        visit(resolve(directory, entry.name), resolve(directory, entry.name));
  const blockers: string[] = [];
  const artifacts: Artifact[] = [];
  if (!source.repository || !source.runId || !source.attempt || !process.env.GITHUB_TOKEN)
    blockers.push('GitHub run context/token absent; local execution cannot attest FULL-CI');
  else {
    for (let page = 1; ; page++) {
      const response = await fetch(
        `https://api.github.com/repos/${source.repository}/actions/runs/${source.runId}/artifacts?per_page=100&page=${page}`,
        {
          headers: {
            authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          redirect: 'error',
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!response.ok) {
        blockers.push(`Cannot verify artifact metadata (HTTP ${response.status})`);
        break;
      }
      const data = (await response.json()) as { artifacts: Artifact[] };
      artifacts.push(...data.artifacts);
      if (data.artifacts.length < 100) break;
    }
  }
  const input: GateInput = {
    sourceSha: source.sourceSha,
    sourceTree: source.sourceTree,
    repository: source.repository ?? '',
    runId: source.runId ?? '',
    attempt: source.attempt ?? 0,
    needs: JSON.parse(process.env.S01_NEEDS ?? '{}') as GateInput['needs'],
    evidence: reports.map((value) => value.report),
    artifacts,
  };
  blockers.push(...evaluate(input).blockers, ...verifyEvidenceFiles(directory, reports));
  const report = {
    schemaVersion: 1,
    ...source,
    contract: 'docs/production/QUALITY-CONTRACT.md',
    contractSha256: digest(readFileSync('docs/production/QUALITY-CONTRACT.md')),
    status: blockers.length ? 'BLOCKED' : 'PASS',
    blockers: [...new Set(blockers)],
    requiredJobs,
    requiredGates,
    jobs: input.needs,
    artifacts: artifacts.filter((artifact) => artifact.name.endsWith(`-a${source.attempt}`)),
    evidence: input.evidence,
    counting:
      'Per-gate totals. Repeated suites across platforms are not unique business-workflow coverage.',
    productionApproval: false,
  };
  const output = resolve('dist/full-ci-aggregate');
  mkdirSync(output, { recursive: true });
  const text = json(report);
  writeFileSync(resolve(output, 'FULL-CI.json'), text);
  writeFileSync(resolve(output, 'FULL-CI.sha256'), `${digest(text)}  FULL-CI.json\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    writeFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `# FULL-CI: ${report.status}\n\nSource: \`${source.sourceSha}\`\n\n${report.blockers.map((value) => `- ${value}`).join('\n')}\n\nEvidence: FULL-CI.json (artifact contains exact source, attempts, per-gate totals and SHA-256 digests).\n`,
    );
  console.log(
    json({ status: report.status, sourceSha: source.sourceSha, blockers: report.blockers }),
  );
  if (report.status !== 'PASS') process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main();

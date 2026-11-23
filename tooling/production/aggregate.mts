import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { evaluate, type FullContract, type LaneReport, type GateResult } from './gate.mts';
import { identity, hash } from './evidence.mts';

export interface Artifact {
  id: number;
  name: string;
  digest: string;
  expired: boolean;
  workflow_run?: { id: number; head_sha: string };
}
export function verifyBundle(archive: Uint8Array, expectedDigest: string): LaneReport {
  if (!/^sha256:[a-f0-9]{64}$/.test(expectedDigest) || 'sha256:' + hash(archive) !== expectedDigest)
    throw new Error('GitHub artifact ZIP digest mismatch');
  if (archive.byteLength > 128 * 1024 * 1024)
    throw new Error('Evidence archive exceeds size budget');
  let declaredSize = 0;
  const names = new Set<string>();
  const entries = unzipSync(archive, {
    filter(file) {
      if (
        names.has(file.name) ||
        file.name.startsWith('/') ||
        file.name.includes('\\') ||
        file.name.split('/').includes('..')
      )
        throw new Error('Unsafe or duplicate artifact path');
      names.add(file.name);
      declaredSize += file.originalSize;
      if (!Number.isSafeInteger(declaredSize) || declaredSize > 256 * 1024 * 1024)
        throw new Error('Expanded evidence exceeds size budget');
      return true;
    },
  });
  let expanded = 0;
  for (const [path, bytes] of Object.entries(entries)) {
    if (path.startsWith('/') || path.includes('\\') || path.split('/').includes('..'))
      throw new Error('Unsafe artifact path');
    expanded += bytes.length;
    if (expanded > 256 * 1024 * 1024) throw new Error('Expanded evidence exceeds size budget');
  }
  const raw = entries['report.json'];
  if (!raw) throw new Error('Missing lane report.json');
  const report = JSON.parse(new TextDecoder().decode(raw)) as LaneReport;
  if (
    report.schemaVersion !== 1 ||
    !Array.isArray(report.commands) ||
    !Array.isArray(report.artifacts) ||
    !Array.isArray(report.blockers) ||
    typeof report.lane !== 'string'
  )
    throw new Error('Malformed lane report');
  const manifest = new Map(report.artifacts.map((file) => [file.path, file]));
  if (manifest.size !== report.artifacts.length) throw new Error('Duplicate evidence path');
  for (const [path, bytes] of Object.entries(entries)) {
    if (path.endsWith('/') || path === 'report.json') continue;
    const entry = manifest.get(path);
    if (!entry || entry.bytes !== bytes.length || entry.sha256 !== hash(bytes))
      throw new Error('Missing/tampered evidence file: ' + path);
  }
  for (const file of report.artifacts)
    if (!entries[file.path]) throw new Error('Manifest file missing from ZIP: ' + file.path);
  return report;
}
export function selectArtifact(all: Artifact[], name: string, runId: string): Artifact {
  const candidates = all.filter((artifact) => artifact.name === name);
  if (candidates.length !== 1)
    throw new Error(`Expected one immutable artifact, found ${candidates.length}`);
  const artifact = candidates[0];
  if (
    !artifact ||
    artifact.expired ||
    artifact.workflow_run?.id !== Number(runId) ||
    !/^sha256:[a-f0-9]{64}$/.test(artifact.digest)
  )
    throw new Error('Expired, undigested or foreign-run artifact');
  return artifact;
}
async function main(): Promise<void> {
  const context = await identity();
  const contract = JSON.parse(
    await readFile('docs/production/full-ci-contract.json', 'utf8'),
  ) as FullContract;
  const needs = JSON.parse(process.env.FULL_CI_NEEDS ?? '{}') as Record<
    string,
    { result?: string }
  >;
  const token = process.env.GH_TOKEN;
  if (!token || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(context.repository))
    throw new Error('Authenticated current-run artifact access is required');
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const base = `https://api.github.com/repos/${context.repository}`;
  const all: Artifact[] = [];
  const errors: string[] = [];
  const provenance: Array<Record<string, unknown>> = [];
  for (let page = 1; ; page++) {
    const response = await fetch(
      `${base}/actions/runs/${context.runId}/artifacts?per_page=100&page=${page}`,
      { headers, redirect: 'error', signal: AbortSignal.timeout(30_000) },
    );
    if (!response.ok)
      throw new Error(`Current-run artifact metadata unavailable: HTTP ${response.status}`);
    const payload = (await response.json()) as { artifacts: Artifact[] };
    if (!Array.isArray(payload.artifacts)) throw new Error('Invalid GitHub artifact metadata');
    all.push(...payload.artifacts);
    if (payload.artifacts.length < 100) break;
    if (page >= 20) throw new Error('Artifact pagination exceeded safety budget');
  }
  const reports: LaneReport[] = [];
  for (const lane of contract.lanes) {
    const name = `full-ci-${lane.name}-${context.sourceSha}-${context.runAttempt}`;
    try {
      const artifact = selectArtifact(all, name, context.runId);
      const response = await fetch(`${base}/actions/artifacts/${artifact.id}/zip`, {
        headers,
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok || new URL(response.url).protocol !== 'https:')
        throw new Error(`Artifact download unavailable: HTTP ${response.status}`);
      const archive = new Uint8Array(await response.arrayBuffer());
      const report = verifyBundle(archive, artifact.digest);
      if (report.lane !== lane.name)
        throw new Error('Artifact lane does not match its immutable name');
      reports.push(report);
      provenance.push({
        lane: lane.name,
        id: artifact.id,
        name: artifact.name,
        digest: artifact.digest,
        downloadedZipDigest: 'sha256:' + hash(archive),
        triggerHeadSha: artifact.workflow_run?.head_sha ?? null,
        url: `https://github.com/${context.repository}/actions/runs/${context.runId}/artifacts/${artifact.id}`,
      });
    } catch (error) {
      errors.push(`${lane.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  let result: GateResult;
  try {
    result = evaluate(contract, context, reports, needs);
  } catch (error) {
    result = {
      status: 'BLOCKED',
      errors: ['Malformed evidence: ' + (error instanceof Error ? error.message : String(error))],
      lanes: [],
    };
  }
  result.errors.push(...errors);
  if (result.errors.length) result.status = 'BLOCKED';
  const output = {
    schemaVersion: 1,
    ...context,
    runUrl: `https://github.com/${context.repository}/actions/runs/${context.runId}`,
    contractSha256: hash(await readFile('docs/production/full-ci-contract.json')),
    ...result,
    artifacts: provenance,
    productionDecision:
      'NO-GO: engineering CI does not supply hosted staging, signing, physical device, external-provider or operational acceptance',
    note: 'Counts are per command/lane, not deduplicated unique business workflows. Only explicitly declared redundant platform skips are accepted.',
  };
  await mkdir('dist/full-ci-aggregate', { recursive: true });
  await writeFile('dist/full-ci-aggregate/report.json', JSON.stringify(output, null, 2) + '\n');
  const markdown =
    `# FULL-CI: ${result.status}\n\nSource: \`${context.sourceSha}\`  \nTree: \`${context.sourceTree}\`  \nRun: ${output.runUrl} (attempt ${context.runAttempt})\n\n` +
    result.lanes
      .flatMap((lane) => [
        `## ${lane.lane}: ${lane.status}`,
        ...lane.counts.map(
          (row) =>
            `${row.command}: ${row.counts.passed} passed, ${row.counts.failed} failed, ${row.counts.skipped} skipped / ${row.counts.total} (${row.counts.unit}).${row.counts.skipNames.length ? ' Skips: ' + row.counts.skipNames.join('; ') : ''}`,
        ),
      ])
      .join('\n\n') +
    '\n\n' +
    result.errors.map((error) => '- BLOCKED: ' + error).join('\n') +
    '\n\nArtifact IDs and verified SHA-256 digests: `report.json`. Production remains NO-GO.\n';
  await writeFile('dist/full-ci-aggregate/SUMMARY.md', markdown);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  console.log(JSON.stringify(output, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}
// Importing verification helpers in unit tests never invokes GitHub.
if (
  process.argv[1]?.replaceAll('\\', '/').endsWith('/aggregate.mts') ||
  process.argv[1] === 'tooling/production/aggregate.mts'
)
  await main();

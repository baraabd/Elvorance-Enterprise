import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, copyFile, stat } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type { CommandReport, Counts, FileDigest, GateContext, LaneReport } from './gate.mts';
export const hash = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');
export const slash = (value: string): string => value.replaceAll('\\', '/');
export function git(args: string[]): string {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr}`);
  return result.stdout.trim();
}
export async function identity(): Promise<GateContext> {
  const sourceSha = git(['rev-parse', 'HEAD']);
  if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== sourceSha)
    throw new Error('Checkout does not match the exact triggering SHA');
  return {
    sourceSha,
    sourceTree: git(['rev-parse', 'HEAD^{tree}']),
    runId: process.env.GITHUB_RUN_ID ?? '0',
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? '0',
    repository: process.env.GITHUB_REPOSITORY ?? 'LOCAL-UNPUBLISHED',
    lockSha256: hash(await readFile('package-lock.json')),
  };
}
/** Tests intentionally rewrite only these pre-existing, generated reports. No product source may change. */
export const generatedReport = (path: string): boolean =>
  /^tests\/design-parity\/artifacts\/|^tests\/regression\/[^/]+results\.json$/.test(path);
export async function sourceDigest(): Promise<string> {
  const files = git(['ls-files', '-z'])
    .split('\0')
    .filter(Boolean)
    .filter((path) => !generatedReport(path))
    .sort();
  return hash(
    JSON.stringify(
      await Promise.all(files.map(async (path) => ({ path, sha256: hash(await readFile(path)) }))),
    ),
  );
}
export async function filesUnder(path: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name, 'en'),
  )) {
    const full = resolve(path, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Evidence must not contain symlinks');
    if (entry.isDirectory()) output.push(...(await filesUnder(full)));
    else if (entry.isFile()) output.push(full);
  }
  return output;
}
export async function copyEvidence(
  directory: string,
  source: string,
  destination: string,
): Promise<void> {
  const info = await stat(source);
  const target = resolve(directory, 'files', destination);
  if (info.isDirectory()) {
    for (const path of await filesUnder(source)) {
      const out = resolve(target, relative(source, path));
      await mkdir(dirname(out), { recursive: true });
      await copyFile(path, out);
    }
  } else {
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
}
export async function execute(
  directory: string,
  id: string,
  argv: string[],
  parse?: (text: string) => Counts | null,
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<CommandReport> {
  if (!/^[a-z0-9-]+$/.test(id) || !argv.length) throw new Error('Invalid command identity');
  const startedAt = new Date().toISOString();
  let output = '';
  let timedOut = false;
  const executable = argv[0];
  if (!executable) throw new Error('Empty executable');
  const exitCode = await new Promise<number | null>((resolveExit) => {
    const child = spawn(executable, argv.slice(1), {
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, 25 * 60_000);
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });
    child.on('error', (error) => {
      output += '\n' + error.message;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveExit(code);
    });
  });
  const log = `logs/${id}.log`;
  await mkdir(resolve(directory, 'logs'), { recursive: true });
  await writeFile(resolve(directory, log), output);
  const tests = parse?.(output) ?? null;
  return {
    id,
    argv,
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode,
    status:
      timedOut || exitCode === null
        ? 'BLOCKED'
        : exitCode !== 0
          ? 'FAIL'
          : parse && !tests
            ? 'BLOCKED'
            : 'PASS',
    log,
    logSha256: hash(output),
    tests,
  };
}
export async function finish(
  directory: string,
  lane: string,
  startedAt: string,
  context: GateContext,
  commands: CommandReport[],
  before: string,
  blockers: string[],
  scope: string,
): Promise<LaneReport> {
  const sourceUnchanged = before === (await sourceDigest());
  if (!sourceUnchanged) blockers.push('Tracked source changed during the lane');
  const artifacts: FileDigest[] = [];
  for (const path of await filesUnder(directory)) {
    if (path === resolve(directory, 'report.json')) continue;
    const bytes = await readFile(path);
    artifacts.push({
      path: slash(relative(directory, path)),
      sha256: hash(bytes),
      bytes: bytes.length,
    });
  }
  const report: LaneReport = {
    schemaVersion: 1,
    lane,
    status:
      blockers.length || commands.some((c) => c.status === 'BLOCKED')
        ? 'BLOCKED'
        : commands.some((c) => c.status === 'FAIL')
          ? 'FAIL'
          : 'PASS',
    ...context,
    platform: process.platform,
    node: process.version,
    startedAt,
    finishedAt: new Date().toISOString(),
    commands,
    artifacts,
    blockers,
    sourceUnchanged,
    scope,
  };
  await writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

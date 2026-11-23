/** Pure, fail-closed FULL-CI decision logic. I/O/provenance verification lives in aggregate.mts. */
export interface Counts {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  skipNames: string[];
  unit: string;
}
export interface CommandReport {
  id: string;
  argv: string[];
  startedAt: string;
  finishedAt: string;
  exitCode: number | null;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  log: string;
  logSha256: string;
  tests: Counts | null;
}
export interface FileDigest {
  path: string;
  sha256: string;
  bytes: number;
}
export interface LaneReport {
  schemaVersion: 1;
  lane: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  sourceSha: string;
  sourceTree: string;
  runId: string;
  runAttempt: string;
  repository: string;
  platform: string;
  node: string;
  lockSha256: string;
  startedAt: string;
  finishedAt: string;
  commands: CommandReport[];
  artifacts: FileDigest[];
  blockers: string[];
  sourceUnchanged: boolean;
  scope: string;
}
export interface LaneContract {
  name: string;
  commands: string[];
  countedCommands: string[];
  allowedSkips: string[];
  scope: string;
}
export interface FullContract {
  schemaVersion: 1;
  requiredJobs: string[];
  lanes: LaneContract[];
}
export interface GateContext {
  sourceSha: string;
  sourceTree: string;
  runId: string;
  runAttempt: string;
  repository: string;
  lockSha256: string;
}
export interface GateResult {
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  lanes: Array<{
    lane: string;
    status: string;
    counts: Array<{ command: string; counts: Counts }>;
  }>;
}
const sha = (value: unknown, length: number): boolean =>
  typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
export function validCounts(value: Counts): boolean {
  return (
    ['total', 'passed', 'failed', 'skipped'].every((key) => {
      const number = Reflect.get(value, key) as unknown;
      return Number.isSafeInteger(number) && Number(number) >= 0;
    }) &&
    value.total === value.passed + value.failed + value.skipped &&
    value.total > 0 &&
    Array.isArray(value.skipNames) &&
    value.skipNames.every((name) => typeof name === 'string') &&
    new Set(value.skipNames).size === value.skipped &&
    value.skipNames.length === value.skipped
  );
}
export function evaluate(
  contract: FullContract,
  context: GateContext,
  reports: LaneReport[],
  needs: Record<string, { result?: string }>,
): GateResult {
  const errors: string[] = [];
  if (contract.schemaVersion !== 1 || !contract.requiredJobs.length || !contract.lanes.length)
    errors.push('Invalid/empty FULL-CI contract');
  if (
    !sha(context.sourceSha, 40) ||
    !sha(context.sourceTree, 40) ||
    !sha(context.lockSha256, 64) ||
    !/^\d+$/.test(context.runId) ||
    !/^\d+$/.test(context.runAttempt) ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(context.repository)
  )
    errors.push('Invalid immutable execution identity');
  if (
    new Set(contract.requiredJobs).size !== contract.requiredJobs.length ||
    new Set(contract.lanes.map((l) => l.name)).size !== contract.lanes.length
  )
    errors.push('Duplicate contract entries');
  for (const job of contract.requiredJobs)
    if (needs[job]?.result !== 'success')
      errors.push(`Mandatory job ${job}: ${needs[job]?.result ?? 'MISSING'}`);
  for (const job of Object.keys(needs))
    if (!contract.requiredJobs.includes(job)) errors.push(`Unexpected job dependency ${job}`);
  const byLane = new Map<string, LaneReport>();
  for (const report of reports) {
    if (byLane.has(report.lane)) errors.push(`Duplicate lane ${report.lane}`);
    byLane.set(report.lane, report);
    if (!contract.lanes.some((lane) => lane.name === report.lane))
      errors.push(`Unexpected lane ${report.lane}`);
  }
  const summaries: GateResult['lanes'] = [];
  for (const lane of contract.lanes) {
    const report = byLane.get(lane.name);
    if (!report) {
      errors.push(`Mandatory evidence ${lane.name}: MISSING`);
      continue;
    }
    const prefix = `${lane.name}: `;
    if (report.schemaVersion !== 1 || report.status !== 'PASS')
      errors.push(prefix + `nonpassing report ${report.status}`);
    for (const key of [
      'sourceSha',
      'sourceTree',
      'runId',
      'runAttempt',
      'repository',
      'lockSha256',
    ] as const)
      if (report[key] !== context[key]) errors.push(prefix + `stale/mismatched ${key}`);
    if (report.sourceUnchanged !== true)
      errors.push(prefix + 'tracked source changed during execution');
    if (
      !Number.isFinite(Date.parse(report.startedAt)) ||
      !Number.isFinite(Date.parse(report.finishedAt)) ||
      Date.parse(report.finishedAt) < Date.parse(report.startedAt)
    )
      errors.push(prefix + 'invalid execution timestamps');
    if (report.blockers.length)
      errors.push(prefix + 'unresolved blockers: ' + report.blockers.join('; '));
    const commands = new Map(report.commands.map((command) => [command.id, command]));
    if (commands.size !== report.commands.length)
      errors.push(prefix + 'duplicate command evidence');
    for (const id of lane.commands) {
      const command = commands.get(id);
      if (!command) {
        errors.push(prefix + `mandatory command ${id}: MISSING`);
        continue;
      }
      if (command.exitCode !== 0 || command.status !== 'PASS')
        errors.push(prefix + `command ${id} did not pass`);
      if (
        !sha(command.logSha256, 64) ||
        !report.artifacts.some(
          (file) => file.path === command.log && file.sha256 === command.logSha256,
        )
      )
        errors.push(prefix + `command ${id} has no bound log`);
      if (
        !command.argv.length ||
        !Number.isFinite(Date.parse(command.startedAt)) ||
        !Number.isFinite(Date.parse(command.finishedAt)) ||
        Date.parse(command.finishedAt) < Date.parse(command.startedAt) ||
        Date.parse(command.startedAt) < Date.parse(report.startedAt) ||
        Date.parse(command.finishedAt) > Date.parse(report.finishedAt)
      )
        errors.push(prefix + `command ${id} has incomplete execution evidence`);
      if (lane.countedCommands.includes(id) && (!command.tests || !validCounts(command.tests)))
        errors.push(prefix + `command ${id} has missing/invalid test totals`);
      if (command.tests) {
        if (!validCounts(command.tests) || command.tests.failed)
          errors.push(prefix + `command ${id} test failure/invalid totals`);
        for (const skipped of command.tests.skipNames)
          if (!lane.allowedSkips.includes(skipped))
            errors.push(prefix + `mandatory test skipped: ${skipped}`);
      }
    }
    for (const id of commands.keys())
      if (!lane.commands.includes(id)) errors.push(prefix + `uncontracted command ${id}`);
    if (new Set(report.artifacts.map((file) => file.path)).size !== report.artifacts.length)
      errors.push(prefix + 'duplicate artifact path');
    if (!report.artifacts.length) errors.push(prefix + 'missing artifacts');
    for (const file of report.artifacts)
      if (
        !sha(file.sha256, 64) ||
        !Number.isSafeInteger(file.bytes) ||
        file.bytes < 0 ||
        file.path.startsWith('/') ||
        file.path.includes('\\') ||
        file.path.split('/').includes('..')
      )
        errors.push(prefix + 'invalid artifact manifest');
    summaries.push({
      lane: lane.name,
      status: report.status,
      counts: report.commands
        .filter((command) => command.tests !== null)
        .map((command) => ({ command: command.id, counts: command.tests as Counts })),
    });
  }
  return { status: errors.length ? 'BLOCKED' : 'PASS', errors, lanes: summaries };
}
export function parseTap(text: string): Counts | null {
  const last = (name: string): number | null => {
    const matches = [...text.matchAll(new RegExp(`^# ${name} (\\d+)\\s*$`, 'gm'))];
    const value = matches.at(-1)?.[1];
    return value === undefined ? null : Number(value);
  };
  const total = last('tests'),
    passed = last('pass'),
    failed = last('fail'),
    skipped = last('skipped'),
    todo = last('todo');
  if (
    total === null ||
    passed === null ||
    failed === null ||
    skipped === null ||
    todo === null ||
    todo !== 0
  )
    return null;
  const skipNames = [...text.matchAll(/^\s*ok \d+ - (.+?)\s+# SKIP(?: .*)?$/gm)].map(
    (match) => match[1] ?? 'unknown',
  );
  const result = {
    total,
    passed,
    failed,
    skipped,
    skipNames,
    unit: 'node:test test cases (includes subtests; duplicate suites across lanes not unique coverage)',
  };
  return validCounts(result) ? result : null;
}

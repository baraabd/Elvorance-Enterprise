import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { identity, sourceDigest, execute, finish, copyEvidence, filesUnder } from './evidence.mts';
import type { Counts, CommandReport, GateContext, FullContract } from './gate.mts';
interface State {
  context: GateContext;
  before: string;
  startedAt: string;
  commands: CommandReport[];
}
const [mode, platform, ...rest] = process.argv.slice(2);
if (platform !== 'android' && platform !== 'ios') throw new Error('Select native android or ios');
const lane = `native-${platform}`,
  directory = resolve('dist/full-ci', lane),
  statePath = resolve(directory, 'state.json');
await mkdir(directory, { recursive: true });
if (mode === 'begin') {
  const state: State = {
    context: await identity(),
    before: await sourceDigest(),
    startedAt: new Date().toISOString(),
    commands: [],
  };
  await writeFile(statePath, JSON.stringify(state));
} else {
  const state = JSON.parse(await readFile(statePath, 'utf8')) as State;
  if (mode === 'command') {
    const [id, separator, ...argv] = rest;
    if (!id || separator !== '--') throw new Error('Expected command ID -- executable arguments');
    const command = await execute(directory, id, argv);
    state.commands.push(command);
    await writeFile(statePath, JSON.stringify(state));
    if (command.status !== 'PASS') process.exitCode = 1;
  } else if (mode === 'finish') {
    const contract = JSON.parse(
      await readFile('docs/production/full-ci-contract.json', 'utf8'),
    ) as FullContract;
    const spec = contract.lanes.find((row) => row.name === lane);
    if (!spec) throw new Error('Native lane absent from contract');
    const blockers: string[] = [];
    async function junit(folder: string): Promise<Counts> {
      const files = (await filesUnder(folder)).filter((path) => /TEST-[^/]+\.xml$/.test(path));
      if (!files.length) throw new Error(`No JUnit test results in ${folder}`);
      let total = 0,
        failed = 0,
        skipped = 0;
      const skipNames: string[] = [];
      const identities = new Set<string>();
      for (const path of files) {
        const dom = new JSDOM(await readFile(path, 'utf8'), { contentType: 'application/xml' });
        try {
          for (const test of dom.window.document.querySelectorAll('testcase')) {
            const name = `${test.getAttribute('classname') ?? ''}.${test.getAttribute('name') ?? ''}`;
            if (identities.has(name)) throw new Error(`Duplicate native test result ${name}`);
            identities.add(name);
            total++;
            if (test.querySelector('failure,error')) failed++;
            else if (test.querySelector('skipped')) {
              skipped++;
              skipNames.push(name);
            }
          }
        } finally {
          dom.window.close();
        }
      }
      return {
        total,
        passed: total - failed - skipped,
        failed,
        skipped,
        skipNames,
        unit: 'native JUnit test cases',
      };
    }
    try {
      if (platform === 'android') {
        const unit = 'apps/rep-mobile/android/app/build/test-results/testStagingDebugUnitTest';
        const instrumented =
          'apps/rep-mobile/android/app/build/outputs/androidTest-results/connected';
        for (const [id, path] of [
          ['android-build', unit],
          ['android-instrumented', instrumented],
        ] as const) {
          const command = state.commands.find((row) => row.id === id);
          if (!command) throw new Error(`Missing ${id}`);
          command.tests = await junit(path);
          await copyEvidence(directory, path, id + '-xml');
        }
      } else {
        const path = 'dist/rep-native/ios-verification.xcresult';
        const summary = spawnSync(
          'xcrun',
          ['xcresulttool', 'get', 'test-results', 'summary', '--path', path],
          { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
        );
        if (summary.status !== 0)
          throw new Error('xcresulttool did not produce native test totals: ' + summary.stderr);
        const parsed = JSON.parse(summary.stdout) as {
          totalTestCount: number;
          passedTests: number;
          failedTests: number;
          skippedTests: number;
        };
        const command = state.commands.find((row) => row.id === 'ios-simulator');
        if (!command) throw new Error('Missing simulator command');
        command.tests = {
          total: parsed.totalTestCount,
          passed: parsed.passedTests,
          failed: parsed.failedTests,
          skipped: parsed.skippedTests,
          skipNames: Array.from(
            { length: parsed.skippedTests ?? 0 },
            (_, index) => `xcresult skipped test ${index + 1}: mandatory native skip`,
          ),
          unit: 'Xcode simulator test cases from xcresulttool',
        };
        await writeFile(resolve(directory, 'xcresult-summary.json'), summary.stdout);
      }
    } catch (error) {
      blockers.push(error instanceof Error ? error.message : String(error));
    }
    for (const id of spec.commands)
      if (!state.commands.some((row) => row.id === id)) blockers.push('Missing command ' + id);
    const report = await finish(
      directory,
      lane,
      state.startedAt,
      state.context,
      state.commands,
      state.before,
      blockers,
      spec.scope,
    );
    console.log(
      JSON.stringify(
        {
          lane,
          status: report.status,
          blockers,
          counts: report.commands.map((row) => ({ id: row.id, tests: row.tests })),
        },
        null,
        2,
      ),
    );
    if (report.status !== 'PASS') process.exitCode = 1;
  } else throw new Error('Expected begin, command or finish');
}

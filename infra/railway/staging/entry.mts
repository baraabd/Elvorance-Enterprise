import { operationLog } from '../../../packages/service-kit/src/operations-log.ts';
import { writeFile, mkdir } from 'node:fs/promises';
import { bootstrapStaging } from './bootstrap.mts';
import { runHostedAcceptance } from './acceptance.mts';
import { assertStaging, sourceRevision } from './target.mts';

try {
  assertStaging();
  const startedAt = new Date().toISOString();
  const source = sourceRevision();
  const mode = process.env.STAGING_OPERATION;
  const result = mode === 'bootstrap' ? await bootstrapStaging() : await runHostedAcceptance();
  const evidence = {
    schemaVersion: 1,
    scope: 'hosted-staging-' + mode,
    source,
    startedAt,
    endedAt: new Date().toISOString(),
    passed: true,
    ...result,
  };
  await mkdir('/tmp/elvorance-evidence', { recursive: true, mode: 0o700 });
  await writeFile('/tmp/elvorance-evidence/' + mode + '.json', JSON.stringify(evidence, null, 2), {
    mode: 0o600,
  });
  console.log('ELVORANCE_EVIDENCE ' + JSON.stringify(evidence));
} catch (error) {
  console.error(
    operationLog(
      'staging-ops',
      'operation-failed',
      process.env.STAGING_OPERATION ?? 'unknown',
      error,
    ),
  );
  process.exitCode = 1;
}

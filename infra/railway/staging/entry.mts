import { writeFile, mkdir } from 'node:fs/promises';
import { bootstrapStaging } from './bootstrap.mts';
import { assertStaging, sourceRevision } from './target.mts';

try {
  assertStaging();
  const startedAt = new Date().toISOString();
  const source = sourceRevision();
  if (process.env.STAGING_OPERATION !== 'bootstrap')
    throw new Error('Acceptance command not included in this bootstrap-only revision.');
  const result = await bootstrapStaging();
  const evidence = {
    schemaVersion: 1,
    scope: 'hosted-staging-bootstrap',
    source,
    startedAt,
    endedAt: new Date().toISOString(),
    passed: true,
    ...result,
  };
  await mkdir('/tmp/elvorance-evidence', { recursive: true, mode: 0o700 });
  await writeFile('/tmp/elvorance-evidence/bootstrap.json', JSON.stringify(evidence, null, 2), {
    mode: 0o600,
  });
  console.log('ELVORANCE_EVIDENCE ' + JSON.stringify(evidence));
} catch (error) {
  // Never serialize driver errors, request bodies, credentials, tokens, SQL or connection strings.
  const code =
    error && typeof error === 'object' && 'code' in error ? String(error.code) : 'OPERATION_FAILED';
  const message =
    error instanceof Error && !('code' in error)
      ? error.message
      : 'Staging operation failed; inspect the operation phase and error code.';
  console.error('ELVORANCE_FAILURE ' + JSON.stringify({ code, message }));
  process.exitCode = 1;
}

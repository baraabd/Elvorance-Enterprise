/** Allowlisted metadata only. Never serialize driver errors, URLs, SQL, payloads or tokens. */
const knownCodes = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  '28P01',
  '42501',
  '42P01',
  '53300',
  '57P01',
  '57014',
  'BROKER_CONFIG',
  'BROKER_TOPOLOGY',
  'UNROUTABLE_EVENT',
  'CONFIRM_TIMEOUT',
]);
export function safeErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return 'UNCLASSIFIED';
  return typeof error.code === 'string' && knownCodes.has(error.code) ? error.code : 'UNCLASSIFIED';
}
export function operationLog(
  service: string,
  event: string,
  phase: string,
  error?: unknown,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const token = (value: string) => (/^[a-z][a-z0-9_-]{0,63}$/.test(value) ? value : 'invalid');
  const source = env.RAILWAY_GIT_COMMIT_SHA ?? env.SOURCE_REVISION;
  return JSON.stringify({
    time: new Date().toISOString(),
    level: error === undefined ? 'info' : 'error',
    service: token(service),
    event: token(event),
    phase: token(phase),
    environment: env.ELVORANCE_ENVIRONMENT === 'staging' ? 'staging' : 'local-or-unclassified',
    source: source && /^[a-f0-9]{40}$/.test(source) ? source : null,
    code: error === undefined ? null : safeErrorCode(error),
  });
}

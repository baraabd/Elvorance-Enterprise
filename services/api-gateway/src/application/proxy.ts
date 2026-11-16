import { AppError, assert } from '@elvorance/service-kit';
export interface ProxyRequest {
  origin: string;
  suffix: string;
  query: string;
  method: string;
  authorization: string;
  requestId: string;
  idempotencyKey?: string;
  body?: unknown;
}
export async function forward(
  input: ProxyRequest,
  fetcher: typeof fetch = fetch,
): Promise<{ status: number; body: unknown }> {
  assert(
    input.suffix.startsWith('/') &&
      !input.suffix.includes('..') &&
      !/%2e|%2f|%5c/i.test(input.suffix),
    'INVALID_PATH',
    'Invalid upstream path',
  );
  const target = new URL(`/v1${input.suffix}${input.query}`, input.origin);
  assert(target.origin === input.origin, 'INVALID_UPSTREAM', 'Upstream origin is not allowed', 500);
  const headers: Record<string, string> = {
    authorization: input.authorization,
    accept: 'application/json',
    'x-request-id': input.requestId,
  };
  if (input.idempotencyKey) headers['idempotency-key'] = input.idempotencyKey;
  const init: RequestInit = {
    method: input.method,
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(12_000),
  };
  if (input.body !== undefined && !['GET', 'HEAD'].includes(input.method)) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(input.body);
  }
  let response: Response;
  try {
    response = await fetcher(target, init);
  } catch {
    throw new AppError(
      503,
      'UPSTREAM_UNAVAILABLE',
      'The requested service is temporarily unavailable',
    );
  }
  assert(
    response.headers.get('content-type')?.includes('application/json'),
    'UPSTREAM_RESPONSE',
    'Service returned an invalid response',
    502,
  );
  const raw = await response.text();
  assert(raw.length <= 2_000_000, 'UPSTREAM_RESPONSE', 'Service response is too large', 502);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new AppError(502, 'UPSTREAM_RESPONSE', 'Service returned invalid JSON');
  }
  return { status: response.status, body };
}

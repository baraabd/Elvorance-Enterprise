import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { HostedSession } from './identity-fixture.mts';
import { assertStaging, ensure, stagingTarget } from './target.mts';
export function hostedHttp() {
  assertStaging();
  const observations: Array<{
    method: string;
    path: string;
    status: number;
    expected: number;
    elapsedMs: number;
  }> = [];
  async function request<T>(
    method: string,
    path: string,
    options: {
      session?: HostedSession;
      token?: string;
      body?: unknown;
      key?: string;
      status?: number;
    } = {},
  ): Promise<T> {
    const url = new URL(path, stagingTarget.gatewayOrigin);
    ensure(
      path.startsWith('/') && url.origin === stagingTarget.gatewayOrigin,
      'Request left the explicitly authorized gateway.',
    );
    const token = options.session ? await options.session.auth.getAccessToken() : options.token;
    if (options.session) ensure(token, 'Session has no verified access token.');
    const started = performance.now();
    const response = await fetch(url, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        accept: 'application/json',
        ...(token ? { authorization: 'Bearer ' + token } : {}),
        ...(method === 'GET' ? {} : { 'idempotency-key': options.key ?? randomUUID() }),
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const expected = options.status ?? 200;
    observations.push({
      method,
      path,
      status: response.status,
      expected,
      elapsedMs: Math.round((performance.now() - started) * 100) / 100,
    });
    const text = await response.text();
    ensure(
      response.status === expected,
      `${method} ${path}: HTTP ${response.status}, expected ${expected}.`,
    );
    ensure(
      response.headers.get('content-type')?.includes('application/json'),
      'Gateway response was not JSON.',
    );
    return JSON.parse(text) as T;
  }
  return { request, observations };
}

import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import type { HostedSession } from './identity-fixture.mts';
import { assertStaging, ensure, stagingTarget } from './target.mts';
export function percentile(values: readonly number[], p: number): number {
  ensure(values.length > 0 && p > 0 && p <= 1, 'Invalid percentile input.');
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.ceil(p * sorted.length) - 1]!.toFixed(2));
}
/** Bounded five-minute read-only soak. This is not a saturation or production capacity claim. */
export async function sustainedLoad(session: HostedSession) {
  assertStaging();
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const durationMs = 300000;
  const concurrency = 8;
  const cadenceMs = 500;
  const samples: Array<{ ms: number; status: number; window: number }> = [];
  let abort = false;
  await Promise.all(
    Array.from({ length: concurrency }, async (_, worker) => {
      await delay(worker * 50);
      while (!abort && performance.now() - started < durationMs) {
        const t = performance.now();
        let status = 0;
        try {
          const token = await session.auth.getAccessToken();
          ensure(token, 'Load session expired.');
          const response = await fetch(stagingTarget.gatewayOrigin + '/v1/crm/customers?limit=20', {
            redirect: 'error',
            signal: AbortSignal.timeout(10000),
            headers: { authorization: 'Bearer ' + token, accept: 'application/json' },
          });
          status = response.status;
          const body = (await response.json()) as { items?: unknown };
          if (!Array.isArray(body.items)) status = 0;
        } catch {
          status = 0;
        }
        samples.push({
          ms: performance.now() - t,
          status,
          window: Math.min(4, Math.floor((t - started) / 60000)),
        });
        if (
          samples.length >= 40 &&
          samples.filter((s) => s.status !== 200).length / samples.length > 0.05
        )
          abort = true;
        await delay(Math.max(0, cadenceMs - (performance.now() - t)));
      }
    }),
  );
  const elapsedMs = performance.now() - started;
  const failures = samples.filter((s) => s.status !== 200).length;
  const p95Ms = percentile(
    samples.map((s) => s.ms),
    0.95,
  );
  const p99Ms = percentile(
    samples.map((s) => s.ms),
    0.99,
  );
  const errorRate = failures / samples.length;
  const windows = Array.from({ length: 5 }, (_, window) => {
    const rows = samples.filter((s) => s.window === window);
    return {
      window,
      requests: rows.length,
      failures: rows.filter((s) => s.status !== 200).length,
      p95Ms: rows.length
        ? percentile(
            rows.map((s) => s.ms),
            0.95,
          )
        : null,
    };
  });
  const result = {
    scope: 'Five-minute hosted staging paced read-only soak',
    startedAt,
    completedAt: new Date().toISOString(),
    elapsedMs: Math.round(elapsedMs),
    concurrency,
    cadenceMs,
    requests: samples.length,
    failures,
    errorRate,
    p95Ms,
    p99Ms,
    throughputRps: Number((samples.length / (elapsedMs / 1000)).toFixed(2)),
    windows,
    budget: {
      p95Ms: 500,
      p99Ms: 1000,
      errorRate: 0.01,
      minimumRequests: 3000,
      minimumDurationMs: 300000,
      ownerApproved: false,
      classification: 'Proposed engineering gate, not an approved business SLO',
    },
    passed:
      !abort &&
      elapsedMs >= durationMs &&
      samples.length >= 3000 &&
      p95Ms <= 500 &&
      p99Ms <= 1000 &&
      errorRate <= 0.01,
  };
  console.log('ELVORANCE_LOAD ' + JSON.stringify(result));
  return result;
}

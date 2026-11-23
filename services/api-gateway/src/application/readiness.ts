import { serviceNames, type Upstreams } from '../domain/routes.ts';

/** Coalesce probes so public health checks cannot fan out unbounded concurrent upstream requests. */
export function readinessProbe(upstreams: Upstreams, fetcher: typeof fetch = fetch) {
  let pending: Promise<Record<string, boolean>> | null = null;
  let last: { value: Record<string, boolean>; expiresAt: number } | null = null;
  return async (): Promise<Record<string, boolean>> => {
    if (last && Date.now() < last.expiresAt) return last.value;
    if (pending) return pending;
    pending = Promise.all(
      serviceNames.map(async (service) => {
        try {
          const response = await fetcher(`${upstreams[service]}/ready`, {
            method: 'GET',
            redirect: 'error',
            signal: AbortSignal.timeout(3000),
            cache: 'no-store',
          });
          if (!response.ok) {
            await response.body?.cancel();
            return [service, false] as const;
          }
          const result = (await response.json()) as Record<string, unknown> | null;
          return [
            service,
            result?.service === service &&
              result.status === 'ready' &&
              result.database === 'ready' &&
              result.broker === 'ready',
          ] as const;
        } catch {
          return [service, false] as const;
        }
      }),
    )
      .then((entries) => {
        const value = Object.fromEntries(entries);
        last = { value, expiresAt: Date.now() + 1000 };
        return value;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}

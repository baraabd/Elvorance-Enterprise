import { assert } from '@atlas/service-kit';
import { serviceNames, type Upstreams } from '../domain/routes.ts';
export function upstreamsFromEnv(env: NodeJS.ProcessEnv = process.env): Upstreams {
  return Object.fromEntries(
    serviceNames.map((name, index) => {
      const value =
        env[`${name.toUpperCase()}_URL`] ??
        (env.NODE_ENV === 'production' ? '' : `http://127.0.0.1:${3001 + index}`);
      const url = new URL(value);
      assert(
        ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          url.pathname === '/' &&
          !url.search &&
          !url.hash,
        'CONFIGURATION',
        `${name.toUpperCase()}_URL must be an HTTP origin`,
        500,
      );
      return [name, url.origin];
    }),
  ) as Upstreams;
}

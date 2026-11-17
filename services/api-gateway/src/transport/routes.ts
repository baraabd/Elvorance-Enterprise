import type { FastifyInstance } from 'fastify';
import { assert } from '@elvorance/service-kit';
import { forward } from '../application/proxy.ts';
import { serviceNames, type Upstreams } from '../domain/routes.ts';
export function registerRoutes(
  app: FastifyInstance,
  upstreams: Upstreams,
  fetcher: typeof fetch = fetch,
): void {
  for (const name of serviceNames)
    app.route({
      method: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      url: `/v1/${name}/*`,
      handler: async (request, reply) => {
        // Only original verified Bearer authorization and a small allowlist cross the boundary.
        // Incoming tenant/role/forwarded identity headers are intentionally not propagated.
        const source = new URL(request.url, 'http://gateway.local');
        const suffix = source.pathname.slice(`/v1/${name}`.length);
        const key = request.headers['idempotency-key'];
        assert(
          !Array.isArray(key),
          'INVALID_IDEMPOTENCY_KEY',
          'A single Idempotency-Key is required',
        );
        const result = await forward(
          {
            origin: upstreams[name],
            suffix,
            query: source.search,
            method: request.method,
            authorization: request.headers.authorization!,
            requestId: request.id,
            ...(typeof key === 'string' ? { idempotencyKey: key } : {}),
            ...(request.body !== undefined ? { body: request.body } : {}),
          },
          fetcher,
        );
        return reply.code(result.status).send(result.body);
      },
    });
}

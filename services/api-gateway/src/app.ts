import Fastify from 'fastify';
import { AppError, type AuthVerifier } from '@elvorance/service-kit';
import { registerRoutes } from './transport/routes.ts';
import type { Upstreams } from './domain/routes.ts';
import { readinessProbe } from './application/readiness.ts';
export interface GatewayOptions {
  auth: AuthVerifier;
  upstreams: Upstreams;
  fetcher?: typeof fetch;
  logger?: boolean;
  allowedOrigins?: string[];
}
export function createApp(options: GatewayOptions) {
  const app = Fastify({
    logger: options.logger
      ? { redact: ['req.headers.authorization', 'req.headers.cookie'] }
      : false,
    bodyLimit: 256 * 1024,
  });
  app.decorateRequest('principal');
  app.addHook('onRequest', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    reply.header('x-content-type-options', 'nosniff');
    const origin = request.headers.origin;
    if (origin && options.allowedOrigins?.includes(origin)) {
      reply.header('access-control-allow-origin', origin);
      reply.header('vary', 'Origin');
      reply.header('access-control-allow-headers', 'Authorization,Content-Type,Idempotency-Key');
      reply.header('access-control-allow-methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    }
    if (request.method === 'OPTIONS') return reply.code(204).send();
    if (request.url.startsWith('/v1/'))
      request.principal = await options.auth(request.headers.authorization);
  });
  app.options('/*', async (_request, reply) => reply.code(204).send());
  app.setErrorHandler((error, request, reply) => {
    const known = error instanceof AppError;
    reply.code(known ? error.statusCode : 500).send({
      error: {
        code: known ? error.code : 'INTERNAL_ERROR',
        message: known ? error.message : 'Gateway request failed',
        requestId: request.id,
      },
    });
  });
  app.get('/health', async () => ({ service: 'api-gateway', status: 'alive' }));
  const probe = readinessProbe(options.upstreams, options.fetcher);
  app.get('/ready', async (_request, reply) => {
    const dependencies = await probe();
    const ready = Object.values(dependencies).every(Boolean);
    return reply
      .code(ready ? 200 : 503)
      .send({ service: 'api-gateway', status: ready ? 'ready' : 'degraded', dependencies });
  });
  registerRoutes(app, options.upstreams, options.fetcher);
  return app;
}

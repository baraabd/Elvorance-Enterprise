import Fastify from 'fastify';
import { AppError, type AuthVerifier } from '@elvorance/service-kit';
import { registerRoutes } from './transport/routes.ts';
import type { Upstreams } from './domain/routes.ts';
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
    requestTimeout: 30_000,
  });
  app.decorateRequest('principal');
  app.addHook('onRequest', async (request, reply) => {
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
    // Preserve parser/validation 4xx responses without disclosing framework internals.
    const candidate = (error as { statusCode?: unknown }).statusCode;
    let status = 500;
    if (known) status = error.statusCode;
    else if (
      typeof candidate === 'number' &&
      Number.isInteger(candidate) &&
      candidate >= 400 &&
      candidate < 500
    )
      status = candidate;
    if (status >= 500) request.log.error({ err: error }, 'Gateway request failed');
    reply.code(status).send({
      error: {
        code: known ? error.code : status < 500 ? 'INVALID_REQUEST' : 'INTERNAL_ERROR',
        message: known
          ? error.message
          : status < 500
            ? 'The request could not be processed'
            : 'Gateway request failed',
        requestId: request.id,
      },
    });
  });
  app.get('/health', async () => ({ service: 'api-gateway', status: 'alive' }));
  app.get('/ready', async () => ({
    service: 'api-gateway',
    status: 'ready',
    note: 'Gateway readiness does not imply every upstream is ready; check upstream /ready endpoints',
  }));
  registerRoutes(app, options.upstreams, options.fetcher);
  return app;
}

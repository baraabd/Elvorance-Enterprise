import rateLimit from '@fastify/rate-limit';
import Fastify, { LogController } from 'fastify';
import {
  AppError,
  RequestLimits,
  registerSecurityAudit,
  type AuthVerifier,
  type AuditObserver,
  type RequestLimitOptions,
} from '@elvorance/service-kit';
import { registerRoutes } from './transport/routes.ts';
import type { Upstreams } from './domain/routes.ts';
import { readinessProbe } from './application/readiness.ts';
export interface GatewayOptions {
  auth: AuthVerifier;
  upstreams: Upstreams;
  fetcher?: typeof fetch;
  logger?: boolean;
  allowedOrigins?: string[];
  requestLimits?: RequestLimitOptions;
  auditObserver?: AuditObserver;
}
export function createApp(options: GatewayOptions) {
  const app = Fastify({
    logger: options.logger
      ? { redact: ['req.headers.authorization', 'req.headers.cookie'] }
      : false,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 256 * 1024,
    requestTimeout: 30_000,
  });
  // Per-process socket-IP admission happens before parsing or JWT verification.
  // Existing tenant/principal budgets remain an independent second layer in the gateway.
  void app.register(rateLimit, {
    global: true,
    hook: 'onRequest',
    max: 600,
    timeWindow: 60_000,
    cache: 10_000,
    skipOnError: false,
    errorResponseBuilder: () => new AppError(429, 'RATE_LIMITED', 'Too many requests'),
  });
  // These factories register routes synchronously, before plugin boot. Attach an
  // instance hook as well as the plugin's onRoute hook so early routes cannot bypass it.
  let admission: ReturnType<typeof app.rateLimit> | undefined;
  app.addHook('onRequest', async (request, reply) => {
    if (request.routeOptions.config.rateLimit === false) return;
    admission ??= app.rateLimit();
    await admission.call(app, request, reply);
  });
  app.decorateRequest('principal');
  const limits = new RequestLimits(options.requestLimits);
  registerSecurityAudit(app, 'api-gateway', options.auditObserver);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    reply.header('x-content-type-options', 'nosniff');
    reply.header('vary', 'Origin');
    if (request.routeOptions.url?.startsWith('/v1/') || request.url.startsWith('/v1/'))
      limits.ip(request.ip);
    const origin = request.headers.origin;
    if (origin && !options.allowedOrigins?.includes(origin))
      throw new AppError(403, 'ORIGIN_DENIED', 'Request origin is not allowed');
    if (origin && options.allowedOrigins?.includes(origin)) {
      reply.header('access-control-allow-origin', origin);
      reply.header('vary', 'Origin');
      reply.header('access-control-allow-headers', 'Authorization,Content-Type,Idempotency-Key');
      reply.header('access-control-allow-methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    }
    if (request.method === 'OPTIONS') return reply.code(204).send();
  });
  app.addHook('preParsing', async (request) => {
    if (request.method === 'OPTIONS') return;
    if (request.routeOptions.url?.startsWith('/v1/') || request.url.startsWith('/v1/')) {
      request.principal = await options.auth(request.headers.authorization);
      limits.principal(request.principal.tenantId, request.principal.sub);
    }
  });
  app.options('/*', { config: { rateLimit: false } }, async (_request, reply) =>
    reply.code(204).send(),
  );
  app.setErrorHandler((error, request, reply) => {
    const known = error instanceof AppError;
    const candidate = (error as { statusCode?: unknown }).statusCode;
    let status = 500;
    if (known) {
      status = error.statusCode;
    } else if (
      typeof candidate === 'number' &&
      Number.isInteger(candidate) &&
      candidate >= 400 &&
      candidate < 500
    ) {
      status = candidate;
    }
    if (status === 429 && !reply.hasHeader('retry-after'))
      reply.header('retry-after', limits.retryAfterSeconds);
    if (status >= 500) request.log.error({ requestId: request.id }, 'Gateway request failed');
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
  app.get('/health', { config: { rateLimit: false } }, async () => ({
    service: 'api-gateway',
    status: 'alive',
  }));
  const probe = readinessProbe(options.upstreams, options.fetcher);
  app.get('/ready', { config: { rateLimit: false } }, async (_request, reply) => {
    const dependencies = await probe();
    const ready = Object.values(dependencies).every(Boolean);
    return reply
      .code(ready ? 200 : 503)
      .send({ service: 'api-gateway', status: ready ? 'ready' : 'degraded', dependencies });
  });
  registerRoutes(app, options.upstreams, options.fetcher);
  return app;
}

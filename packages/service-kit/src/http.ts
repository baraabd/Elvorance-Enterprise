import rateLimit from '@fastify/rate-limit';
import Fastify, { LogController, type FastifyInstance, type FastifyRequest } from 'fastify';
import type { Principal } from '@elvorance/contracts';
import { type AuthVerifier } from './auth.ts';
import { AppError, assert } from './errors.ts';
import type { Repository, Transaction } from './repository.ts';
import { text } from './validation.ts';
import { requireRoutePermission, routeRoles } from './route-policy.ts';
import { registerSecurityAudit, type AuditObserver } from './security-audit.ts';
declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal;
  }
}
export interface AppOptions {
  repository: Repository;
  auth: AuthVerifier;
  logger?: boolean;
  auditObserver?: AuditObserver;
  brokerReady?: () => boolean;
}
export function createService(name: string, options: AppOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger
      ? { redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'] }
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
  registerSecurityAudit(app, name, options.auditObserver);
  app.addHook('onRoute', (route) => {
    if (!route.url.startsWith('/v1/')) return;
    for (const method of [route.method].flat()) routeRoles(name, method, route.url);
  });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    reply.header('x-content-type-options', 'nosniff');
  });
  app.addHook('preParsing', async (request) => {
    const path = request.routeOptions.url;
    if (path?.startsWith('/v1/') || request.url.startsWith('/v1/')) {
      request.principal = await options.auth(request.headers.authorization);
      if (path) requireRoutePermission(name, request.method, path, request.principal);
    }
  });
  app.setErrorHandler((error, request, reply) => {
    const known = error instanceof AppError;
    const upstreamStatus =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? error.statusCode
        : undefined;
    const status = known
      ? error.statusCode
      : typeof upstreamStatus === 'number' &&
          Number.isInteger(upstreamStatus) &&
          upstreamStatus >= 400 &&
          upstreamStatus < 500
        ? upstreamStatus
        : 500;
    if (status >= 500) request.log.error({ requestId: request.id }, 'Request failed');
    reply.code(status).send({
      error: {
        code: known ? error.code : status >= 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
        message: known
          ? error.message
          : status >= 500
            ? 'The service could not process this request'
            : 'Invalid request',
        requestId: request.id,
      },
    });
  });
  app.get('/health', { config: { rateLimit: false } }, async () => ({
    service: name,
    status: 'alive',
  }));
  app.get('/ready', { config: { rateLimit: false } }, async (_request, reply) => {
    try {
      await options.repository.ping();
      const broker = options.brokerReady?.();
      if (broker === false)
        return reply
          .code(503)
          .send({ service: name, status: 'degraded', database: 'ready', broker: 'unavailable' });
      return {
        service: name,
        status: 'ready',
        database: 'ready',
        broker: broker == null ? 'not-configured' : 'ready',
      };
    } catch {
      return reply
        .code(503)
        .send({ service: name, status: 'unavailable', database: 'unavailable' });
    }
  });
  return app;
}
export function routeId(request: FastifyRequest, name = 'id'): string {
  const params = request.params as Record<string, unknown>;
  return text(params[name], name, 1, 100);
}
export async function command<T>(
  request: FastifyRequest,
  repository: Repository,
  operation: string,
  action: (tx: Transaction) => Promise<T>,
  authorizeResult?: (tx: Transaction, result: T) => Promise<void>,
): Promise<T> {
  const key = text(request.headers['idempotency-key'], 'Idempotency-Key', 8, 160);
  assert(
    !Array.isArray(request.headers['idempotency-key']),
    'INVALID_IDEMPOTENCY_KEY',
    'A single Idempotency-Key is required',
  );
  return repository.transaction(request.principal.tenantId, async (tx) => {
    const principal = { ...request.principal, roles: [...request.principal.roles].sort() };
    const result = await tx.idempotent(
      principal.sub,
      key,
      operation,
      { principal, params: request.params, body: request.body },
      () => action(tx),
    );
    // Run resource authorization even for a cached command; assignment may have changed after the first response.
    await authorizeResult?.(tx, result);
    return result;
  });
}
export async function listen(
  app: FastifyInstance,
  repository?: Repository,
  closeWorker?: () => Promise<void>,
): Promise<void> {
  const port = Number(process.env.PORT);
  assert(
    Number.isInteger(port) && port > 0 && port <= 65535,
    'CONFIGURATION',
    'PORT must be a valid TCP port',
    500,
  );
  await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });
  let closing = false;
  const stop = async (): Promise<void> => {
    if (closing) return;
    closing = true;
    await app.close();
    await closeWorker?.();
    await repository?.close();
  };
  process.once('SIGTERM', () => {
    void stop();
  });
  process.once('SIGINT', () => {
    void stop();
  });
}

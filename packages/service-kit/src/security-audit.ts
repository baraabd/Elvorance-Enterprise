import type { FastifyInstance } from 'fastify';

export interface SecurityAuditEvent {
  readonly schemaVersion: 1;
  readonly occurredAt: string;
  readonly service: string;
  readonly requestId: string;
  readonly method: string;
  readonly route: string;
  readonly statusCode: number;
  readonly outcome: 'allowed' | 'denied' | 'failed';
  readonly actorId: string | null;
  readonly tenantId: string | null;
}
export type AuditObserver = (event: SecurityAuditEvent) => void;

/** Structured operational audit. No raw URL, query, body, token, cookie or resource contents. */
export function registerSecurityAudit(
  app: FastifyInstance,
  service: string,
  observer?: AuditObserver,
): void {
  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url;
    if (!route?.startsWith('/v1/') && !request.url.startsWith('/v1/')) return;
    const event: SecurityAuditEvent = Object.freeze({
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      service,
      requestId: request.id,
      method: request.method,
      route: route ?? 'unmatched',
      statusCode: reply.statusCode,
      outcome: reply.statusCode >= 500 ? 'failed' : reply.statusCode >= 400 ? 'denied' : 'allowed',
      actorId: request.principal?.sub ?? null,
      tenantId: request.principal?.tenantId ?? null,
    });
    request.log.info({ audit: event }, 'security.audit');
    try {
      observer?.(event);
    } catch {
      request.log.error({ requestId: request.id }, 'security.audit_observer_failed');
    }
  });
}

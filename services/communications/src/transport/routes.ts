import type { FastifyInstance } from 'fastify';
import {
  actorScopes,
  command,
  pageOptions,
  routeId,
  type Repository,
} from '@elvorance/service-kit';
import {
  createTicket,
  readNotification,
  replyTicket,
  statusTicket,
  ticket,
  visible,
} from '../application/tickets.ts';
import type { Notification, Ticket } from '../domain/model.ts';
export function registerRoutes(app: FastifyInstance, repository: Repository): void {
  app.get('/v1/notifications', async (request) =>
    repository.transaction(request.principal.tenantId, async (tx) => ({
      ...(await tx.page<Notification>(
        'notifications',
        pageOptions(request.query, actorScopes(request.principal, ['admin', 'support'])),
      )),
      delivery: 'in-app-only',
    })),
  );
  app.post('/v1/notifications/:id/read', async (request) =>
    command(request, repository, 'communications.readNotification', (tx) =>
      readNotification(tx, request.principal, routeId(request), request.body),
    ),
  );
  app.get('/v1/tickets', async (request) =>
    repository.transaction(request.principal.tenantId, (tx) =>
      tx.page<Ticket>(
        'tickets',
        pageOptions(request.query, actorScopes(request.principal, ['admin', 'support'])),
      ),
    ),
  );
  app.get('/v1/tickets/:id', async (request) =>
    repository.transaction(request.principal.tenantId, (tx) =>
      ticket(tx, request.principal, routeId(request)),
    ),
  );
  app.post('/v1/tickets', async (request) =>
    command(request, repository, 'communications.createTicket', (tx) =>
      createTicket(tx, request.principal, request.body),
    ),
  );
  app.post('/v1/tickets/:id/replies', async (request) =>
    command(request, repository, 'communications.replyTicket', (tx) =>
      replyTicket(tx, request.principal, routeId(request), request.body),
    ),
  );
  app.post('/v1/tickets/:id/status', async (request) =>
    command(request, repository, 'communications.statusTicket', (tx) =>
      statusTicket(tx, request.principal, routeId(request), request.body),
    ),
  );
}

import type { FastifyInstance } from 'fastify';
import { command, requireRole, routeId, type Repository } from '@atlas/service-kit';
import { viewSession, type TrackingSession } from '../domain/model.ts';
import { changeState, createSession, getSession, recordPoint } from '../application/sessions.ts';
export function registerRoutes(app: FastifyInstance, repository: Repository): void {
  app.post('/v1/sessions', async (request) =>
    command(request, repository, 'tracking.createSession', (tx) =>
      createSession(tx, request.principal, request.body),
    ),
  );
  app.get('/v1/sessions/current', async (request) => {
    requireRole(request.principal, 'rep');
    return repository.transaction(request.principal.tenantId, async (tx) => ({
      items: (
        await tx.list<TrackingSession>('tracking_sessions', { repId: request.principal.repId! })
      )
        .filter((value) => value.status !== 'stopped')
        .map((value) => viewSession(value)),
    }));
  });
  app.get('/v1/sessions/:id', async (request) =>
    repository.transaction(request.principal.tenantId, async (tx) =>
      viewSession(await getSession(tx, request.principal, routeId(request))),
    ),
  );
  app.post('/v1/sessions/:id/points', async (request) =>
    command(request, repository, 'tracking.recordPoint', (tx) =>
      recordPoint(tx, request.principal, routeId(request), request.body),
    ),
  );
  app.post('/v1/sessions/:id/state', async (request) =>
    command(request, repository, 'tracking.changeState', (tx) =>
      changeState(tx, request.principal, routeId(request), request.body),
    ),
  );
  app.get('/v1/latest', async (request) => {
    requireRole(request.principal, 'admin');
    return repository.transaction(request.principal.tenantId, async (tx) => ({
      serverNow: new Date().toISOString(),
      items: (await tx.list<TrackingSession>('tracking_sessions')).map((value) =>
        viewSession(value),
      ),
      retention: 'Latest point only; stopped sessions contain no coordinates',
    }));
  });
}

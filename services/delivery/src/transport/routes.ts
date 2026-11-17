import type { FastifyInstance } from 'fastify';
import { command, isOwner, routeId, type Repository } from '@elvorance/service-kit';
import type { Project } from '../domain/model.ts';
import {
  addDeliverable,
  addMilestone,
  completeProject,
  project,
  reviewDeliverable,
  reviseDeliverable,
  updateMilestone,
} from '../application/projects.ts';
export function registerRoutes(app: FastifyInstance, repository: Repository): void {
  app.get('/v1/projects', async (request) =>
    repository.transaction(request.principal.tenantId, async (tx) => ({
      items: (await tx.list<Project>('projects')).filter((value) =>
        isOwner(request.principal, value, ['admin', 'delivery']),
      ),
    })),
  );
  app.get('/v1/projects/:id', async (request) =>
    repository.transaction(request.principal.tenantId, (tx) =>
      project(tx, request.principal, routeId(request)),
    ),
  );
  app.post('/v1/projects/:id/milestones', async (request) =>
    command(request, repository, 'delivery.addMilestone', (tx) =>
      addMilestone(tx, request.principal, routeId(request), request.body),
    ),
  );
  app.post('/v1/projects/:id/milestones/:milestoneId', async (request) =>
    command(request, repository, 'delivery.updateMilestone', (tx) =>
      updateMilestone(
        tx,
        request.principal,
        routeId(request),
        routeId(request, 'milestoneId'),
        request.body,
      ),
    ),
  );
  app.post('/v1/projects/:id/deliverables', async (request) =>
    command(request, repository, 'delivery.addDeliverable', (tx) =>
      addDeliverable(tx, request.principal, routeId(request), request.body),
    ),
  );
  app.post('/v1/projects/:id/deliverables/:deliverableId/revise', async (request) =>
    command(request, repository, 'delivery.reviseDeliverable', (tx) =>
      reviseDeliverable(
        tx,
        request.principal,
        routeId(request),
        routeId(request, 'deliverableId'),
        request.body,
      ),
    ),
  );
  app.post('/v1/projects/:id/deliverables/:deliverableId/review', async (request) =>
    command(request, repository, 'delivery.reviewDeliverable', (tx) =>
      reviewDeliverable(
        tx,
        request.principal,
        routeId(request),
        routeId(request, 'deliverableId'),
        request.body,
      ),
    ),
  );
  app.post('/v1/projects/:id/complete', async (request) =>
    command(request, repository, 'delivery.completeProject', (tx) =>
      completeProject(tx, request.principal, routeId(request), request.body),
    ),
  );
}

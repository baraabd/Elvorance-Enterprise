import type { FastifyInstance } from 'fastify';
import type { CustomerDirectory, Opportunity, RepTask } from '@elvorance/contracts';
import { command, routeId, type Repository } from '@elvorance/service-kit';
import { authorizeOwned, ownedRecord, ownedRecords } from '../application/assignment.ts';
import { createTask, updateTask } from '../application/tasks.ts';
import { createOpportunity, updateOpportunity } from '../application/opportunities.ts';
import {
  authorizeRoute,
  createRoute,
  getRoute,
  listRoutes,
  updateRoute,
} from '../application/routes.ts';

export function registerRepWorkRoutes(
  app: FastifyInstance,
  repository: Repository,
  directory: CustomerDirectory,
): void {
  for (const domain of [
    { path: 'tasks', table: 'tasks', create: createTask, update: updateTask },
    {
      path: 'opportunities',
      table: 'opportunities',
      create: createOpportunity,
      update: updateOpportunity,
    },
  ]) {
    app.get(`/v1/${domain.path}`, async (request) =>
      repository.transaction(request.principal.tenantId, (tx) =>
        ownedRecords<RepTask | Opportunity>(
          tx,
          domain.table,
          request.principal,
          directory,
          request.headers.authorization!,
          request.query,
        ),
      ),
    );
    app.get(`/v1/${domain.path}/:id`, async (request) =>
      repository.transaction(request.principal.tenantId, (tx) =>
        ownedRecord<RepTask | Opportunity>(
          tx,
          domain.table,
          routeId(request),
          request.principal,
          directory,
          request.headers.authorization!,
        ),
      ),
    );
    app.post(`/v1/${domain.path}`, async (request) =>
      command<RepTask | Opportunity>(
        request,
        repository,
        `sales.create.${domain.path}`,
        (tx) =>
          domain.create(
            tx,
            request.principal,
            request.body,
            directory,
            request.headers.authorization!,
          ),
        async (_tx, result) =>
          authorizeOwned(request.principal, result, directory, request.headers.authorization!),
      ),
    );
    app.patch(`/v1/${domain.path}/:id`, async (request) =>
      command<RepTask | Opportunity>(
        request,
        repository,
        `sales.update.${domain.path}`,
        (tx) =>
          domain.update(
            tx,
            request.principal,
            routeId(request),
            request.body,
            directory,
            request.headers.authorization!,
          ),
        async (_tx, result) =>
          authorizeOwned(request.principal, result, directory, request.headers.authorization!),
      ),
    );
  }
  app.get('/v1/routes', async (request) =>
    repository.transaction(request.principal.tenantId, (tx) =>
      listRoutes(tx, request.principal, request.query),
    ),
  );
  app.get('/v1/routes/:id', async (request) =>
    repository.transaction(request.principal.tenantId, (tx) =>
      getRoute(tx, request.principal, routeId(request), directory, request.headers.authorization!),
    ),
  );
  app.post('/v1/routes', async (request) =>
    command(
      request,
      repository,
      'sales.createRoute',
      (tx) =>
        createRoute(tx, request.principal, request.body, directory, request.headers.authorization!),
      async (tx, result) => {
        await authorizeRoute(
          tx,
          request.principal,
          result,
          directory,
          request.headers.authorization!,
        );
      },
    ),
  );
  app.patch('/v1/routes/:id', async (request) =>
    command(
      request,
      repository,
      'sales.updateRoute',
      (tx) =>
        updateRoute(
          tx,
          request.principal,
          routeId(request),
          request.body,
          directory,
          request.headers.authorization!,
        ),
      async (tx, result) => {
        await authorizeRoute(
          tx,
          request.principal,
          result,
          directory,
          request.headers.authorization!,
        );
      },
    ),
  );
}

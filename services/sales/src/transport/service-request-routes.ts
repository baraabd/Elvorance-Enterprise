import type { FastifyInstance } from 'fastify';
import { command, routeId, type Repository } from '@elvorance/service-kit';
import type { CustomerDirectory } from '../application/ports.ts';
import {
  cancelServiceRequest,
  createServiceRequest,
  listServiceRequests,
  reviewServiceRequest,
  serviceRequest,
} from '../application/service-requests.ts';
export function registerServiceRequestRoutes(
  app: FastifyInstance,
  repository: Repository,
  directory: CustomerDirectory,
): void {
  app.get('/v1/service-requests', async (request) =>
    repository.transaction(request.principal.tenantId, (tx) =>
      listServiceRequests(
        tx,
        request.principal,
        request.query,
        directory,
        request.headers.authorization ?? '',
      ),
    ),
  );
  app.get('/v1/service-requests/:id', async (request) =>
    repository.transaction(request.principal.tenantId, (tx) =>
      serviceRequest(
        tx,
        request.principal,
        routeId(request),
        directory,
        request.headers.authorization ?? '',
      ),
    ),
  );
  app.post('/v1/service-requests', async (request) =>
    command(
      request,
      repository,
      'sales.createServiceRequest',
      (tx) =>
        createServiceRequest(
          tx,
          request.principal,
          request.body,
          directory,
          request.headers.authorization ?? '',
        ),
      async (tx, result) => {
        await serviceRequest(
          tx,
          request.principal,
          result.id,
          directory,
          request.headers.authorization ?? '',
        );
      },
    ),
  );
  app.post('/v1/service-requests/:id/review', async (request) =>
    command(
      request,
      repository,
      'sales.reviewServiceRequest',
      (tx) =>
        reviewServiceRequest(
          tx,
          request.principal,
          routeId(request),
          request.body,
          directory,
          request.headers.authorization ?? '',
        ),
      async (tx, result) => {
        await serviceRequest(
          tx,
          request.principal,
          result.id,
          directory,
          request.headers.authorization ?? '',
        );
      },
    ),
  );
  app.post('/v1/service-requests/:id/cancel', async (request) =>
    command(
      request,
      repository,
      'sales.cancelServiceRequest',
      (tx) =>
        cancelServiceRequest(
          tx,
          request.principal,
          routeId(request),
          request.body,
          directory,
          request.headers.authorization ?? '',
        ),
      async (tx, result) => {
        await serviceRequest(
          tx,
          request.principal,
          result.id,
          directory,
          request.headers.authorization ?? '',
        );
      },
    ),
  );
}

import type { FastifyInstance } from 'fastify';
import { command, routeId, type Repository } from '@elvorance/service-kit';
import { readCatalog, readDiscovery, saveDiscovery } from '../application/discovery.ts';
import { customer } from '../application/customers.ts';
export function registerDiscoveryRoutes(app: FastifyInstance, repository: Repository): void {
  app.get('/v1/catalog', async (request) =>
    repository.transaction(request.principal.tenantId, readCatalog),
  );
  app.get('/v1/customers/:id/discovery', async (request) =>
    repository.transaction(request.principal.tenantId, (tx) =>
      readDiscovery(tx, request.principal, routeId(request)),
    ),
  );
  app.put('/v1/customers/:id/discovery', async (request) =>
    command(
      request,
      repository,
      'crm.saveDiscovery',
      (tx) => saveDiscovery(tx, request.principal, routeId(request), request.body),
      async (tx, result) => {
        await customer(tx, request.principal, result.clientId);
      },
    ),
  );
}

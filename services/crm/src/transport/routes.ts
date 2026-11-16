import type { FastifyInstance } from 'fastify';
import { command, isOwner, routeId, type Repository } from '@atlas/service-kit';
import {
  createCustomer,
  createRegion,
  customer,
  customerContext,
  updateCustomer,
} from '../application/customers.ts';
import type { Customer, Region } from '../domain/model.ts';
import { readConfiguration, publishConfiguration } from '../application/configuration.ts';
export function registerRoutes(app: FastifyInstance, repository: Repository): void {
  // Readable by authenticated tenant members; mutations are admin-only and version checked.
  app.get('/v1/configuration', async (request) =>
    repository.transaction(request.principal.tenantId, (tx) => readConfiguration(tx)),
  );
  app.put('/v1/configuration', async (request) =>
    command(request, repository, 'crm.publishConfiguration', (tx) =>
      publishConfiguration(tx,request.principal,request.body)),
  );
  app.get('/v1/customers', async (request) =>
    repository.transaction(request.principal.tenantId, async (tx) => ({
      items: (await tx.list<Customer>('customers')).filter((value) =>
        isOwner(request.principal, { clientId: value.id, repId: value.repId }, [
          'admin',
          'support',
          'finance',
          'delivery',
        ]),
      ),
    })),
  );
  app.get('/v1/customers/:id', async (request) =>
    repository.transaction(request.principal.tenantId, (tx) =>
      customer(tx, request.principal, routeId(request)),
    ),
  );
  app.get('/v1/customers/:id/context', async (request) =>
    repository.transaction(request.principal.tenantId, async (tx) =>
      customerContext(await customer(tx, request.principal, routeId(request))),
    ),
  );
  app.post('/v1/customers', async (request) =>
    command(
      request,
      repository,
      'crm.createCustomer',
      (tx) => createCustomer(tx, request.principal, request.body),
      async (tx, result) => {
        await customer(tx, request.principal, result.id);
      },
    ),
  );
  app.patch('/v1/customers/:id', async (request) =>
    command(
      request,
      repository,
      'crm.updateCustomer',
      (tx) => updateCustomer(tx, request.principal, routeId(request), request.body),
      async (tx, result) => {
        await customer(tx, request.principal, result.id);
      },
    ),
  );
  app.get('/v1/regions', async (request) =>
    repository.transaction(request.principal.tenantId, async (tx) => ({
      items: await tx.list<Region>('regions'),
    })),
  );
  app.post('/v1/regions', async (request) =>
    command(request, repository, 'crm.createRegion', (tx) =>
      createRegion(tx, request.principal, request.body),
    ),
  );
}

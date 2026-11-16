import type { FastifyInstance } from 'fastify';
import {
  command,
  hasRole,
  isOwner,
  notFound,
  requireOwner,
  requireRole,
  routeId,
  type Repository,
} from '@atlas/service-kit';
import type { Contract, Fulfillment, Quote, Visit } from '../domain/model.ts';
import type { CustomerDirectory } from '../application/ports.ts';
import { completeVisit, createVisit, startVisit, visit } from '../application/visits.ts';
import {
  approveContract,
  authorizeQuoteAssignment,
  canReadQuote,
  contract,
  createQuote,
  quote,
  respondQuote,
  reviseQuote,
  sendQuote,
  updateQuote,
} from '../application/quotes.ts';
export function registerRoutes(
  app: FastifyInstance,
  repository: Repository,
  directory: CustomerDirectory,
): void {
  app.get('/v1/visits', async (request) => {
    requireRole(request.principal, 'rep', 'admin');
    return repository.transaction(request.principal.tenantId, async (tx) => ({
      items: (await tx.list<Visit>('visits')).filter(
        (value) => hasRole(request.principal, 'admin') || value.repId === request.principal.repId,
      ),
    }));
  });
  app.get('/v1/visits/:id', async (request) => {
    requireRole(request.principal, 'rep', 'admin');
    return repository.transaction(request.principal.tenantId, (tx) =>
      visit(tx, request.principal, routeId(request)),
    );
  });
  app.post('/v1/visits', async (request) =>
    command(request, repository, 'sales.createVisit', (tx) =>
      createVisit(tx, request.principal, request.body, directory, request.headers.authorization!),
    ),
  );
  app.post('/v1/visits/:id/start', async (request) =>
    command(request, repository, 'sales.startVisit', (tx) =>
      startVisit(
        tx,
        request.principal,
        routeId(request),
        request.body,
        directory,
        request.headers.authorization!,
      ),
    ),
  );
  app.post('/v1/visits/:id/complete', async (request) =>
    command(request, repository, 'sales.completeVisit', (tx) =>
      completeVisit(
        tx,
        request.principal,
        routeId(request),
        request.body,
        directory,
        request.headers.authorization!,
      ),
    ),
  );
  app.get('/v1/quotes', async (request) =>
    repository.transaction(request.principal.tenantId, async (tx) => ({
      items: (await tx.list<Quote>('quotes')).filter((value) =>
        canReadQuote(request.principal, value),
      ),
    })),
  );
  app.get('/v1/quotes/:id', async (request) =>
    repository.transaction(request.principal.tenantId, (tx) =>
      quote(tx, request.principal, routeId(request)),
    ),
  );
  app.post('/v1/quotes', async (request) =>
    command(
      request,
      repository,
      'sales.createQuote',
      (tx) =>
        createQuote(tx, request.principal, request.body, directory, request.headers.authorization!),
      async (_tx, result) =>
        authorizeQuoteAssignment(
          request.principal,
          result,
          directory,
          request.headers.authorization!,
        ),
    ),
  );
  app.patch('/v1/quotes/:id', async (request) =>
    command(
      request,
      repository,
      'sales.updateQuote',
      (tx) =>
        updateQuote(
          tx,
          request.principal,
          routeId(request),
          request.body,
          directory,
          request.headers.authorization!,
        ),
      async (_tx, result) =>
        authorizeQuoteAssignment(
          request.principal,
          result,
          directory,
          request.headers.authorization!,
        ),
    ),
  );
  app.post('/v1/quotes/:id/revise', async (request) =>
    command(
      request,
      repository,
      'sales.reviseQuote',
      (tx) =>
        reviseQuote(
          tx,
          request.principal,
          routeId(request),
          request.body,
          directory,
          request.headers.authorization!,
        ),
      async (_tx, result) =>
        authorizeQuoteAssignment(
          request.principal,
          result,
          directory,
          request.headers.authorization!,
        ),
    ),
  );
  app.post('/v1/quotes/:id/send', async (request) =>
    command(
      request,
      repository,
      'sales.sendQuote',
      (tx) =>
        sendQuote(
          tx,
          request.principal,
          routeId(request),
          request.body,
          directory,
          request.headers.authorization!,
        ),
      async (_tx, result) =>
        authorizeQuoteAssignment(
          request.principal,
          result,
          directory,
          request.headers.authorization!,
        ),
    ),
  );
  for (const response of ['accept', 'reject', 'request-changes'] as const)
    app.post(`/v1/quotes/:id/${response}`, async (request) =>
      command(request, repository, `sales.${response}Quote`, (tx) =>
        respondQuote(tx, request.principal, routeId(request), request.body, response),
      ),
    );
  app.get('/v1/contracts', async (request) =>
    repository.transaction(request.principal.tenantId, async (tx) => ({
      items: (await tx.list<Contract>('contracts')).filter((value) =>
        isOwner(request.principal, value, ['admin', 'finance', 'delivery']),
      ),
    })),
  );
  app.get('/v1/contracts/:id', async (request) =>
    repository.transaction(request.principal.tenantId, (tx) =>
      contract(tx, request.principal, routeId(request)),
    ),
  );
  app.post('/v1/contracts/:id/approve', async (request) =>
    command(request, repository, 'sales.approveContract', (tx) =>
      approveContract(tx, request.principal, routeId(request), request.body),
    ),
  );
  app.get('/v1/contracts/:id/fulfillment', async (request) =>
    repository.transaction(request.principal.tenantId, async (tx) => {
      const value =
        (await tx.get<Fulfillment>('fulfillments', routeId(request))) ?? notFound('Fulfillment');
      requireOwner(request.principal, value, ['admin', 'finance', 'delivery']);
      return {
        ...value,
        status:
          value.projectStatus === 'ready' && value.invoicesStatus === 'ready' ? 'ready' : 'pending',
        consistency: 'eventual',
      };
    }),
  );
}

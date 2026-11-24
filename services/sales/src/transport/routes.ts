import type { FastifyInstance } from 'fastify';
import {
  command,
  actorScopes,
  pageOptions,
  assert,
  notFound,
  requireOwner,
  requireRole,
  routeId,
  type Repository,
} from '@elvorance/service-kit';
import type { Contract, Fulfillment, Quote, Visit } from '../domain/model.ts';
import type { CustomerDirectory } from '../application/ports.ts';
import { completeVisit, createVisit, startVisit } from '../application/visits.ts';
import {
  approveContract,
  authorizeQuoteAssignment,
  contract,
  createQuote,
  quote,
  respondQuote,
  reviseQuote,
  sendQuote,
  updateQuote,
} from '../application/quotes.ts';
import { registerServiceRequestRoutes } from './service-request-routes.ts';
import { registerRepWorkRoutes } from './rep-work-routes.ts';
import { registerDiscountRoutes } from './discount-routes.ts';
import { cancelVisit, updateVisit } from '../application/visit-planning.ts';
import {
  authorizeOwned,
  filterCurrentAssignments,
  ownedRecords,
  ownedRecord,
} from '../application/assignment.ts';
export function registerRoutes(
  app: FastifyInstance,
  repository: Repository,
  directory: CustomerDirectory,
): void {
  registerServiceRequestRoutes(app, repository, directory);
  registerRepWorkRoutes(app, repository, directory);
  registerDiscountRoutes(app, repository, directory);
  app.get('/v1/visits', async (request) => {
    requireRole(request.principal, 'rep', 'admin');
    return repository.transaction(request.principal.tenantId, (tx) =>
      ownedRecords<Visit>(
        tx,
        'visits',
        request.principal,
        directory,
        request.headers.authorization!,
        request.query,
      ),
    );
  });
  app.get('/v1/visits/:id', async (request) => {
    requireRole(request.principal, 'rep', 'admin');
    return repository.transaction(request.principal.tenantId, (tx) =>
      ownedRecord<Visit>(
        tx,
        'visits',
        routeId(request),
        request.principal,
        directory,
        request.headers.authorization!,
      ),
    );
  });
  app.post('/v1/visits', async (request) =>
    command(
      request,
      repository,
      'sales.createVisit',
      (tx) =>
        createVisit(tx, request.principal, request.body, directory, request.headers.authorization!),
      async (_tx, result) =>
        authorizeOwned(request.principal, result, directory, request.headers.authorization!),
    ),
  );
  app.post('/v1/visits/:id/start', async (request) =>
    command(
      request,
      repository,
      'sales.startVisit',
      (tx) =>
        startVisit(
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
  app.post('/v1/visits/:id/complete', async (request) =>
    command(
      request,
      repository,
      'sales.completeVisit',
      (tx) =>
        completeVisit(
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
  app.patch('/v1/visits/:id', async (request) =>
    command(
      request,
      repository,
      'sales.updateVisit',
      (tx) =>
        updateVisit(
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
  app.post('/v1/visits/:id/cancel', async (request) =>
    command(
      request,
      repository,
      'sales.cancelVisit',
      (tx) =>
        cancelVisit(
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
  app.get('/v1/quotes', async (request) =>
    repository.transaction(request.principal.tenantId, async (tx) => {
      const scopes = actorScopes(request.principal).map((scope) =>
        scope.equals.clientId ? { ...scope, notEquals: { status: 'draft' } } : scope,
      );
      const page = await tx.page<Quote>('quotes', pageOptions(request.query, scopes));
      return {
        ...page,
        items: await filterCurrentAssignments(
          page.items,
          request.principal,
          directory,
          request.headers.authorization!,
        ),
      };
    }),
  );
  app.get('/v1/quotes/:id', async (request) =>
    repository.transaction(request.principal.tenantId, async (tx) => {
      const value = await quote(tx, request.principal, routeId(request));
      assert(
        (
          await filterCurrentAssignments(
            [value],
            request.principal,
            directory,
            request.headers.authorization!,
          )
        ).length,
        'NOT_FOUND',
        'Quote was not found',
        404,
      );
      return value;
    }),
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
    repository.transaction(request.principal.tenantId, (tx) =>
      tx.page<Contract>(
        'contracts',
        pageOptions(
          request.query,
          actorScopes(request.principal, ['admin', 'finance', 'delivery']),
        ),
      ),
    ),
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

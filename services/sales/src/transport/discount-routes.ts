import type { FastifyInstance } from 'fastify';
import type { CustomerDirectory } from '@elvorance/contracts';
import { command, routeId, type Repository } from '@elvorance/service-kit';
import type { DiscountApproval } from '../domain/model.ts';
import { authorizeOwned, ownedRecords } from '../application/assignment.ts';
import { decideDiscountApproval, requestDiscountApproval } from '../application/discounts.ts';
export function registerDiscountRoutes(
  app: FastifyInstance,
  repository: Repository,
  directory: CustomerDirectory,
): void {
  app.get('/v1/quote-discount-approvals', async (request) =>
    repository.transaction(request.principal.tenantId, (tx) =>
      ownedRecords<DiscountApproval>(
        tx,
        'discount_approvals',
        request.principal,
        directory,
        request.headers.authorization!,
        request.query,
      ),
    ),
  );
  app.post('/v1/quotes/:id/discount-approval', async (request) =>
    command(
      request,
      repository,
      'sales.requestDiscountApproval',
      (tx) =>
        requestDiscountApproval(
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
  app.post('/v1/quote-discount-approvals/:id/decision', async (request) =>
    command(request, repository, 'sales.decideDiscountApproval', (tx) =>
      decideDiscountApproval(tx, request.principal, routeId(request), request.body),
    ),
  );
}

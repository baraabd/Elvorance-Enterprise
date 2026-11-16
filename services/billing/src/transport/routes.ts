import type { FastifyInstance } from 'fastify';
import {
  command,
  isOwner,
  notFound,
  requireOwner,
  routeId,
  type Repository,
} from '@atlas/service-kit';
import type { ContractAccount, Invoice, Payment } from '../domain/model.ts';
import { invoice, recordPayment } from '../application/payments.ts';
export function registerRoutes(app: FastifyInstance, repository: Repository): void {
  app.get('/v1/invoices', async (request) =>
    repository.transaction(request.principal.tenantId, async (tx) => ({
      items: (await tx.list<Invoice>('invoices')).filter((value) =>
        isOwner(request.principal, value, ['admin', 'finance']),
      ),
    })),
  );
  app.get('/v1/invoices/:id', async (request) =>
    repository.transaction(request.principal.tenantId, (tx) =>
      invoice(tx, request.principal, routeId(request)),
    ),
  );
  app.get('/v1/invoices/:id/payments', async (request) =>
    repository.transaction(request.principal.tenantId, async (tx) => {
      const value = await invoice(tx, request.principal, routeId(request));
      return { items: await tx.list<Payment>('payments', { invoiceId: value.id }) };
    }),
  );
  app.post('/v1/invoices/:id/payments', async (request) =>
    command(request, repository, 'billing.recordPayment', (tx) =>
      recordPayment(tx, request.principal, routeId(request), request.body),
    ),
  );
  app.get('/v1/contracts/:id/account', async (request) =>
    repository.transaction(request.principal.tenantId, async (tx) => {
      const value =
        (await tx.get<ContractAccount>('contract_accounts', routeId(request))) ??
        notFound('Contract account');
      requireOwner(request.principal, value, ['admin', 'finance']);
      return value;
    }),
  );
}

import type { Entity, Principal } from '@elvorance/contracts';
import {
  actorScopes,
  assert,
  dateOnly,
  hasRole,
  integer,
  notFound,
  now,
  object,
  oneOf,
  pageOptions,
  requireOwner,
  requireRole,
  text,
  version,
  type Transaction,
} from '@elvorance/service-kit';
import type { CustomerDirectory } from './ports.ts';
import { currentCustomer, filterCurrentAssignments } from './assignment.ts';
import { createOpportunity } from './opportunities.ts';

export interface ServiceRequest extends Entity {
  clientId: string;
  repId: string;
  customerName: string;
  serviceId: string;
  serviceTitle: string;
  catalogVersion: number;
  currency: string;
  title: string;
  brief: string;
  budgetMinor: number;
  deadline: string | null;
  status: 'submitted' | 'in_review' | 'accepted' | 'declined' | 'cancelled';
  reviewNote: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  opportunityId: string | null;
  cancelledAt: string | null;
}
function fields(body: Record<string, unknown>, allowed: readonly string[]): void {
  assert(
    Object.keys(body).every((key) => allowed.includes(key)),
    'UNKNOWN_FIELD',
    'Request contains an unsupported or server-owned field',
  );
}
export async function serviceRequest(
  tx: Transaction,
  principal: Principal,
  id: string,
  directory: CustomerDirectory,
  authorization: string,
): Promise<ServiceRequest> {
  requireRole(principal, 'admin', 'rep', 'client');
  const value =
    (await tx.get<ServiceRequest>('service_requests', id)) ?? notFound('Service request');
  requireOwner(principal, value);
  if (
    !hasRole(principal, 'admin') &&
    !(hasRole(principal, 'client') && principal.clientId === value.clientId)
  )
    await currentCustomer(principal, value.clientId, directory, authorization, value.repId);
  return value;
}
export async function listServiceRequests(
  tx: Transaction,
  principal: Principal,
  query: unknown,
  directory: CustomerDirectory,
  authorization: string,
) {
  requireRole(principal, 'admin', 'rep', 'client');
  const page = await tx.page<ServiceRequest>(
    'service_requests',
    pageOptions(query, actorScopes(principal)),
  );
  return {
    ...page,
    items: await filterCurrentAssignments(page.items, principal, directory, authorization),
  };
}
export async function createServiceRequest(
  tx: Transaction,
  principal: Principal,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
): Promise<ServiceRequest> {
  requireRole(principal, 'client');
  assert(principal.clientId, 'CLIENT_REQUIRED', 'A linked customer identity is required', 403);
  const body = object(input);
  fields(body, [
    'serviceId',
    'catalogVersion',
    'currency',
    'title',
    'brief',
    'budgetMinor',
    'deadline',
  ]);
  const customer = await directory.getCustomer(principal.clientId, authorization);
  assert(customer.id === principal.clientId, 'NOT_FOUND', 'Customer was not found', 404);
  const catalog = await directory.getCatalog(authorization);
  assert(
    catalog.configured,
    'CATALOG_UNAVAILABLE',
    'The tenant has not published its catalog',
    409,
  );
  assert(
    integer(body.catalogVersion, 'catalogVersion', 1) === catalog.recordVersion,
    'CATALOG_VERSION',
    'Refresh the catalog before submitting the request',
    409,
  );
  const serviceId = text(body.serviceId, 'serviceId', 1, 100);
  const item = catalog.items.find((entry) => entry.id === serviceId);
  assert(item, 'CATALOG_SERVICE', 'Service is not in the published active catalog');
  assert(
    body.currency === catalog.currency,
    'CATALOG_CURRENCY',
    'Use the published catalog currency',
  );
  const deadline = dateOnly(body.deadline, 'deadline');
  assert(
    !deadline || deadline >= now().slice(0, 10),
    'INVALID_DATE',
    'Deadline cannot be in the past',
  );
  const result = await tx.insert<ServiceRequest>('service_requests', {
    clientId: customer.id,
    repId: customer.repId,
    customerName: customer.name,
    serviceId,
    serviceTitle: item.title,
    catalogVersion: catalog.recordVersion,
    currency: catalog.currency,
    title: text(body.title, 'title', 3, 200),
    brief: text(body.brief, 'brief', 20, 3000),
    budgetMinor: integer(body.budgetMinor, 'budgetMinor', 0, 100_000_000_000),
    deadline,
    status: 'submitted',
    reviewNote: '',
    reviewedBy: null,
    reviewedAt: null,
    opportunityId: null,
    cancelledAt: null,
  });
  // Inbound interest is not permission to clear CRM's do-not-contact preference.
  await tx.emit('sales.service_request_created.v1', result.id, result.version, {
    requestId: result.id,
    clientId: result.clientId,
    repId: result.repId,
  });
  return result;
}
export async function reviewServiceRequest(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
): Promise<ServiceRequest> {
  requireRole(principal, 'rep', 'admin');
  const body = object(input);
  fields(body, ['expectedVersion', 'decision', 'note']);
  const value = await serviceRequest(tx, principal, id, directory, authorization);
  assert(
    ['submitted', 'in_review'].includes(value.status),
    'REQUEST_STATE',
    'Request is already resolved',
    409,
  );
  const customer = await currentCustomer(principal, value.clientId, directory, authorization);
  const decision = oneOf(body.decision, ['in_review', 'accepted', 'declined'] as const, 'decision');
  const reviewNote = text(body.note, 'note', 5, 3000);
  // Opportunity and request resolution commit in the same Sales-owned transaction.
  // The existing operation rechecks current CRM ownership and contact preference.
  const opportunity =
    decision === 'accepted'
      ? await createOpportunity(
          tx,
          principal,
          {
            clientId: value.clientId,
            title: value.title,
            valueMinor: value.budgetMinor,
            currency: value.currency,
            expectedCloseOn: value.deadline,
            notes: value.brief,
            stage: 'new',
          },
          directory,
          authorization,
        )
      : null;
  const result = await tx.replace<ServiceRequest>(
    'service_requests',
    {
      ...value,
      repId: customer.repId,
      status: decision,
      reviewNote,
      reviewedBy: principal.sub,
      reviewedAt: now(),
      opportunityId: opportunity?.id ?? null,
    },
    version(body),
  );
  await tx.emit('sales.service_request_updated.v1', result.id, result.version, {
    requestId: result.id,
    clientId: result.clientId,
    repId: result.repId,
    status: result.status,
  });
  return result;
}
export async function cancelServiceRequest(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
): Promise<ServiceRequest> {
  requireRole(principal, 'client');
  const body = object(input);
  fields(body, ['expectedVersion']);
  const value = await serviceRequest(tx, principal, id, directory, authorization);
  assert(value.clientId === principal.clientId, 'NOT_FOUND', 'Service request was not found', 404);
  assert(
    ['submitted', 'in_review'].includes(value.status),
    'REQUEST_STATE',
    'Only unresolved requests can be cancelled',
    409,
  );
  const result = await tx.replace<ServiceRequest>(
    'service_requests',
    { ...value, status: 'cancelled', cancelledAt: now() },
    version(body),
  );
  await tx.emit('sales.service_request_updated.v1', result.id, result.version, {
    requestId: result.id,
    clientId: result.clientId,
    repId: result.repId,
    status: result.status,
  });
  return result;
}

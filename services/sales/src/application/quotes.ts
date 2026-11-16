import type { Principal } from '@atlas/contracts';
import {
  assert,
  hasRole,
  notFound,
  now,
  object,
  optionalText,
  requireOwner,
  requireRole,
  text,
  version,
  type Transaction,
} from '@atlas/service-kit';
import { quoteContent } from '../domain/quote.ts';
import type { Contract, Fulfillment, Quote } from '../domain/model.ts';
import { toApprovedSnapshot } from '../domain/model.ts';
import type { CustomerDirectory } from './ports.ts';
import { visit } from './visits.ts';
export function canReadQuote(principal: Principal, value: Quote): boolean {
  return (
    hasRole(principal, 'admin') ||
    (hasRole(principal, 'rep') && principal.repId === value.repId) ||
    (hasRole(principal, 'client') &&
      principal.clientId === value.clientId &&
      value.status !== 'draft')
  );
}
export async function quote(tx: Transaction, principal: Principal, id: string): Promise<Quote> {
  const value = (await tx.get<Quote>('quotes', id)) ?? notFound('Quote');
  assert(canReadQuote(principal, value), 'NOT_FOUND', 'Quote was not found', 404);
  return value;
}
export async function contract(
  tx: Transaction,
  principal: Principal,
  id: string,
): Promise<Contract> {
  const value = (await tx.get<Contract>('contracts', id)) ?? notFound('Contract');
  requireOwner(principal, value, ['admin', 'finance', 'delivery']);
  return value;
}
export async function authorizeQuoteAssignment(
  principal: Principal,
  value: { clientId: string; repId: string },
  directory: CustomerDirectory,
  authorization: string,
): Promise<void> {
  requireRole(principal, 'rep', 'admin');
  const customer = await directory.getCustomer(value.clientId, authorization);
  assert(
    !customer.doNotContact,
    'DO_NOT_CONTACT',
    'Customer has opted out of new sales activity',
    409,
  );
  assert(
    hasRole(principal, 'admin') ||
      (customer.repId === principal.repId && value.repId === principal.repId),
    'CUSTOMER_ASSIGNMENT_CHANGED',
    'Customer is no longer assigned to this representative',
    403,
  );
}
export async function createQuote(
  tx: Transaction,
  principal: Principal,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
): Promise<Quote> {
  requireRole(principal, 'rep', 'admin');
  const body = object(input);
  const source = await visit(tx, principal, text(body.visitId, 'visitId', 1, 100));
  assert(
    ['active', 'completed'].includes(source.status),
    'VISIT_STATE',
    'Start the visit before preparing a quote',
    409,
  );
  await authorizeQuoteAssignment(principal, source, directory, authorization);
  const content = quoteContent(body);
  return tx.insert<Quote>('quotes', {
    visitId: source.id,
    clientId: source.clientId,
    customerName: source.customerName,
    repId: source.repId,
    status: 'draft',
    ...content,
    sentAt: null,
    acceptedAt: null,
    acceptedBy: null,
    customerResponse: '',
    revisionOf: null,
  });
}
export async function updateQuote(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
): Promise<Quote> {
  requireRole(principal, 'rep', 'admin');
  const body = object(input);
  const value = await quote(tx, principal, id);
  await authorizeQuoteAssignment(principal, value, directory, authorization);
  assert(
    value.status === 'draft',
    'IMMUTABLE_QUOTE',
    'Only drafts can be edited; create a revision for a sent quote',
    409,
  );
  return tx.replace<Quote>('quotes', { ...value, ...quoteContent(body) }, version(body));
}
export async function reviseQuote(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
): Promise<Quote> {
  requireRole(principal, 'rep', 'admin');
  const body = object(input);
  const value = await quote(tx, principal, id);
  await authorizeQuoteAssignment(principal, value, directory, authorization);
  assert(value.version === version(body), 'VERSION_CONFLICT', 'Quote changed; reload first', 409);
  assert(
    !(await tx.list<Quote>('quotes', { revisionOf: value.id })).some(
      (quote) => quote.status === 'draft' || quote.status === 'sent',
    ),
    'REVISION_EXISTS',
    'An editable revision already exists',
    409,
  );
  assert(
    ['changes_requested', 'rejected', 'sent'].includes(value.status),
    'QUOTE_STATE',
    'This quote cannot be revised',
    409,
  );
  if (value.status === 'sent')
    await tx.replace<Quote>('quotes', { ...value, status: 'cancelled' }, value.version);
  const {
    id: _id,
    tenantId: _tenant,
    version: _version,
    createdAt: _created,
    updatedAt: _updated,
    ...snapshot
  } = value;
  return tx.insert<Quote>('quotes', {
    ...snapshot,
    status: 'draft',
    revisionOf: value.id,
    sentAt: null,
    acceptedAt: null,
    acceptedBy: null,
    customerResponse: '',
  });
}
export async function sendQuote(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
): Promise<Quote> {
  requireRole(principal, 'rep', 'admin');
  const body = object(input);
  const value = await quote(tx, principal, id);
  assert(value.status === 'draft', 'QUOTE_STATE', 'Only a draft quote can be sent', 409);
  assert(
    value.validUntil >= now().slice(0, 10),
    'QUOTE_EXPIRED',
    'Update the expired draft before sending',
    409,
  );
  await authorizeQuoteAssignment(principal, value, directory, authorization);
  const result = await tx.replace<Quote>(
    'quotes',
    { ...value, status: 'sent', sentAt: now() },
    version(body),
  );
  await tx.emit('sales.quote_sent.v1', result.id, result.version, {
    quoteId: result.id,
    clientId: result.clientId,
    repId: result.repId,
    totalMinor: result.totalMinor,
    currency: result.currency,
  });
  return result;
}
export async function respondQuote(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
  response: 'accept' | 'reject' | 'request-changes',
): Promise<Quote | { quote: Quote; contract: Contract }> {
  requireRole(principal, 'client');
  const body = object(input);
  const value = await quote(tx, principal, id);
  assert(principal.clientId === value.clientId, 'NOT_FOUND', 'Quote was not found', 404);
  assert(
    value.status === 'sent',
    'QUOTE_STATE',
    'Only a sent quote can receive a customer response',
    409,
  );
  assert(value.validUntil >= now().slice(0, 10), 'QUOTE_EXPIRED', 'This quote has expired', 409);
  assert(value.version === version(body), 'VERSION_CONFLICT', 'Quote changed; reload first', 409);
  if (response !== 'accept')
    return tx.replace<Quote>(
      'quotes',
      {
        ...value,
        status: response === 'reject' ? 'rejected' : 'changes_requested',
        customerResponse: text(body.reason, 'reason', 3, 3000),
      },
      value.version,
    );
  assert(
    body.consent === true,
    'CONSENT_REQUIRED',
    'Explicit acceptance of the displayed quote is required',
  );
  const accepted = await tx.replace<Quote>(
    'quotes',
    {
      ...value,
      status: 'accepted',
      acceptedAt: now(),
      acceptedBy: principal.sub,
      customerResponse: optionalText(body.paymentWishes, 'paymentWishes', 2000),
    },
    value.version,
  );
  assert(
    !(await tx.list<Contract>('contracts', { quoteId: value.id })).length,
    'CONTRACT_EXISTS',
    'This quote already has a contract',
    409,
  );
  const created = await tx.insert<Contract>('contracts', {
    quoteId: accepted.id,
    quoteVersion: accepted.version,
    visitId: accepted.visitId,
    clientId: accepted.clientId,
    customerName: accepted.customerName,
    repId: accepted.repId,
    status: 'pending',
    currency: accepted.currency,
    items: accepted.items,
    totalMinor: accepted.totalMinor,
    terms: accepted.terms,
    paymentPlan: accepted.paymentPlan,
    quoteSnapshot: accepted,
    approvedAt: null,
    approvedBy: null,
    signerName: null,
  });
  await tx.insert<Fulfillment>('fulfillments', {
    id: created.id,
    contractId: created.id,
    clientId: created.clientId,
    repId: created.repId,
    projectId: null,
    invoiceIds: [],
    projectStatus: 'pending',
    invoicesStatus: 'pending',
  });
  await tx.emit('sales.quote_accepted.v1', accepted.id, accepted.version, {
    quoteId: accepted.id,
    contractId: created.id,
    clientId: created.clientId,
    repId: created.repId,
    status: 'contract_pending',
  });
  return { quote: accepted, contract: created };
}
export async function approveContract(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
): Promise<Contract> {
  requireRole(principal, 'client');
  const body = object(input);
  const value = await contract(tx, principal, id);
  assert(principal.clientId === value.clientId, 'NOT_FOUND', 'Contract was not found', 404);
  assert(
    value.status === 'pending',
    'CONTRACT_STATE',
    'This contract has already been approved',
    409,
  );
  assert(
    body.consent === true,
    'CONSENT_REQUIRED',
    'Explicit approval of scope, terms and payment plan is required',
  );
  const result = await tx.replace<Contract>(
    'contracts',
    {
      ...value,
      status: 'approved',
      approvedAt: now(),
      approvedBy: principal.sub,
      signerName: text(body.signerName, 'signerName', 2, 150),
    },
    version(body),
  );
  await tx.emit('contract.approved.v1', result.id, result.version, toApprovedSnapshot(result));
  return result;
}

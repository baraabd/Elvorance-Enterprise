import type { CustomerContext, CustomerDirectory, Entity, Principal } from '@elvorance/contracts';
import {
  actorScopes,
  AppError,
  assert,
  hasRole,
  notFound,
  pageOptions,
  requireOwner,
  requireRole,
  type Transaction,
} from '@elvorance/service-kit';

export type RepOwned = { repId: string; clientId?: string | null };
export function repScope(principal: Principal, value: RepOwned): void {
  requireRole(principal, 'rep', 'admin');
  requireOwner(principal, { repId: value.repId });
}
export async function currentCustomer(
  principal: Principal,
  clientId: string,
  directory: CustomerDirectory,
  authorization: string,
  repId?: string,
  contact = false,
): Promise<CustomerContext> {
  requireRole(principal, 'rep', 'admin');
  const customer = await directory.getCustomer(clientId, authorization);
  assert(
    hasRole(principal, 'admin') ||
      (customer.repId === principal.repId && (!repId || repId === principal.repId)),
    'NOT_FOUND',
    'Customer is not assigned to this representative',
    404,
  );
  if (repId)
    assert(
      customer.repId === repId,
      'CUSTOMER_ASSIGNMENT_CHANGED',
      'Refresh the customer assignment before continuing',
      409,
    );
  if (contact)
    assert(
      !customer.doNotContact,
      'DO_NOT_CONTACT',
      'Customer has opted out of new sales activity',
      409,
    );
  return customer;
}
export async function authorizeOwned(
  principal: Principal,
  value: RepOwned,
  directory: CustomerDirectory,
  authorization: string,
  contact = false,
): Promise<void> {
  repScope(principal, value);
  if (value.clientId)
    await currentCustomer(
      principal,
      value.clientId,
      directory,
      authorization,
      value.repId,
      contact,
    );
}
export async function ownedRecord<T extends Entity & RepOwned>(
  tx: Transaction,
  table: string,
  id: string,
  principal: Principal,
  directory: CustomerDirectory,
  authorization: string,
): Promise<T> {
  const result = (await tx.get<T>(table, id)) ?? notFound('Sales record');
  await authorizeOwned(principal, result, directory, authorization);
  return result;
}
export async function ownedRecords<T extends Entity & RepOwned>(
  tx: Transaction,
  table: string,
  principal: Principal,
  directory: CustomerDirectory,
  authorization: string,
  query: unknown,
) {
  requireRole(principal, 'rep', 'admin');
  const page = await tx.page<T>(
    table,
    pageOptions(query, actorScopes(principal, ['admin'], false)),
  );
  return {
    ...page,
    items: await filterCurrentAssignments(page.items, principal, directory, authorization),
  };
}
export async function filterCurrentAssignments<T extends Entity & RepOwned>(
  rows: T[],
  principal: Principal,
  directory: CustomerDirectory,
  authorization: string,
): Promise<T[]> {
  if (hasRole(principal, 'admin', 'finance', 'delivery') || !hasRole(principal, 'rep')) return rows;
  const current = new Map<string, boolean>();
  const result: T[] = [];
  for (const row of rows) {
    if (!row.clientId) {
      result.push(row);
      continue;
    }
    if (
      hasRole(principal, 'client') &&
      row.clientId === principal.clientId &&
      (!('status' in row) || row.status !== 'draft')
    ) {
      result.push(row);
      continue;
    }
    if (!current.has(row.clientId)) {
      try {
        current.set(
          row.clientId,
          (await directory.getCustomer(row.clientId, authorization)).repId === principal.repId,
        );
      } catch (error) {
        if (error instanceof AppError && [403, 404].includes(error.statusCode))
          current.set(row.clientId, false);
        else throw error;
      }
    }
    if (current.get(row.clientId)) result.push(row);
  }
  return result;
}

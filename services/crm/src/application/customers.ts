import type { Principal, CustomerContext } from '@atlas/contracts';
import {
  assert,
  bool,
  hasRole,
  notFound,
  object,
  optionalText,
  requireOwner,
  requireRole,
  text,
  version,
  type Transaction,
} from '@atlas/service-kit';
import type { Customer, Region } from '../domain/model.ts';
export async function customer(
  tx: Transaction,
  principal: Principal,
  id: string,
): Promise<Customer> {
  const value = (await tx.get<Customer>('customers', id)) ?? notFound('Customer');
  requireOwner(principal, { clientId: value.id, repId: value.repId }, [
    'admin',
    'support',
    'finance',
    'delivery',
  ]);
  return value;
}
export function customerContext(value: Customer): CustomerContext {
  return {
    id: value.id,
    name: value.name,
    repId: value.repId,
    regionId: value.regionId,
    doNotContact: value.doNotContact,
    consentVersion: value.consentVersion,
    version: value.version,
  };
}
export async function createCustomer(
  tx: Transaction,
  principal: Principal,
  input: unknown,
): Promise<Customer> {
  requireRole(principal, 'admin', 'rep');
  const body = object(input);
  const repId = hasRole(principal, 'admin') ? text(body.repId, 'repId', 1, 100) : principal.repId!;
  const regionId = body.regionId ? text(body.regionId, 'regionId', 1, 100) : null;
  if (regionId) {
    const region = (await tx.get<Region>('regions', regionId)) ?? notFound('Region');
    assert(region.active, 'REGION_DISABLED', 'Region is not active');
  }
  const result = await tx.insert<Customer>('customers', {
    name: text(body.name, 'name', 2, 200),
    repId,
    regionId,
    phone: optionalText(body.phone, 'phone', 40),
    email: optionalText(body.email, 'email', 200),
    doNotContact: false,
    consentVersion: 1,
    notes: optionalText(body.notes, 'notes', 3000),
  });
  await tx.emit('crm.customer_created.v1', result.id, result.version, customerContext(result));
  return result;
}
export async function updateCustomer(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
): Promise<Customer> {
  requireRole(principal, 'admin', 'rep', 'client');
  const body = object(input);
  const value = await customer(tx, principal, id);
  if (hasRole(principal, 'client') && !hasRole(principal, 'admin')) {
    assert(
      body.repId === undefined && body.regionId === undefined,
      'FORBIDDEN',
      'Customers cannot change their assignment',
      403,
    );
  }
  const next = { ...value };
  if (body.name !== undefined) next.name = text(body.name, 'name', 2, 200);
  if (body.phone !== undefined) next.phone = optionalText(body.phone, 'phone', 40);
  if (body.email !== undefined) next.email = optionalText(body.email, 'email', 200);
  if (body.doNotContact !== undefined) {
    next.doNotContact = bool(body.doNotContact, 'doNotContact');
    next.consentVersion = value.consentVersion + 1;
  }
  if (body.repId !== undefined) {
    requireRole(principal, 'admin');
    next.repId = text(body.repId, 'repId', 1, 100);
  }
  if (body.regionId !== undefined) {
    requireRole(principal, 'admin');
    next.regionId = body.regionId ? text(body.regionId, 'regionId', 1, 100) : null;
    if (next.regionId) (await tx.get<Region>('regions', next.regionId)) ?? notFound('Region');
  }
  const result = await tx.replace('customers', next, version(body));
  await tx.emit('crm.customer_updated.v1', result.id, result.version, customerContext(result));
  return result;
}
export async function createRegion(
  tx: Transaction,
  principal: Principal,
  input: unknown,
): Promise<Region> {
  requireRole(principal, 'admin');
  const body = object(input);
  return tx.insert<Region>('regions', {
    name: text(body.name, 'name', 2, 150),
    code: text(body.code, 'code', 1, 30),
    active: true,
  });
}

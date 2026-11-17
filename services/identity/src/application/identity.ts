import { roles } from '@elvorance/contracts';
import { array, object, oneOf, requireRole, text, type Transaction } from '@elvorance/service-kit';
import type { Principal } from '@elvorance/contracts';
import type { Membership, TenantProfile } from '../domain/model.ts';
export async function createTenant(
  tx: Transaction,
  principal: Principal,
  input: unknown,
): Promise<TenantProfile> {
  requireRole(principal, 'admin');
  const body = object(input);
  return tx.insert<TenantProfile>('tenant_profiles', {
    id: principal.tenantId,
    name: text(body.name, 'name', 2, 150),
    locale: text(body.locale ?? 'ar', 'locale', 2, 10),
    currency: text(body.currency ?? 'SAR', 'currency', 3, 3),
  });
}
export async function createMembership(
  tx: Transaction,
  principal: Principal,
  input: unknown,
): Promise<Membership> {
  requireRole(principal, 'admin');
  const body = object(input);
  return tx.insert<Membership>('memberships', {
    subject: text(body.subject, 'subject', 1, 150),
    displayName: text(body.displayName, 'displayName', 2, 150),
    roles: array(body.roles, 'roles', 6, 1).map((role) => oneOf(role, roles, 'role')),
    status: 'active',
  });
}

import type { CustomerDirectory, Principal } from '@elvorance/contracts';
import {
  assert,
  fingerprint,
  notFound,
  now,
  object,
  oneOf,
  requireRole,
  text,
  version,
  type Transaction,
} from '@elvorance/service-kit';
import type { DiscountApproval, Quote } from '../domain/model.ts';
import { authorizeOwned, ownedRecord } from './assignment.ts';

export function requiresDiscountApproval(value: Quote): boolean {
  return (
    value.customPricing === true ||
    (value.discountMinor ?? 0) * 100 > (value.subtotalMinor ?? value.totalMinor) * 15
  );
}
export function quoteContentHash(value: Quote): string {
  return fingerprint({
    quoteId: value.id,
    clientId: value.clientId,
    repId: value.repId,
    currency: value.currency,
    items: value.items,
    subtotalMinor: value.subtotalMinor ?? value.totalMinor,
    discountMinor: value.discountMinor ?? 0,
    totalMinor: value.totalMinor,
    paymentPlan: value.paymentPlan,
    terms: value.terms,
    validUntil: value.validUntil,
    catalogVersion: value.catalogVersion,
    customPricing: value.customPricing,
  });
}
export async function assertDiscountApproved(tx: Transaction, value: Quote): Promise<void> {
  if (!requiresDiscountApproval(value)) return;
  const approvals = await tx.list<DiscountApproval>('discount_approvals', {
    quoteId: value.id,
    status: 'approved',
  });
  assert(
    approvals.some((approval) => approval.contentHash === quoteContentHash(value)),
    'DISCOUNT_APPROVAL_REQUIRED',
    'A discount above 15% or custom service pricing requires administrative approval of this exact quote',
    409,
  );
}
export async function invalidatePendingApprovals(tx: Transaction, value: Quote): Promise<void> {
  // Older records have no discount fields and predate this domain; avoid unnecessary storage queries.
  if (value.discountMinor === undefined) return;
  for (const approval of await tx.list<DiscountApproval>('discount_approvals', {
    quoteId: value.id,
    status: 'pending',
  }))
    await tx.replace<DiscountApproval>(
      'discount_approvals',
      { ...approval, status: 'superseded' },
      approval.version,
    );
}
export async function requestDiscountApproval(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
): Promise<DiscountApproval> {
  const body = object(input);
  const value = await ownedRecord<Quote>(tx, 'quotes', id, principal, directory, authorization);
  await authorizeOwned(principal, value, directory, authorization, true);
  assert(
    value.version === version(body),
    'VERSION_CONFLICT',
    'Quote changed; reload before requesting approval',
    409,
  );
  assert(
    value.status === 'draft' && requiresDiscountApproval(value),
    'DISCOUNT_STATE',
    'Only a draft with a discount above 15% or custom pricing requires approval',
    409,
  );
  const contentHash = quoteContentHash(value);
  const existing = (
    await tx.list<DiscountApproval>('discount_approvals', { quoteId: id, status: 'pending' })
  )[0];
  if (existing?.contentHash === contentHash) return existing;
  if (existing)
    await tx.replace<DiscountApproval>(
      'discount_approvals',
      { ...existing, status: 'superseded' },
      existing.version,
    );
  const result = await tx.insert<DiscountApproval>('discount_approvals', {
    quoteId: id,
    clientId: value.clientId,
    repId: value.repId,
    contentHash,
    subtotalMinor: value.subtotalMinor,
    discountMinor: value.discountMinor,
    status: 'pending',
    requestedBy: principal.sub,
    reason: text(body.reason, 'reason', 5, 2000),
    decidedBy: null,
    decidedAt: null,
    decisionNote: '',
  });
  await tx.emit('sales.discount_approval_requested.v1', result.id, result.version, {
    approvalId: result.id,
    quoteId: id,
    clientId: value.clientId,
    repId: value.repId,
  });
  return result;
}
export async function decideDiscountApproval(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
): Promise<DiscountApproval> {
  requireRole(principal, 'admin');
  const body = object(input);
  const approval =
    (await tx.get<DiscountApproval>('discount_approvals', id)) ?? notFound('Discount approval');
  const value = (await tx.get<Quote>('quotes', approval.quoteId)) ?? notFound('Quote');
  assert(
    approval.status === 'pending' &&
      value.status === 'draft' &&
      approval.contentHash === quoteContentHash(value),
    'DISCOUNT_STATE',
    'Quote changed or approval was already decided; request approval again',
    409,
  );
  const decision = oneOf(body.decision, ['approved', 'rejected'] as const, 'decision');
  const result = await tx.replace<DiscountApproval>(
    'discount_approvals',
    {
      ...approval,
      status: decision,
      decidedBy: principal.sub,
      decidedAt: now(),
      decisionNote: text(body.note, 'note', 3, 2000),
    },
    version(body),
  );
  await tx.emit('sales.discount_approval_decided.v1', result.id, result.version, {
    approvalId: id,
    quoteId: value.id,
    clientId: value.clientId,
    repId: value.repId,
    decision,
  });
  return result;
}

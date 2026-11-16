import type { Principal } from '@atlas/contracts';
import {
  assert,
  finite,
  hasRole,
  instant,
  notFound,
  now,
  object,
  oneOf,
  optionalText,
  requireOwner,
  requireRole,
  text,
  version,
  type Transaction,
} from '@atlas/service-kit';
import type { Contract, Quote, Visit } from '../domain/model.ts';
import type { CustomerDirectory } from './ports.ts';
export async function visit(tx: Transaction, principal: Principal, id: string): Promise<Visit> {
  const result = (await tx.get<Visit>('visits', id)) ?? notFound('Visit');
  requireOwner(principal, result);
  return result;
}
export async function createVisit(
  tx: Transaction,
  principal: Principal,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
): Promise<Visit> {
  requireRole(principal, 'rep', 'admin');
  const body = object(input);
  const customer = await directory.getCustomer(
    text(body.clientId, 'clientId', 1, 100),
    authorization,
  );
  assert(
    hasRole(principal, 'admin') || customer.repId === principal.repId,
    'FORBIDDEN',
    'Customer is assigned to another representative',
    403,
  );
  assert(!customer.doNotContact, 'DO_NOT_CONTACT', 'Customer has opted out of new visits', 409);
  return tx.insert<Visit>('visits', {
    clientId: customer.id,
    customerName: customer.name,
    repId: customer.repId,
    regionId: customer.regionId,
    status: 'scheduled',
    scheduledAt: instant(body.scheduledAt, 'scheduledAt'),
    purpose: text(body.purpose, 'purpose', 3, 2000),
    startedAt: null,
    completedAt: null,
    startProof: null,
    outcome: null,
    notes: '',
    nextStep: '',
    agreementSnapshot: null,
  });
}
export async function startVisit(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
): Promise<Visit> {
  requireRole(principal, 'rep', 'admin');
  const body = object(input);
  const value = await visit(tx, principal, id);
  assert(value.status === 'scheduled', 'VISIT_STATE', 'Only a scheduled visit can start', 409);
  const customer = await directory.getCustomer(value.clientId, authorization);
  assert(
    !customer.doNotContact && customer.repId === value.repId,
    'CUSTOMER_ASSIGNMENT_CHANGED',
    'Customer consent or assignment changed; refresh the visit',
    409,
  );
  assert(
    !(await tx.list<Visit>('visits', { repId: value.repId, status: 'active' })).length,
    'ACTIVE_VISIT',
    'Finish the active visit before starting another',
    409,
  );
  const proof = object(body.proof);
  let startProof: Visit['startProof'];
  if (proof.kind === 'gps') {
    const capturedAt = instant(proof.capturedAt, 'capturedAt');
    const age = Date.now() - Date.parse(capturedAt);
    assert(age >= -10_000 && age <= 120_000, 'STALE_PROOF', 'GPS proof must be a fresh reading');
    startProof = {
      kind: 'gps',
      latitude: finite(proof.latitude, 'latitude', -90, 90),
      longitude: finite(proof.longitude, 'longitude', -180, 180),
      accuracy: finite(proof.accuracy, 'accuracy', 0, 10_000),
      capturedAt,
    };
  } else {
    assert(proof.kind === 'manual', 'INVALID_PROOF', 'Choose GPS or an explicit manual reason');
    startProof = { kind: 'manual', reason: text(proof.reason, 'manual reason', 5, 1000) };
  }
  return tx.replace<Visit>(
    'visits',
    { ...value, status: 'active', startedAt: now(), startProof },
    version(body),
  );
}
export async function completeVisit(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
): Promise<Visit> {
  requireRole(principal, 'rep', 'admin');
  const body = object(input);
  const value = await visit(tx, principal, id);
  assert(value.status === 'active', 'VISIT_STATE', 'Only an active visit can be completed', 409);
  const outcome = oneOf(
    body.outcome,
    ['interested', 'follow_up', 'not_interested', 'no_contact', 'agreement'] as const,
    'outcome',
  );
  const customerConsentVersion =
    outcome === 'no_contact'
      ? (await directory.getCustomer(value.clientId, authorization)).consentVersion
      : null;
  const quotes = await tx.list<Quote>('quotes', { visitId: id });
  const contracts = await tx.list<Contract>('contracts', { visitId: id });
  // Agreement evidence is always derived server-side. Client input cannot assert acceptance, approval or payment.
  const agreementSnapshot = {
    capturedAt: now(),
    customerId: value.clientId,
    quotes: quotes.map((q) => ({
      id: q.id,
      version: q.version,
      status: q.status,
      totalMinor: q.totalMinor,
      currency: q.currency,
      acceptedAt: q.acceptedAt,
      acceptedBy: q.acceptedBy,
      items: q.items,
      terms: q.terms,
    })),
    contracts: contracts.map((c) => ({
      id: c.id,
      quoteId: c.quoteId,
      status: c.status,
      approvedAt: c.approvedAt,
      approvedBy: c.approvedBy,
    })),
    paymentEvidence: 'Owned by billing; no payment is inferred from visit completion',
  };
  if (outcome === 'agreement')
    assert(
      quotes.some((q) => q.status === 'accepted'),
      'NO_ACCEPTED_QUOTE',
      'An agreement outcome requires a customer-accepted quote',
      409,
    );
  const result = await tx.replace<Visit>(
    'visits',
    {
      ...value,
      status: 'completed',
      completedAt: now(),
      outcome,
      notes: text(body.notes, 'notes', 3, 5000),
      nextStep: optionalText(body.nextStep, 'nextStep', 2000),
      agreementSnapshot,
    },
    version(body),
  );
  if (outcome === 'no_contact')
    for (const pending of await tx.list<Visit>('visits', {
      clientId: value.clientId,
      status: 'scheduled',
    }))
      await tx.replace<Visit>(
        'visits',
        { ...pending, status: 'cancelled', outcome: 'customer_opt_out' },
        pending.version,
      );
  await tx.emit('sales.visit_completed.v1', result.id, result.version, {
    visitId: result.id,
    clientId: result.clientId,
    repId: result.repId,
    outcome,
    doNotContact: outcome === 'no_contact',
    customerConsentVersion,
    completedAt: result.completedAt,
  });
  return result;
}

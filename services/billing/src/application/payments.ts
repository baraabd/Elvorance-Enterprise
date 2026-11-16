import type { Principal } from '@atlas/contracts';
import {
  assert,
  integer,
  notFound,
  now,
  object,
  oneOf,
  requireOwner,
  requireRole,
  text,
  version,
  type Transaction,
} from '@atlas/service-kit';
import type { ContractAccount, Invoice, Payment } from '../domain/model.ts';
export async function invoice(tx: Transaction, principal: Principal, id: string): Promise<Invoice> {
  const value = (await tx.get<Invoice>('invoices', id)) ?? notFound('Invoice');
  requireOwner(principal, value, ['admin', 'finance']);
  return value;
}
export async function recordPayment(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
): Promise<{ invoice: Invoice; payment: Payment; account: ContractAccount }> {
  requireRole(principal, 'admin', 'finance');
  const body = object(input);
  const value = await invoice(tx, principal, id);
  const account =
    (await tx.get<ContractAccount>('contract_accounts', value.contractId)) ??
    notFound('Contract account');
  const amountMinor = integer(body.amountMinor, 'amountMinor', 1, 100_000_000_000);
  const requestId = text(body.requestId, 'requestId', 8, 150);
  assert(
    !(await tx.list<Payment>('payments', { requestId })).length,
    'DUPLICATE_PAYMENT',
    'This payment reference has already been recorded',
    409,
  );
  assert(
    value.status !== 'paid' &&
      amountMinor <= value.amountMinor - value.paidMinor &&
      amountMinor <= account.totalMinor - account.paidMinor,
    'PAYMENT_EXCEEDS_BALANCE',
    'Payment exceeds the outstanding invoice or contract balance',
    409,
  );
  const payment = await tx.insert<Payment>('payments', {
    requestId,
    invoiceId: id,
    contractId: value.contractId,
    clientId: value.clientId,
    repId: value.repId,
    amountMinor,
    currency: value.currency,
    method: oneOf(body.method, ['bank_transfer', 'cash', 'external_provider'] as const, 'method'),
    reference: text(body.reference, 'reference', 3, 300),
    recordedBy: principal.sub,
    recordedAt: now(),
  });
  const paidMinor = value.paidMinor + amountMinor;
  const updated = await tx.replace<Invoice>(
    'invoices',
    { ...value, paidMinor, status: paidMinor === value.amountMinor ? 'paid' : 'part_paid' },
    version(body),
  );
  const updatedAccount = await tx.replace<ContractAccount>(
    'contract_accounts',
    { ...account, paidMinor: account.paidMinor + amountMinor },
    account.version,
  );
  await tx.emit('billing.payment_recorded.v1', updated.id, updated.version, {
    invoiceId: updated.id,
    contractId: updated.contractId,
    clientId: updated.clientId,
    repId: updated.repId,
    paymentId: payment.id,
    amountMinor,
    currency: updated.currency,
  });
  return { invoice: updated, payment, account: updatedAccount };
}

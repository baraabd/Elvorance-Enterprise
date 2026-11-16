import type { ContractSnapshot, EventEnvelope } from '@atlas/contracts';
import {
  array,
  assert,
  dateOnly,
  integer,
  object,
  text,
  type Transaction,
} from '@atlas/service-kit';
import type { ContractAccount, Invoice } from '../domain/model.ts';
export const subscriptions = ['contract.approved.v1'];
export async function handleEvent(tx: Transaction, event: EventEnvelope): Promise<void> {
  if (event.type !== 'contract.approved.v1') return;
  const body = object(event.payload);
  const contractId = text(body.contractId, 'contractId', 1, 100);
  assert(contractId === event.aggregateId, 'EVENT_AGGREGATE', 'Contract event ID mismatch');
  if ((await tx.list<ContractAccount>('contract_accounts', { contractId })).length) return;
  const totalMinor = integer(body.totalMinor, 'totalMinor', 1, 100_000_000_000);
  const plan = array(body.paymentPlan, 'paymentPlan', 24, 1).map((input) => {
    const item = object(input);
    return {
      id: text(item.id, 'paymentPlan.id', 1, 100),
      label: text(item.label, 'label', 2, 150),
      amountMinor: integer(item.amountMinor, 'amountMinor', 1),
      dueOn: dateOnly(item.dueOn, 'dueOn'),
    };
  });
  assert(
    plan.reduce((sum, item) => sum + item.amountMinor, 0) === totalMinor &&
      new Set(plan.map((item) => item.id)).size === plan.length,
    'PAYMENT_PLAN_TOTAL',
    'Contract payment plan does not balance',
  );
  const itemTotal = array(body.items, 'items', 40, 1).reduce<number>((sum, input) => {
    const item = object(input);
    return (
      sum +
      integer(item.quantity, 'quantity', 1, 1000) *
        integer(item.unitPriceMinor, 'unitPriceMinor', 1, 1_000_000_000)
    );
  }, 0);
  assert(itemTotal === totalMinor, 'CONTRACT_TOTAL', 'Contract item total is inconsistent');
  const common = {
    contractId,
    clientId: text(body.clientId, 'clientId', 1, 100),
    repId: text(body.repId, 'repId', 1, 100),
    currency: text(body.currency, 'currency', 3, 3),
  };
  await tx.insert<ContractAccount>('contract_accounts', {
    id: contractId,
    ...common,
    totalMinor,
    paidMinor: 0,
    contractSnapshot: structuredClone(body) as unknown as ContractSnapshot,
  });
  const invoices: Invoice[] = [];
  for (const item of plan)
    invoices.push(
      await tx.insert<Invoice>('invoices', {
        ...common,
        paymentPlanId: item.id,
        label: item.label,
        amountMinor: item.amountMinor,
        paidMinor: 0,
        dueOn: item.dueOn,
        status: 'open',
      }),
    );
  await tx.emit(
    'billing.invoices_created.v1',
    contractId,
    1,
    {
      contractId,
      clientId: common.clientId,
      repId: common.repId,
      invoiceIds: invoices.map((invoice) => invoice.id),
      totalMinor,
      currency: common.currency,
    },
    event.correlationId,
  );
}

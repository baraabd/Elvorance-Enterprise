import type { EventEnvelope } from '@elvorance/contracts';
import {
  array,
  assert,
  bool,
  integer,
  notFound,
  object,
  text,
  type Transaction,
} from '@elvorance/service-kit';
import type { CustomerProjection, Fulfillment, Visit } from '../domain/model.ts';
export const subscriptions = [
  'delivery.project_created.v1',
  'billing.invoices_created.v1',
  'crm.customer_updated.v1',
];
export async function handleEvent(tx: Transaction, event: EventEnvelope): Promise<void> {
  const body = object(event.payload);
  if (event.type === 'crm.customer_updated.v1') {
    const customerId = text(body.id, 'customer.id', 1, 100);
    assert(
      event.source === 'crm' && event.aggregateId === customerId,
      'EVENT_SOURCE',
      'Customer projection source or aggregate mismatch',
    );
    const previous = await tx.get<CustomerProjection>('customer_contexts', customerId);
    if (previous && event.aggregateVersion <= previous.sourceVersion) return;
    const fields = {
      customerId,
      sourceVersion: event.aggregateVersion,
      doNotContact: bool(body.doNotContact, 'doNotContact'),
      repId: text(body.repId, 'repId', 1, 100),
      consentVersion: integer(body.consentVersion, 'consentVersion', 1),
    };
    if (previous)
      await tx.replace<CustomerProjection>(
        'customer_contexts',
        { ...previous, ...fields },
        previous.version,
      );
    else await tx.insert<CustomerProjection>('customer_contexts', { id: customerId, ...fields });
    if (fields.doNotContact)
      for (const visit of await tx.list<Visit>('visits', {
        clientId: customerId,
        status: 'scheduled',
      }))
        await tx.replace<Visit>(
          'visits',
          { ...visit, status: 'cancelled', outcome: 'customer_opt_out' },
          visit.version,
        );
    return;
  }
  const contractId = text(body.contractId, 'contractId', 1, 100);
  const value =
    (await tx.get<Fulfillment>('fulfillments', contractId)) ?? notFound('Contract fulfillment');
  if (event.type === 'delivery.project_created.v1') {
    const projectId = text(body.projectId, 'projectId', 1, 100);
    assert(
      !value.projectId || value.projectId === projectId,
      'FULFILLMENT_CONFLICT',
      'Contract already has a different project',
    );
    await tx.replace(
      'fulfillments',
      { ...value, projectId, projectStatus: 'ready' },
      value.version,
    );
  } else if (event.type === 'billing.invoices_created.v1') {
    const invoiceIds = array(body.invoiceIds, 'invoiceIds', 24, 1).map((id) =>
      text(id, 'invoiceId', 1, 100),
    );
    assert(
      !value.invoiceIds.length ||
        JSON.stringify([...value.invoiceIds].sort()) === JSON.stringify([...invoiceIds].sort()),
      'FULFILLMENT_CONFLICT',
      'Contract invoice projection conflicts',
    );
    await tx.replace(
      'fulfillments',
      { ...value, invoiceIds, invoicesStatus: 'ready' },
      value.version,
    );
  }
}

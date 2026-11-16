import type { EventEnvelope } from '@atlas/contracts';
import { assert, integer, object, text, type Transaction } from '@atlas/service-kit';
import type { Customer } from '../domain/model.ts';
import { customerContext } from './customers.ts';
export const subscriptions = ['sales.visit_completed.v1'];
export async function handleEvent(tx: Transaction, event: EventEnvelope): Promise<void> {
  if (event.type !== 'sales.visit_completed.v1') return;
  assert(event.source === 'sales', 'EVENT_SOURCE', 'Visit completion must be emitted by Sales');
  const body = object(event.payload);
  if (body.doNotContact !== true) return;
  const customer = await tx.get<Customer>('customers', text(body.clientId, 'clientId', 1, 100));
  if (!customer || customer.doNotContact) return;
  // A delayed representative request must not overwrite a newer explicit customer consent decision.
  if (integer(body.customerConsentVersion, 'customerConsentVersion', 1) !== customer.consentVersion)
    return;
  const updated = await tx.replace(
    'customers',
    { ...customer, doNotContact: true, consentVersion: customer.consentVersion + 1 },
    customer.version,
  );
  await tx.emit(
    'crm.customer_updated.v1',
    updated.id,
    updated.version,
    customerContext(updated),
    event.correlationId,
  );
}

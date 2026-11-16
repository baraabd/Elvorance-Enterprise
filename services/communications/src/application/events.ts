import type { EventEnvelope } from '@atlas/contracts';
import { object, optionalText, type Transaction } from '@atlas/service-kit';
import type { Notification } from '../domain/model.ts';
export const subscriptions = [
  'crm.customer_created.v1',
  'sales.quote_sent.v1',
  'sales.quote_accepted.v1',
  'contract.approved.v1',
  'delivery.project_created.v1',
  'delivery.project_completed.v1',
  'billing.invoices_created.v1',
  'billing.payment_recorded.v1',
  'communications.ticket_opened.v1',
];
const titles: Record<string, string> = {
  'crm.customer_created.v1': 'New customer created',
  'sales.quote_sent.v1': 'A quote is ready for review',
  'sales.quote_accepted.v1': 'Quote accepted; contract approval is pending',
  'contract.approved.v1': 'Contract approved',
  'delivery.project_created.v1': 'Project created in planning',
  'delivery.project_completed.v1': 'Project completed',
  'billing.invoices_created.v1': 'Contract invoices are ready',
  'billing.payment_recorded.v1': 'A payment was recorded',
  'communications.ticket_opened.v1': 'Support ticket opened',
};
export async function handleEvent(tx: Transaction, event: EventEnvelope): Promise<void> {
  const title = titles[event.type];
  if (!title) return;
  const body = object(event.payload);
  await tx.insert<Notification>('notifications', {
    eventId: event.id,
    clientId: optionalText(body.clientId, 'clientId', 100) || null,
    repId: optionalText(body.repId, 'repId', 100) || null,
    type: event.type,
    title,
    resourceId: event.aggregateId,
    readBy: [],
  });
}

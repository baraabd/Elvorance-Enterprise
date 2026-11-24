import type { EventEnvelope } from '@elvorance/contracts';
import { object, optionalText, type Transaction } from '@elvorance/service-kit';
import type { Notification } from '../domain/model.ts';
export const subscriptions = [
  'crm.customer_created.v1',
  'crm.discovery_saved.v1',
  'crm.configuration_published.v1',
  'sales.visit_rescheduled.v1',
  'sales.visit_cancelled.v1',
  'sales.task_updated.v1',
  'sales.opportunity_updated.v1',
  'sales.service_request_created.v1',
  'sales.service_request_updated.v1',
  'sales.quote_sent.v1',
  'sales.quote_accepted.v1',
  'contract.approved.v1',
  'delivery.project_created.v1',
  'delivery.project_completed.v1',
  'billing.invoices_created.v1',
  'billing.payment_recorded.v1',
  'communications.ticket_opened.v1',
  'communications.message_created.v1',
  'sales.discount_approval_requested.v1',
  'sales.discount_approval_decided.v1',
];
const staffOnlyEvents = new Set([
  'crm.discovery_saved.v1',
  'crm.configuration_published.v1',
  'sales.visit_rescheduled.v1',
  'sales.visit_cancelled.v1',
  'sales.task_updated.v1',
  'sales.opportunity_updated.v1',
]);
const titles: Record<string, string> = {
  'crm.discovery_saved.v1': 'Customer discovery updated',
  'crm.configuration_published.v1': 'Tenant catalog or questionnaire configuration published',
  'sales.visit_rescheduled.v1': 'Visit rescheduled',
  'sales.visit_cancelled.v1': 'Visit cancelled',
  'sales.task_updated.v1': 'Representative task updated',
  'sales.opportunity_updated.v1': 'Sales opportunity updated',
  'sales.service_request_created.v1': 'Customer service request submitted',
  'sales.service_request_updated.v1': 'Customer service request reviewed or cancelled',

  'crm.customer_created.v1': 'New customer created',
  'sales.quote_sent.v1': 'A quote is ready for review',
  'sales.quote_accepted.v1': 'Quote accepted; contract approval is pending',
  'contract.approved.v1': 'Contract approved',
  'delivery.project_created.v1': 'Project created in planning',
  'delivery.project_completed.v1': 'Project completed',
  'billing.invoices_created.v1': 'Contract invoices are ready',
  'billing.payment_recorded.v1': 'A payment was recorded',
  'communications.ticket_opened.v1': 'Support ticket opened',
  'communications.message_created.v1': 'A new conversation message is available',
  'sales.discount_approval_requested.v1': 'A commercial exception needs administrative review',
  'sales.discount_approval_decided.v1': 'A commercial exception has an administrative decision',
};
export async function handleEvent(tx: Transaction, event: EventEnvelope): Promise<void> {
  const title = titles[event.type];
  if (!title) return;
  const body = object(event.payload);
  await tx.insert<Notification>('notifications', {
    eventId: event.id,
    clientId:
      staffOnlyEvents.has(event.type) || event.type.startsWith('sales.discount_approval_')
        ? null
        : optionalText(body.clientId, 'clientId', 100) || null,
    repId: optionalText(body.repId, 'repId', 100) || null,
    type: event.type,
    title,
    resourceId: event.aggregateId,
    readBy: [],
  });
}

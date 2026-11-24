import type { Channel } from 'amqplib';
/** Deployment topology, not domain behavior. Declare all durable subscriber queues before any producer drains its outbox.
 * This keeps events for a service that has never started yet, not only temporarily disconnected consumers.
 * Adding a consumer is a topology migration: deploy its durable binding before producers emit the new event.
 */
export const exchanges = {
  main: 'atlas.events',
  retry: 'atlas.events.retry',
  ready: 'atlas.events.retry.ready',
  dead: 'atlas.events.dead',
} as const;
export const serviceBindings: Readonly<Record<string, readonly string[]>> = {
  identity: [],
  crm: ['sales.visit_completed.v1'],
  sales: ['delivery.project_created.v1', 'billing.invoices_created.v1', 'crm.customer_updated.v1'],
  delivery: ['contract.approved.v1'],
  billing: ['contract.approved.v1'],
  tracking: [],
  communications: [
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
  ],
};
export type TopologyChannel = Pick<Channel, 'assertExchange' | 'assertQueue' | 'bindQueue'>;
export async function provisionTopology(channel: TopologyChannel): Promise<void> {
  await channel.assertExchange(exchanges.main, 'topic', { durable: true });
  for (const name of [exchanges.retry, exchanges.ready, exchanges.dead])
    await channel.assertExchange(name, 'direct', { durable: true });
  for (const [service, bindings] of Object.entries(serviceBindings)) {
    if (!bindings.length) continue;
    const queue = `atlas.${service}.v1`;
    await channel.assertQueue(queue, {
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': exchanges.dead,
        'x-dead-letter-routing-key': queue,
      },
    });
    await channel.assertQueue(`${queue}.retry`, {
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-message-ttl': 5000,
        'x-dead-letter-exchange': exchanges.ready,
        'x-dead-letter-routing-key': queue,
      },
    });
    await channel.assertQueue(`${queue}.dead`, {
      durable: true,
      arguments: { 'x-queue-type': 'quorum' },
    });
    await channel.bindQueue(`${queue}.retry`, exchanges.retry, queue);
    await channel.bindQueue(`${queue}.dead`, exchanges.dead, queue);
    await channel.bindQueue(queue, exchanges.ready, queue);
    for (const type of bindings) await channel.bindQueue(queue, exchanges.main, type);
  }
}

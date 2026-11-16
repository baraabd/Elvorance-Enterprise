import test from 'node:test';
import assert from 'node:assert/strict';
import { provisionTopology, serviceBindings, exchanges, type TopologyChannel } from '@elvorance/events';

test('producer startup creates durable queues for all subscribers before publish, including a never-started delivery consumer', async () => {
  const queues = new Map<string, { durable: boolean; arguments: Record<string, unknown> }>();
  const bindings: { queue: string; exchange: string; routingKey: string }[] = [];
  const channel: TopologyChannel = {
    async assertExchange() {
      return { exchange: 'declared' };
    },
    async assertQueue(name, options) {
      queues.set(name, {
        durable: Boolean(options?.durable),
        arguments: options?.arguments as Record<string, unknown>,
      });
      return { queue: name, messageCount: 0, consumerCount: 0 };
    },
    async bindQueue(queue, exchange, routingKey) {
      assert.ok(queues.has(queue));
      bindings.push({ queue, exchange, routingKey });
      return {};
    },
  };
  // The broker has no consumers at all. The producer still provisions every target queue.
  await provisionTopology(channel);
  const contractTargets = bindings
    .filter(
      (binding) =>
        binding.exchange === exchanges.main && binding.routingKey === 'contract.approved.v1',
    )
    .map((binding) => binding.queue)
    .sort();
  assert.deepEqual(contractTargets, [
    'atlas.billing.v1',
    'atlas.communications.v1',
    'atlas.delivery.v1',
  ]);
  for (const queue of contractTargets) {
    assert.equal(queues.get(queue)?.durable, true);
    assert.equal(queues.get(queue)?.arguments['x-queue-type'], 'quorum');
  }
  assert.ok(queues.has('atlas.delivery.v1.retry'));
  assert.ok(queues.has('atlas.delivery.v1.dead'));
  const messages = new Map(contractTargets.map((queue) => [queue, ['contract-approved-event']]));
  // Billing starts first; reading its own durable queue cannot consume delivery's copy.
  messages.get('atlas.billing.v1')!.shift();
  assert.deepEqual(messages.get('atlas.delivery.v1'), ['contract-approved-event']);
  assert.deepEqual(serviceBindings.delivery, ['contract.approved.v1']);
  assert.equal(
    bindings.some(
      (binding) => binding.queue === 'atlas.delivery.v1' && binding.exchange === exchanges.ready,
    ),
    true,
  );
});

import amqp, { type ConfirmChannel, type ChannelModel, type ConsumeMessage } from 'amqplib';
import { provisionTopology, serviceBindings } from './topology.ts';
export { provisionTopology, serviceBindings, exchanges, type TopologyChannel } from './topology.ts';
import type { EventEnvelope } from '@atlas/contracts';
import {
  AppError,
  assert,
  object,
  text,
  integer,
  type Repository,
  type Transaction,
} from '@atlas/service-kit';
export type EventHandler = (tx: Transaction, event: EventEnvelope) => Promise<void>;
export function parseEnvelope(input: unknown): EventEnvelope {
  const value = object(input);
  assert(value.schemaVersion === 1, 'EVENT_VERSION', 'Unsupported event schema version');
  const occurredAt = text(value.occurredAt, 'occurredAt', 20, 40);
  assert(Number.isFinite(Date.parse(occurredAt)), 'EVENT_DATE', 'Event date is invalid');
  return {
    id: text(value.id, 'event.id', 1, 100),
    type: text(value.type, 'event.type', 1, 150),
    schemaVersion: 1,
    source: text(value.source, 'event.source', 1, 80),
    tenantId: text(value.tenantId, 'event.tenantId', 1, 100),
    aggregateId: text(value.aggregateId, 'event.aggregateId', 1, 100),
    aggregateVersion: integer(value.aggregateVersion, 'event.aggregateVersion', 1),
    occurredAt,
    correlationId: text(value.correlationId, 'event.correlationId', 1, 100),
    payload: value.payload,
  };
}
/** Inbox claim, business writes, and new outbox messages commit together. Ack belongs to the caller after this resolves. */
export async function consumeEvent(
  repository: Repository,
  consumer: string,
  input: unknown,
  handler: EventHandler,
): Promise<'processed' | 'duplicate'> {
  const event = parseEnvelope(input);
  return repository.transaction(event.tenantId, async (tx) => {
    if (!(await tx.claimInbox(consumer, event))) return 'duplicate';
    await handler(tx, event);
    return 'processed';
  });
}
export interface EventRuntime {
  isReady(): boolean;
  close(): Promise<void>;
}
interface RuntimeOptions {
  repository: Repository;
  subscriptions: readonly string[];
  handler: EventHandler;
  url?: string;
  log?: (message: string) => void;
}
const MAIN = 'atlas.events';
const RETRY = 'atlas.events.retry';
const READY = 'atlas.events.retry.ready';
const DEAD = 'atlas.events.dead';
async function confirmed(
  channel: ConfirmChannel,
  exchange: string,
  routingKey: string,
  body: Buffer,
  messageId: string,
  headers: Record<string, unknown> = {},
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let returned = false;
    const onReturn = (message: ConsumeMessage): void => {
      if (message.properties.messageId === messageId) returned = true;
    };
    const timeout = setTimeout(() => {
      channel.removeListener('return', onReturn);
      reject(new Error('Publisher confirmation timed out'));
    }, 10_000);
    channel.on('return', onReturn);
    channel.publish(
      exchange,
      routingKey,
      body,
      { persistent: true, contentType: 'application/json', messageId, mandatory: true, headers },
      (error) => {
        clearTimeout(timeout);
        channel.removeListener('return', onReturn);
        if (error || returned) reject(error ?? new Error('No bound consumer queue for event'));
        else resolve();
      },
    );
  });
}
/** Durable RabbitMQ topology. Delivery is at least once; transactional inbox removes duplicate side effects. */
export function startEventRuntime(options: RuntimeOptions): EventRuntime {
  let connection: ChannelModel | undefined;
  let publisher: ConfirmChannel | undefined;
  let ready = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const queue = `atlas.${options.repository.serviceName}.v1`;
  const log = options.log ?? (() => {});
  const schedule = (delay: number): void => {
    if (!stopped)
      timer = setTimeout(() => {
        void tick();
      }, delay);
  };
  const disconnect = async (): Promise<void> => {
    ready = false;
    publisher = undefined;
    const previous = connection;
    connection = undefined;
    try {
      await previous?.close();
    } catch {
      /* connection is already down */
    }
  };
  const connect = async (): Promise<void> => {
    const expectedBindings = serviceBindings[options.repository.serviceName];
    assert(
      expectedBindings &&
        JSON.stringify([...expectedBindings].sort()) ===
          JSON.stringify([...options.subscriptions].sort()),
      'BROKER_TOPOLOGY',
      'Consumer subscriptions must match the declared durable topology',
      500,
    );
    const url = options.url ?? process.env.RABBITMQ_URL;
    assert(url, 'BROKER_CONFIG', 'RABBITMQ_URL is required for the event worker', 503);
    connection = await amqp.connect(url, { timeout: 5000 });
    connection.on('error', () => {
      ready = false;
    });
    connection.on('close', () => {
      ready = false;
      publisher = undefined;
      connection = undefined;
    });
    publisher = await connection.createConfirmChannel();
    const consumer = await connection.createChannel();
    publisher.on('error', () => {
      ready = false;
    });
    consumer.on('error', () => {
      ready = false;
    });
    await provisionTopology(publisher);
    if (options.subscriptions.length) {
      await consumer.prefetch(10);
      await consumer.consume(queue, (message) => {
        if (!message) return;
        void (async () => {
          try {
            await consumeEvent(
              options.repository,
              queue,
              JSON.parse(message.content.toString('utf8')),
              options.handler,
            );
            consumer.ack(message);
          } catch (error) {
            const attempt = Number(message.properties.headers?.['x-atlas-retry'] ?? 0);
            const permanent =
              error instanceof SyntaxError || (error instanceof AppError && error.statusCode < 500);
            try {
              if (!publisher) throw new Error('Publisher disconnected');
              await confirmed(
                publisher,
                permanent || attempt >= 4 ? DEAD : RETRY,
                queue,
                message.content,
                message.properties.messageId ?? 'unknown',
                {
                  ...message.properties.headers,
                  'x-atlas-retry': attempt + 1,
                  'x-atlas-original-type': message.fields.routingKey,
                },
              );
              consumer.ack(message);
            } catch {
              try {
                consumer.nack(message, false, true);
              } catch {
                /* broker redelivers unacked messages */
              }
            }
            log(
              permanent || attempt >= 4
                ? 'Event moved to dead-letter queue; operator review is required'
                : 'Event scheduled for retry',
            );
          }
        })();
      });
    }
    ready = true;
  };
  const tick = async (): Promise<void> => {
    try {
      if (!connection || !publisher || !ready) {
        await disconnect();
        await connect();
      }
      const channel = publisher!;
      for (const row of await options.repository.leaseOutbox(50)) {
        try {
          await confirmed(
            channel,
            MAIN,
            row.event.type,
            Buffer.from(JSON.stringify(row.event)),
            row.event.id,
          );
          await options.repository.markPublished(row.event.id, row.leaseToken);
        } catch {
          await options.repository.releaseOutbox(
            row.event.id,
            row.leaseToken,
            'Broker publish was not confirmed',
          );
          throw new Error('Outbox publish unavailable');
        }
      }
      schedule(1000);
    } catch {
      log('Event transport unavailable; outbox remains persisted and will retry');
      await disconnect();
      schedule(5000);
    }
  };
  schedule(0);
  return {
    isReady: () => ready,
    async close() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await disconnect();
    },
  };
}

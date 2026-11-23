import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { CatalogSnapshot, EventEnvelope } from '@elvorance/contracts';
import type { ServiceRequest } from '../../services/sales/src/application/service-requests.ts';

interface RequestOptions {
  token?: string;
  body?: unknown;
  key?: string;
  status?: number;
}
interface Gateway {
  request<T>(method: string, path: string, options?: RequestOptions): Promise<T>;
}
interface BrokerMessage {
  payload: string;
  properties: { message_id?: string; headers?: Record<string, unknown> };
}
/** Destructive fault injection is restricted to the disposable loopback Compose CI fixture. */
export function sprint04Faults(env: NodeJS.ProcessEnv, tenantId: string) {
  const project = env.COMPOSE_PROJECT_NAME ?? '';
  assert.equal(env.CI, 'true');
  assert.ok(project);
  assert.ok(!env.DOCKER_HOST && (!env.DOCKER_CONTEXT || env.DOCKER_CONTEXT === 'default'));
  const target = new URL(env.RUNTIME_GATEWAY_URL ?? `http://127.0.0.1:${env.GATEWAY_PORT ?? 3000}`);
  assert.ok(
    target.protocol === 'http:' &&
      ['127.0.0.1', '[::1]'].includes(target.hostname) &&
      !target.username &&
      !target.password &&
      target.pathname === '/' &&
      !target.search &&
      !target.hash,
  );
  assert.match(project ?? '', /^elvorance-runtime-[0-9]+-[0-9]+$/);
  assert.match(tenantId, /^ci-runtime-[a-f0-9-]{36}$/);
  assert.equal(env.AUTH_MODE, 'dev-hs256');
  assert.notEqual(env.NODE_ENV, 'production');
  assert.equal(env.RABBITMQ_MANAGEMENT_BIND_HOST ?? '127.0.0.1', '127.0.0.1');
  const port = Number(env.RABBITMQ_MANAGEMENT_PORT ?? '15672');
  assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
  assert.ok(env.RABBITMQ_PASSWORD);
  const base = `http://127.0.0.1:${port}/api`;
  const authorization = `Basic ${Buffer.from(`${env.RABBITMQ_USER ?? 'atlas'}:${env.RABBITMQ_PASSWORD}`).toString('base64')}`;
  function compose(args: string[]): string {
    const run = spawnSync(
      'docker',
      [
        'compose',
        '--project-name',
        project,
        '--env-file',
        'infra/compose/.env',
        '-f',
        'infra/compose/compose.yaml',
        ...args,
      ],
      {
        encoding: 'utf8',
        timeout: 45_000,
        maxBuffer: 2 * 1024 * 1024,
      },
    );
    // Do not leak command stdout/stderr or the environment in failures.
    assert.equal(run.status, 0, 'Isolated Compose fault-injection command failed');
    return run.stdout.trim();
  }
  function sql(
    service: 'sales' | 'billing' | 'delivery' | 'communications',
    statement: string,
  ): string {
    return compose([
      'exec',
      '-T',
      'postgres',
      'psql',
      '-X',
      '-U',
      'postgres',
      '-d',
      `atlas_${service}`,
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      statement,
    ]);
  }
  async function broker<T>(method: string, path: string, body?: unknown): Promise<T> {
    assert.ok(path.startsWith('/') && !path.includes('..'));
    const response = await fetch(base + path, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: { authorization, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.ok(response.ok, `Isolated broker diagnostic failed (${response.status})`);
    return (await response.json()) as T;
  }
  async function until<T>(
    name: string,
    read: () => Promise<T>,
    ready: (value: T) => boolean,
  ): Promise<T> {
    const deadline = Date.now() + 120_000;
    do {
      const value = await read();
      if (ready(value)) return value;
      await delay(500);
    } while (Date.now() < deadline);
    throw new Error(`Isolated fixture did not recover: ${name}`);
  }
  async function messages(queue: string): Promise<BrokerMessage[]> {
    return broker('POST', `/queues/atlas/${encodeURIComponent(queue)}/get`, {
      count: 20,
      ackmode: 'ack_requeue_true',
      encoding: 'auto',
    });
  }
  async function publish(event: EventEnvelope): Promise<void> {
    const result = await broker<{ routed: boolean }>(
      'PUT',
      '/exchanges/atlas/atlas.events/publish',
      {
        properties: { message_id: event.id, delivery_mode: 2, content_type: 'application/json' },
        routing_key: event.type,
        payload: JSON.stringify(event),
        payload_encoding: 'string',
      },
    );
    assert.equal(result.routed, true);
  }
  return {
    async duringBillingFailure<T>(approve: () => Promise<T>): Promise<T> {
      sql(
        'billing',
        `CREATE FUNCTION sprint04_invoice_fault() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.tenant_id='${tenantId}' THEN RAISE EXCEPTION 'CI serialization fault' USING ERRCODE='40001'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER sprint04_invoice_fault BEFORE INSERT ON invoices FOR EACH ROW EXECUTE FUNCTION sprint04_invoice_fault();`,
      );
      try {
        const result = await approve();
        const retry = await until(
          'actual RabbitMQ transient retry',
          () => messages('atlas.billing.v1.retry'),
          (rows) => rows.some((row) => Number(row.properties.headers?.['x-elvorance-retry']) >= 1),
        );
        assert.ok(retry.length > 0);
        assert.equal(
          sql('billing', `SELECT count(*) FROM contract_accounts WHERE tenant_id='${tenantId}'`),
          '0',
        );
        assert.equal(
          sql('billing', `SELECT count(*) FROM invoices WHERE tenant_id='${tenantId}'`),
          '0',
        );
        assert.equal(
          sql('billing', `SELECT count(*) FROM inbox WHERE tenant_id='${tenantId}'`),
          '0',
          'Consumer failure must roll back the inbox claim too',
        );
        await until(
          'independent delivery succeeds while billing fails',
          async () =>
            sql('delivery', `SELECT count(*) FROM projects WHERE tenant_id='${tenantId}'`),
          (count) => count === '1',
        );
        const fulfillment = JSON.parse(
          sql('sales', `SELECT data FROM fulfillments WHERE tenant_id='${tenantId}'`),
        ) as { invoicesStatus: string };
        assert.equal(fulfillment.invoicesStatus, 'pending');
        return result;
      } finally {
        sql(
          'billing',
          'DROP TRIGGER IF EXISTS sprint04_invoice_fault ON invoices; DROP FUNCTION IF EXISTS sprint04_invoice_fault();',
        );
      }
    },
    async verifyBrokerRecovery(http: Gateway, client: string): Promise<void> {
      const catalog = await http.request<CatalogSnapshot>('GET', '/v1/crm/catalog', {
        token: client,
      });
      const input = {
        serviceId: 'ci-web',
        catalogVersion: catalog.recordVersion,
        currency: catalog.currency,
        title: 'CI broker outage request',
        brief: 'Synthetic customer request persists while the broker is stopped.',
        budgetMinor: 20000,
        deadline: null,
      };
      let request: ServiceRequest | undefined;
      compose(['stop', 'rabbitmq']);
      try {
        request = await http.request<ServiceRequest>('POST', '/v1/sales/service-requests', {
          token: client,
          body: input,
        });
        assert.equal(request.status, 'submitted');
        assert.match(request.id, /^[a-f0-9-]{36}$/);
        assert.equal(
          sql(
            'sales',
            `SELECT count(*) FROM outbox WHERE tenant_id='${tenantId}' AND event->>'aggregateId'='${request.id}' AND published_at IS NULL`,
          ),
          '1',
        );
      } finally {
        compose(['start', 'rabbitmq']);
      }
      await until(
        'broker restart',
        async () => {
          try {
            await broker('GET', '/overview');
            return true;
          } catch {
            return false;
          }
        },
        Boolean,
      );
      assert.ok(request);
      const id = request.id;
      await until(
        'durable outbox drain after restart',
        async () =>
          sql(
            'sales',
            `SELECT count(*) FROM outbox WHERE tenant_id='${tenantId}' AND event->>'aggregateId'='${id}' AND published_at IS NULL`,
          ),
        (count) => count === '0',
      );
      const event = JSON.parse(
        sql(
          'sales',
          `SELECT event FROM outbox WHERE tenant_id='${tenantId}' AND event->>'aggregateId'='${id}'`,
        ),
      ) as EventEnvelope;
      assert.match(event.id, /^[a-f0-9-]{36}$/);
      await until(
        'notification after recovery',
        async () =>
          sql(
            'communications',
            `SELECT count(*) FROM notifications WHERE tenant_id='${tenantId}' AND data->>'eventId'='${event.id}'`,
          ),
        (count) => count === '1',
      );
      const persisted = await http.request<ServiceRequest>(
        'GET',
        `/v1/sales/service-requests/${id}`,
        { token: client },
      );
      assert.equal(persisted.id, id);
      assert.equal(persisted.version, 1);
      await publish(event);
      await publish(event);
      // Inspect real consumer acknowledgements, not just publisher acceptance.
      await delay(6000);
      await until(
        'duplicate deliveries acknowledged',
        () => broker<{ messages: number }>('GET', '/queues/atlas/atlas.communications.v1'),
        (queue) => queue.messages === 0,
      );
      assert.equal(
        sql(
          'communications',
          `SELECT count(*) FROM notifications WHERE tenant_id='${tenantId}' AND data->>'eventId'='${event.id}'`,
        ),
        '1',
      );
      assert.equal(
        sql(
          'communications',
          `SELECT count(*) FROM inbox WHERE tenant_id='${tenantId}' AND event_id='${event.id}'`,
        ),
        '1',
      );

      const poisonId = randomUUID();
      const poison: EventEnvelope = {
        ...event,
        id: poisonId,
        type: 'contract.approved.v1',
        source: 'sales',
        aggregateId: poisonId,
        payload: { contractId: poisonId, totalMinor: 0 },
      };
      await publish(poison);
      const dead = await until(
        'permanent poison message dead-lettered',
        () => messages('atlas.billing.v1.dead'),
        (rows) => rows.some((row) => row.properties.message_id === poisonId),
      );
      const rejected = dead.find((row) => row.properties.message_id === poisonId);
      assert.ok(rejected);
      assert.equal(rejected.properties.headers?.['x-elvorance-retry'], 1);
      assert.equal(
        sql(
          'billing',
          `SELECT count(*) FROM inbox WHERE tenant_id='${tenantId}' AND event_id='${poisonId}'`,
        ),
        '0',
      );
      assert.equal(
        sql(
          'billing',
          `SELECT count(*) FROM contract_accounts WHERE tenant_id='${tenantId}' AND id='${poisonId}'`,
        ),
        '0',
      );
      assert.equal(
        sql('billing', `SELECT count(*) FROM invoices WHERE tenant_id='${tenantId}'`),
        '2',
      );
      assert.equal(
        sql('delivery', `SELECT count(*) FROM projects WHERE tenant_id='${tenantId}'`),
        '1',
      );
    },
  };
}

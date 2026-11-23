/** Test adapter. Runtime boot never silently falls back to this repository. */
import type { Entity, EventEnvelope } from '@elvorance/contracts';
import { assert } from './errors.ts';
import { pageResult, validatePage, type PageOptions } from './pagination.ts';
import {
  envelope,
  fingerprint,
  newId,
  now,
  type Filter,
  type OutboxRow,
  type Repository,
  type Transaction,
} from './repository.ts';
interface State {
  tables: Record<string, Record<string, Entity>>;
  inbox: string[];
  commands: Record<string, { hash: string; result: unknown }>;
  outbox: Record<
    string,
    {
      event: EventEnvelope;
      published: boolean;
      attempts: number;
      leaseToken: string;
      leasedAt: number;
    }
  >;
}
export class MemoryRepository implements Repository {
  private state: State;
  private tail: Promise<void> = Promise.resolve();
  constructor(
    public readonly serviceName: string,
    public readonly tables: readonly string[],
  ) {
    this.state = {
      tables: Object.fromEntries(tables.map((name) => [name, {}])),
      inbox: [],
      commands: {},
      outbox: {},
    };
  }
  async transaction<T>(tenantId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
    assert(Boolean(tenantId), 'TENANT_REQUIRED', 'A verified tenant is required', 401);
    let unlock!: () => void;
    const previous = this.tail;
    this.tail = new Promise((resolve) => {
      unlock = resolve;
    });
    await previous;
    const draft = structuredClone(this.state);
    const bucket = (table: string): Record<string, Entity> => {
      assert(
        this.tables.includes(table),
        'INVALID_TABLE',
        'Repository table is not owned by this service',
        500,
      );
      return draft.tables[table]!;
    };
    const scopedKey = (id: string): string => `${tenantId}:${id}`;
    const tx: Transaction = {
      tenantId,
      async get<T extends Entity>(table: string, id: string) {
        return structuredClone(bucket(table)[scopedKey(id)] as T | undefined);
      },
      async list<T extends Entity>(table: string, filter: Filter = {}) {
        return structuredClone(
          Object.values(bucket(table)).filter(
            (value) =>
              value.tenantId === tenantId &&
              Object.entries(filter).every(
                ([key, expected]) =>
                  (value as unknown as Record<string, unknown>)[key] === expected,
              ),
          ),
        ) as T[];
      },
      async insert<T extends Entity>(table: string, input: object) {
        const raw = input as Record<string, unknown>;
        const id = typeof raw.id === 'string' ? raw.id : newId();
        assert(!bucket(table)[scopedKey(id)], 'DUPLICATE_RESOURCE', 'Resource already exists', 409);
        const value = {
          ...structuredClone(input),
          id,
          tenantId,
          version: 1,
          createdAt: now(),
          updatedAt: now(),
        } as T;
        bucket(table)[scopedKey(id)] = value;
        return structuredClone(value);
      },
      async sequencePage<T extends Entity & { sequence: number }>(
        table: string,
        filter: Filter,
        after: number,
        limit: number,
      ) {
        assert(
          Number.isSafeInteger(after) &&
            after >= 0 &&
            Number.isSafeInteger(limit) &&
            limit >= 1 &&
            limit <= 201,
          'INVALID_PAGE',
          'Invalid pagination parameters',
        );
        return structuredClone(
          Object.values(bucket(table))
            .filter(
              (entry) =>
                entry.tenantId === tenantId &&
                Object.entries(filter).every(
                  ([key, expected]) =>
                    (entry as unknown as Record<string, unknown>)[key] === expected,
                ),
            )
            .map((entry) => entry as T)
            .filter((entry) => entry.sequence > after)
            .sort((a, b) => a.sequence - b.sequence)
            .slice(0, limit),
        );
      },
      async page<T extends Entity>(table: string, options: PageOptions) {
        validatePage(options);
        const matches = (value: Entity, filter: Filter) =>
          Object.entries(filter).every(
            ([key, expected]) => (value as unknown as Record<string, unknown>)[key] === expected,
          );
        const rows = Object.values(bucket(table))
          .filter(
            (value) =>
              value.tenantId === tenantId &&
              (!options.after || value.id > options.after) &&
              options.scopes.some(
                (scope) =>
                  matches(value, scope.equals) &&
                  (!scope.notEquals || !matches(value, scope.notEquals)),
              ),
          )
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
          .slice(0, options.limit + 1) as T[];
        return structuredClone(pageResult(rows, options.limit));
      },
      async replace<T extends Entity>(table: string, value: T, expectedVersion: number) {
        const existing = bucket(table)[scopedKey(value.id)];
        assert(existing, 'NOT_FOUND', 'Resource was not found', 404);
        assert(
          existing.version === expectedVersion,
          'VERSION_CONFLICT',
          'The resource changed; reload its current version',
          409,
        );
        const next = {
          ...structuredClone(value),
          tenantId,
          version: expectedVersion + 1,
          createdAt: existing.createdAt,
          updatedAt: now(),
        };
        bucket(table)[scopedKey(value.id)] = next;
        return structuredClone(next);
      },
      emit: async (type, aggregateId, aggregateVersion, payload, correlationId) => {
        const event = envelope(
          this.serviceName,
          tenantId,
          type,
          aggregateId,
          aggregateVersion,
          payload,
          correlationId,
        );
        draft.outbox[event.id] = {
          event,
          published: false,
          attempts: 0,
          leaseToken: '',
          leasedAt: 0,
        };
        return structuredClone(event);
      },
      async claimInbox(consumer, event) {
        assert(event.tenantId === tenantId, 'EVENT_TENANT_MISMATCH', 'Event tenant mismatch', 400);
        const key = `${tenantId}:${consumer}:${event.id}`;
        if (draft.inbox.includes(key)) return false;
        draft.inbox.push(key);
        return true;
      },
      async idempotent<T>(
        actorId: string,
        key: string,
        operation: string,
        input: unknown,
        action: () => Promise<T>,
      ) {
        const commandKey = `${tenantId}:${actorId}:${key}`;
        const hash = fingerprint({ operation, input });
        const existing = draft.commands[commandKey];
        if (existing) {
          assert(
            existing.hash === hash,
            'IDEMPOTENCY_CONFLICT',
            'Idempotency-Key was already used for a different request',
            409,
          );
          return structuredClone(existing.result) as T;
        }
        const result = await action();
        draft.commands[commandKey] = { hash, result: structuredClone(result) };
        return result;
      },
    };
    try {
      const result = await fn(tx);
      this.state = draft;
      return structuredClone(result);
    } finally {
      unlock();
    }
  }
  async ping(): Promise<void> {}
  async close(): Promise<void> {}
  async migrate(): Promise<void> {}
  async leaseOutbox(limit = 100): Promise<OutboxRow[]> {
    const rows = Object.values(this.state.outbox)
      .filter((row) => !row.published && row.leasedAt < Date.now() - 30_000)
      .slice(0, limit);
    for (const row of rows) {
      row.leaseToken = newId();
      row.leasedAt = Date.now();
      row.attempts += 1;
    }
    return structuredClone(
      rows.map((row) => ({ event: row.event, attempts: row.attempts, leaseToken: row.leaseToken })),
    );
  }
  async markPublished(id: string, leaseToken: string): Promise<void> {
    const row = this.state.outbox[id];
    if (row?.leaseToken === leaseToken) row.published = true;
  }
  async releaseOutbox(id: string, leaseToken: string, _reason: string): Promise<void> {
    const row = this.state.outbox[id];
    if (row?.leaseToken === leaseToken) {
      row.leasedAt = 0;
      row.leaseToken = '';
    }
  }
  events(): EventEnvelope[] {
    return structuredClone(Object.values(this.state.outbox).map((row) => row.event));
  }
}

import { createHash, randomUUID } from 'node:crypto';
import type { Entity, EventEnvelope } from '@elvorance/contracts';
import type { PageOptions, PageResult } from './pagination.ts';
export type Filter = Record<string, string | number | boolean | null>;
export interface OutboxRow {
  event: EventEnvelope;
  attempts: number;
  leaseToken: string;
}
export interface Transaction {
  readonly tenantId: string;
  get<T extends Entity>(table: string, id: string): Promise<T | undefined>;
  list<T extends Entity>(table: string, filter?: Filter): Promise<T[]>;
  sequencePage<T extends Entity & { sequence: number }>(
    table: string,
    filter: Filter,
    after: number,
    limit: number,
  ): Promise<T[]>;
  page<T extends Entity>(table: string, options: PageOptions): Promise<PageResult<T>>;
  insert<T extends Entity>(table: string, input: object): Promise<T>;
  replace<T extends Entity>(table: string, value: T, expectedVersion: number): Promise<T>;
  emit(
    type: string,
    aggregateId: string,
    aggregateVersion: number,
    payload: unknown,
    correlationId?: string,
  ): Promise<EventEnvelope>;
  claimInbox(consumer: string, event: EventEnvelope): Promise<boolean>;
  idempotent<T>(
    actorId: string,
    key: string,
    operation: string,
    input: unknown,
    action: () => Promise<T>,
  ): Promise<T>;
}
export interface Repository {
  readonly serviceName: string;
  transaction<T>(tenantId: string, fn: (tx: Transaction) => Promise<T>): Promise<T>;
  ping(): Promise<void>;
  close(): Promise<void>;
  migrate(): Promise<void>;
  leaseOutbox(limit?: number): Promise<OutboxRow[]>;
  markPublished(id: string, leaseToken: string): Promise<void>;
  releaseOutbox(id: string, leaseToken: string, reason: string): Promise<void>;
}
export const newId = (): string => randomUUID();
export const now = (): string => new Date().toISOString();
export function canonical(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}
export const fingerprint = (value: unknown): string =>
  createHash('sha256').update(canonical(value)).digest('hex');
export const envelope = (
  source: string,
  tenantId: string,
  type: string,
  aggregateId: string,
  aggregateVersion: number,
  payload: unknown,
  correlationId?: string,
): EventEnvelope => ({
  id: newId(),
  type,
  schemaVersion: 1,
  source,
  tenantId,
  aggregateId,
  aggregateVersion,
  occurredAt: now(),
  correlationId: correlationId ?? newId(),
  payload: structuredClone(payload),
});

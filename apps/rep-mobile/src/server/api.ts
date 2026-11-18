import { createApiClient, type ClientOptions } from '@elvorance/api-client';
import type { Entity, Principal } from '@elvorance/contracts';

export type RecordValue = Entity & Record<string, unknown>;
export interface RepIdentity {
  principal: Principal;
  profile: RecordValue | null;
}
export const resourcePaths = {
  customers: '/v1/crm/customers',
  regions: '/v1/crm/regions',
  visits: '/v1/sales/visits',
  opportunities: '/v1/sales/opportunities',
  tasks: '/v1/sales/tasks',
  routes: '/v1/sales/routes',
  quotes: '/v1/sales/quotes',
  contracts: '/v1/sales/contracts',
  projects: '/v1/delivery/projects',
  invoices: '/v1/billing/invoices',
  tickets: '/v1/communications/tickets',
  notifications: '/v1/communications/notifications',
  conversations: '/v1/communications/conversations',
} as const;
export type Resource = keyof typeof resourcePaths;
export type Method = 'POST' | 'PATCH' | 'PUT';
export function idPath(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('Invalid resource identifier.');
  return id;
}
export const record = (value: unknown): RecordValue => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof (value as Entity).id !== 'string' ||
    !Number.isInteger((value as Entity).version)
  ) {
    throw new Error('تعذّر قراءة السجل الوارد من الخدمة.');
  }
  return value as RecordValue;
};
export function createRepApi(options: ClientOptions) {
  const http = createApiClient(options);
  // One intent keeps its key after an ambiguous network failure. No account data is persisted.
  const pending = new Map<string, string>();
  async function page(
    resource: Resource,
    cursor: string | null = null,
    signal?: AbortSignal,
  ): Promise<{ items: RecordValue[]; nextCursor: string | null }> {
    const data = await http.get<{ items: unknown[]; nextCursor?: unknown }>(
      resourcePaths[resource],
      { ...(signal ? { signal } : {}), query: { limit: 200, ...(cursor ? { cursor } : {}) } },
    );
    if (
      !Array.isArray(data.items) ||
      (data.nextCursor != null && typeof data.nextCursor !== 'string')
    )
      throw new Error('تعذّر قراءة قائمة السجلات.');
    return {
      items: data.items.map(record),
      nextCursor: typeof data.nextCursor === 'string' ? data.nextCursor : null,
    };
  }
  return {
    get: http.get,
    page,
    async list(resource: Resource, signal?: AbortSignal): Promise<RecordValue[]> {
      const items = new Map<string, RecordValue>();
      const seen = new Set<string>();
      let cursor: string | null = null;
      do {
        const response = await page(resource, cursor, signal);
        for (const item of response.items) items.set(item.id, item);
        cursor = response.nextCursor;
        if (cursor && seen.has(cursor))
          throw new Error('تعذّر تحميل الصفحات التالية. حدّث البيانات.');
        if (cursor) seen.add(cursor);
      } while (cursor && !signal?.aborted);
      if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
      return [...items.values()];
    },
    async mutate<T = RecordValue>(
      method: Method,
      path: string,
      body: unknown,
      signal?: AbortSignal,
    ): Promise<T> {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('الاتصال منقطع. أعد الاتصال ثم احفظ؛ لم تُرسل هذه العملية.');
      }
      const intent = `${method}:${path}:${JSON.stringify(body)}`;
      const key = pending.get(intent) ?? crypto.randomUUID();
      pending.set(intent, key);
      const request = { idempotencyKey: key, ...(signal ? { signal } : {}) };
      const result =
        method === 'POST'
          ? await http.command<T>(path, body, request)
          : method === 'PATCH'
            ? await http.patch<T>(path, body, request)
            : await http.put<T>(path, body, request);
      pending.delete(intent);
      return result;
    },
    clear() {
      pending.clear();
    },
  };
}
export type RepApi = ReturnType<typeof createRepApi>;

import { ApiError, createApiClient, type ClientOptions } from '@elvorance/api-client';
import type { Entity, Principal } from '@elvorance/contracts';

export type Row = Entity & Record<string, unknown>;
export type Method = 'POST' | 'PATCH' | 'PUT';
export const paths = {
  customers: '/v1/crm/customers',
  regions: '/v1/crm/regions',
  users: '/v1/identity/memberships',
  representatives: '/v1/identity/memberships',
  visits: '/v1/sales/visits',
  tasks: '/v1/sales/tasks',
  opportunities: '/v1/sales/opportunities',
  routes: '/v1/sales/routes',
  quotes: '/v1/sales/quotes',
  approvals: '/v1/sales/quote-discount-approvals',
  contracts: '/v1/sales/contracts',
  projects: '/v1/delivery/projects',
  invoices: '/v1/billing/invoices',
  tickets: '/v1/communications/tickets',
  conversations: '/v1/communications/conversations',
  notifications: '/v1/communications/notifications',
} as const;
export type Resource = keyof typeof paths;
export interface Page {
  items: Row[];
  nextCursor: string | null;
}
export function segment(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('معرّف السجل غير صالح.');
  return id;
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ApiError(200, 'invalid_response', 'استجابة الخدمة غير صالحة.');
  return value as Record<string, unknown>;
}
export function row(value: unknown, tenantId?: string): Row {
  const result = object(value);
  if (
    typeof result.id !== 'string' ||
    !Number.isSafeInteger(result.version) ||
    Number(result.version) < 1 ||
    typeof result.tenantId !== 'string' ||
    (tenantId && result.tenantId !== tenantId)
  )
    throw new ApiError(200, 'invalid_response', 'تعذّر التحقق من السجل وهوية المؤسسة.');
  segment(result.id);
  return result as Row;
}
export function createAdminApi(options: ClientOptions, lifetime: AbortSignal) {
  const http = createApiClient(options);
  let principal: Principal | null = null;
  const pending = new Map<string, string>();
  const signal = (current?: AbortSignal) =>
    current ? AbortSignal.any([lifetime, current]) : lifetime;
  async function identity(): Promise<Principal> {
    const identity = await http.get<{ principal: Principal }>('/v1/identity/me', {
      signal: lifetime,
    });
    if (
      !identity.principal ||
      !Array.isArray(identity.principal.roles) ||
      !identity.principal.roles.includes('admin') ||
      typeof identity.principal.tenantId !== 'string'
    )
      throw new ApiError(403, 'forbidden', 'هذه المساحة متاحة لحساب الإدارة فقط.');
    principal = identity.principal;
    return principal;
  }
  function authorized() {
    if (!principal || lifetime.aborted)
      throw new ApiError(401, 'authentication_required', 'يلزم تسجيل الدخول مجددًا.');
    return principal;
  }
  async function get<T>(
    path: string,
    current?: AbortSignal,
    query?: Record<string, string | number>,
  ): Promise<T> {
    authorized();
    return http.get<T>(path, { signal: signal(current), ...(query ? { query } : {}) });
  }
  async function page(
    resource: Resource,
    cursor: string | null = null,
    current?: AbortSignal,
  ): Promise<Page> {
    const actor = authorized();
    const value = object(
      await http.get<unknown>(paths[resource], {
        signal: signal(current),
        query: { limit: 100, ...(cursor ? { cursor } : {}) },
      }),
    );
    if (
      !Array.isArray(value.items) ||
      value.items.length > 100 ||
      (value.nextCursor != null &&
        (typeof value.nextCursor !== 'string' || !/^[a-zA-Z0-9_:-]{1,100}$/.test(value.nextCursor)))
    )
      throw new ApiError(200, 'invalid_response', 'صفحة البيانات غير صالحة.');
    return {
      items: value.items.map((value) => row(value, actor.tenantId)),
      nextCursor: (value.nextCursor as string | null) ?? null,
    };
  }
  async function all(resource: Resource, current?: AbortSignal): Promise<Row[]> {
    const result = new Map<string, Row>();
    const seen = new Set<string>();
    let cursor: string | null = null;
    do {
      const response = await page(resource, cursor, current);
      for (const item of response.items) {
        if (result.has(item.id)) throw new Error('تغيرت القائمة أثناء القراءة. أعد تحميل التقرير.');
        result.set(item.id, item);
      }
      cursor = response.nextCursor;
      if (cursor && (seen.has(cursor) || seen.size >= 99))
        throw new Error('تعذّر حساب إجمالي موثوق ضمن حد القراءة. يلزم تقرير تجميعي من الخادم.');
      if (cursor) seen.add(cursor);
    } while (cursor);
    return [...result.values()];
  }
  return {
    identity,
    get,
    page,
    all,
    /** Read related ledgers/messages fully, never silently omit their later pages. */
    async related(path: string, current?: AbortSignal): Promise<Record<string, unknown>> {
      const actor = authorized();
      const items: Row[] = [];
      const ids = new Set<string>();
      const cursors = new Set<string>();
      let cursor: string | null = null;
      let metadata: Record<string, unknown> = {};
      do {
        const value = object(
          await get(path, current, { limit: 100, ...(cursor ? { cursor } : {}) }),
        );
        if (!Array.isArray(value.items) || value.items.length > 100)
          throw new Error('قائمة السجلات المرتبطة غير صالحة.');
        for (const item of value.items) {
          const value = row(item, actor.tenantId);
          if (ids.has(value.id)) throw new Error('تغيرت التفاصيل أثناء القراءة؛ أعد التحديث.');
          ids.add(value.id);
          items.push(value);
        }
        if (
          value.nextCursor != null &&
          (typeof value.nextCursor !== 'string' ||
            !/^[a-zA-Z0-9_:-]{1,100}$/.test(value.nextCursor))
        )
          throw new Error('مؤشر التفاصيل غير صالح.');
        cursor = typeof value.nextCursor === 'string' ? value.nextCursor : null;
        if (cursor && (cursors.has(cursor) || cursors.size >= 99))
          throw new Error('تجاوزت التفاصيل حد القراءة الموثوقة؛ يلزم تقرير تجميعي.');
        if (cursor) cursors.add(cursor);
        // The first page binds the conversation version used by the form. Concurrent changes
        // are deliberately resolved by the service's optimistic-concurrency check.
        if (Object.keys(metadata).length === 0) metadata = value;
      } while (cursor);
      return { ...metadata, items, nextCursor: null };
    },
    async detail(resource: Resource, id: string, current?: AbortSignal) {
      const value = row(
        await get<unknown>(`${paths[resource]}/${segment(id)}`, current),
        authorized().tenantId,
      );
      if (value.id !== id) throw new Error('أعادت الخدمة سجلًا مختلفًا عن المطلوب.');
      return value;
    },
    async mutate(method: Method, path: string, body: Record<string, unknown>) {
      authorized();
      const intent = `${method}:${path}:${JSON.stringify(body)}`;
      if (pending.size >= 100 && !pending.has(intent))
        throw new Error('تحقق من نتائج العمليات المعلقة قبل إرسال عمليات إضافية.');
      const idempotencyKey = pending.get(intent) ?? crypto.randomUUID();
      pending.set(intent, idempotencyKey);
      const options = { signal: lifetime, idempotencyKey };
      const result =
        method === 'POST'
          ? await http.command<unknown>(path, body, options)
          : method === 'PUT'
            ? await http.put<unknown>(path, body, options)
            : await http.patch<unknown>(path, body, options);
      pending.delete(intent);
      return result;
    },
    clear() {
      principal = null;
      pending.clear();
    },
  };
}
export type AdminApi = ReturnType<typeof createAdminApi>;
export function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return 'انتهت الجلسة. سجّل الدخول مجددًا؛ لم يُستبدل المحتوى ببيانات تجريبية.';
    if (error.status === 403) return 'لا يملك الحساب صلاحية هذه العملية.';
    if (error.status === 409)
      return `تعارض أو قيد أعمال: ${error.message} — أعد قراءة السجل قبل تعديل الطلب؛ لا يُعاد الحفظ تلقائيًا.`;
    if (error.status === 0 || error.status >= 500)
      return 'لم يتأكد نجاح الطلب. أعد المحاولة دون تغيير المدخلات لاستخدام مفتاح العملية نفسه.';
    return error.message;
  }
  return error instanceof Error ? error.message : 'تعذّر تنفيذ العملية. أعد المحاولة.';
}

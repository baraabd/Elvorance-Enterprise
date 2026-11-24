import type { AdminApi, Row, Resource } from './api.ts';
export const metrics = [
  'customers',
  'visits',
  'tasks',
  'opportunities',
  'quotes',
  'approvals',
  'contracts',
  'projects',
  'invoices',
] as const satisfies readonly Resource[];
export interface Metric {
  resource: (typeof metrics)[number];
  count: number;
  states: Record<string, number>;
}
export interface Snapshot {
  capturedAt: string;
  metrics: Metric[];
  invoices: Record<string, { amountMinor: number; paidMinor: number; outstandingMinor: number }>;
}
/** Full bounded traversal, never the first-page length masquerading as a tenant total. */
export async function snapshot(
  api: Pick<AdminApi, 'all'>,
  signal?: AbortSignal,
): Promise<Snapshot> {
  const data = await Promise.all(metrics.map((resource) => api.all(resource, signal)));
  const result: Snapshot = { capturedAt: new Date().toISOString(), metrics: [], invoices: {} };
  data.forEach((rows, index) => {
    const resource = metrics[index];
    if (!resource) throw new Error('Unknown metric index.');
    const states: Record<string, number> = Object.create(null) as Record<string, number>;
    for (const row of rows) {
      const state = String(row.status ?? row.stage ?? 'unspecified');
      states[state] = (states[state] ?? 0) + 1;
    }
    result.metrics.push({ resource, count: rows.length, states });
    if (resource === 'invoices') result.invoices = invoiceTotals(rows);
  });
  return result;
}
export function invoiceTotals(rows: Row[]): Snapshot['invoices'] {
  const result: Snapshot['invoices'] = Object.create(null) as Snapshot['invoices'];
  for (const row of rows) {
    const currency = row.currency;
    if (
      typeof currency !== 'string' ||
      !/^[A-Z]{3}$/.test(currency) ||
      !Number.isSafeInteger(row.amountMinor) ||
      !Number.isSafeInteger(row.paidMinor) ||
      Number(row.paidMinor) < 0 ||
      Number(row.amountMinor) < Number(row.paidMinor)
    )
      throw new Error('تحتوي الفواتير على قيم مالية غير صالحة؛ لم يُعرض إجمالي تقديري.');
    const total = (result[currency] ??= { amountMinor: 0, paidMinor: 0, outstandingMinor: 0 });
    total.amountMinor += Number(row.amountMinor);
    total.paidMinor += Number(row.paidMinor);
    total.outstandingMinor = total.amountMinor - total.paidMinor;
    if (!Object.values(total).every(Number.isSafeInteger))
      throw new Error('تجاوز الإجمالي حد الحساب الدقيق.');
  }
  return result;
}

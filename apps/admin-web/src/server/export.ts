import type { Resource, Row } from './api.ts';
import type { Snapshot } from './reports.ts';

type Cell = string | number | boolean | null | undefined;
/** Quote every cell; spreadsheet formula-looking text is exported as literal text. */
export function csvCell(value: Cell): string {
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new Error('لا يمكن تصدير قيمة عددية غير صالحة.');
  let text = value == null ? '' : String(value);
  if (
    typeof value === 'string' &&
    (/^[\s\uFEFF]*[=+@\-＝＋＠－]/u.test(text) || /^[\t\r\n]/.test(text))
  )
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
function csv(rows: readonly (readonly Cell[])[]): string {
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
const columns = [
  'id',
  'name',
  'title',
  'displayName',
  'customerName',
  'serviceTitle',
  'status',
  'stage',
  'version',
  'clientId',
  'repId',
  'currency',
  'amountMinor',
  'paidMinor',
  'totalMinor',
  'createdAt',
  'updatedAt',
] as const;
export type ExportScope = 'current-page' | 'bounded-all-pages';
/** Export only explicit scalar columns from already authorized, completely read data. */
export function rowsCsv(resource: Resource, rows: readonly Row[], scope: ExportScope): string {
  if (rows.length > 10_000) throw new Error('تجاوز التصدير حد 10,000 سجل؛ لم يُنشأ ملف جزئي.');
  return csv([
    ['resource', 'read_scope', ...columns],
    ...rows.map((row): Cell[] => [
      resource,
      scope,
      ...columns.map((name): Cell => {
        const value = row[name];
        if (value == null) return '';
        if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number')
          return value;
        throw new Error('تتضمن أعمدة التصدير قيمة مركبة غير متوقعة.');
      }),
    ]),
  ]);
}
/** An operational observation, not historical accounting or an atomic cross-service snapshot. */
export function snapshotCsv(value: Snapshot): string {
  if (!Number.isFinite(Date.parse(value.capturedAt))) throw new Error('وقت التقرير غير صالح.');
  const rows: Cell[][] = [
    ['captured_at', 'scope', 'resource', 'metric', 'state', 'currency', 'value'],
  ];
  const scope = 'bounded-current-operational-observation-not-accounting-revenue';
  for (const metric of value.metrics) {
    rows.push([value.capturedAt, scope, metric.resource, 'count', '', '', metric.count]);
    for (const [state, count] of Object.entries(metric.states))
      rows.push([value.capturedAt, scope, metric.resource, 'state_count', state, '', count]);
  }
  for (const [currency, totals] of Object.entries(value.invoices))
    for (const [metric, amount] of Object.entries(totals))
      rows.push([value.capturedAt, scope, 'invoices', metric, '', currency, amount]);
  return csv(rows);
}
export function downloadCsv(doc: Document, filename: string, content: string): void {
  if (!/^elvorance-[a-z0-9-]+\.csv$/.test(filename)) throw new Error('اسم ملف التصدير غير صالح.');
  const win = doc.defaultView;
  if (!win || typeof win.URL.createObjectURL !== 'function')
    throw new Error('هذا المتصفح لا يدعم تنزيل الملف.');
  const url = win.URL.createObjectURL(new win.Blob([content], { type: 'text/csv;charset=utf-8' }));
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  try {
    doc.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    win.setTimeout(() => win.URL.revokeObjectURL(url), 0);
  }
}

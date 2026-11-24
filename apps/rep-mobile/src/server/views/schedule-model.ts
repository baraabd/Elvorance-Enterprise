import type { RecordValue } from '../api.ts';

/** Calendar dates are not instants: do not shift due dates through the device timezone. */
export function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = new Date(value + 'T12:00:00.000Z');
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
}
export function dayInZone(value: unknown, timeZone: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function shiftDay(value: string, amount: number): string {
  if (!validDay(value) || !Number.isSafeInteger(amount)) throw new Error('تاريخ غير صالح.');
  const date = new Date(value + 'T12:00:00.000Z');
  date.setUTCDate(date.getUTCDate() + amount);
  const result = date.toISOString().slice(0, 10);
  if (!validDay(result)) throw new Error('التاريخ خارج النطاق المدعوم.');
  return result;
}
export function dailyAgenda(
  visits: RecordValue[],
  tasks: RecordValue[],
  day: string,
  timeZone: string,
): { visits: RecordValue[]; tasks: RecordValue[] } {
  if (!validDay(day)) throw new Error('اختر تاريخًا صالحًا لجدول العمل.');
  return {
    visits: visits
      .filter((visit) => dayInZone(visit.scheduledAt, timeZone) === day)
      .sort((a, b) => Date.parse(String(a.scheduledAt)) - Date.parse(String(b.scheduledAt))),
    tasks: tasks.filter((task) => task.dueOn === day),
  };
}

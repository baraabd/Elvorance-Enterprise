export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const id = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
export const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const addDays = (n: number | string): string => {
  const d = new Date();
  d.setDate(d.getDate() + Number(n));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function date(
  value: string | number | Date | null | undefined,
  options: { time?: boolean } = {},
): string {
  if (!value) return '—';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-SY', {
    day: 'numeric',
    month: 'short',
    numberingSystem: 'latn',
    ...(options.time ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(d);
}
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw Object.assign(new Error(message), { userMessage: message });
}

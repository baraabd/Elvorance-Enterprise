import { assert } from './errors.ts';
export function object(input: unknown): Record<string, unknown> {
  assert(
    input !== null && typeof input === 'object' && !Array.isArray(input),
    'INVALID_BODY',
    'A JSON object is required',
  );
  return input as Record<string, unknown>;
}
export function text(input: unknown, label: string, min = 1, max = 500): string {
  assert(
    typeof input === 'string' && input.trim().length >= min && input.trim().length <= max,
    'INVALID_FIELD',
    `${label} must contain ${min}–${max} characters`,
  );
  return input.trim();
}
export function optionalText(input: unknown, label: string, max = 500): string {
  return input == null || input === '' ? '' : text(input, label, 1, max);
}
export function integer(
  input: unknown,
  label: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  assert(
    Number.isSafeInteger(input) && Number(input) >= min && Number(input) <= max,
    'INVALID_FIELD',
    `${label} must be an integer between ${min} and ${max}`,
  );
  return Number(input);
}
export function finite(input: unknown, label: string, min: number, max: number): number {
  assert(
    typeof input === 'number' && Number.isFinite(input) && input >= min && input <= max,
    'INVALID_FIELD',
    `${label} is out of range`,
  );
  return input;
}
export function oneOf<T extends string>(input: unknown, values: readonly T[], label: string): T {
  assert(
    typeof input === 'string' && values.includes(input as T),
    'INVALID_FIELD',
    `${label} must be one of ${values.join(', ')}`,
  );
  return input as T;
}
export function array(input: unknown, label: string, max = 100, min = 0): unknown[] {
  assert(
    Array.isArray(input) && input.length >= min && input.length <= max,
    'INVALID_FIELD',
    `${label} must contain ${min}–${max} entries`,
  );
  return input;
}
export function dateOnly(input: unknown, label: string): string | null {
  if (input == null || input === '') return null;
  const value = text(input, label, 10, 10);
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    'INVALID_DATE',
    `${label} must be an ISO date`,
  );
  return value;
}
export function instant(input: unknown, label: string): string {
  const value = text(input, label, 20, 40);
  assert(!Number.isNaN(Date.parse(value)), 'INVALID_DATE', `${label} must be an ISO timestamp`);
  return new Date(value).toISOString();
}
export function version(body: Record<string, unknown>): number {
  return integer(body.expectedVersion, 'expectedVersion', 1);
}
export function bool(input: unknown, label: string): boolean {
  assert(typeof input === 'boolean', 'INVALID_FIELD', `${label} must be a boolean`);
  return input;
}

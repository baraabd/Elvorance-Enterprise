const RESERVED_IDENTIFIERS = new Set(['__proto__', 'prototype', 'constructor']);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isIdentifier(value: unknown, min: number, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length >= min &&
    value.length <= max &&
    /^[a-z0-9_-]+$/i.test(value) &&
    !RESERVED_IDENTIFIERS.has(value)
  );
}

export function isLabel(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.trim().length >= min && value.length <= max;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isBound(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

export function hasOwnValue<T extends string>(
  entries: Record<T, string>,
  value: unknown,
): value is T {
  return typeof value === 'string' && Object.hasOwn(entries, value);
}

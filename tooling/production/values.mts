import { createHash } from 'node:crypto';

/** Dependency-free primitives also used by the fail-closed aggregation job. */
export const digest = (text: string | Uint8Array): string =>
  createHash('sha256').update(text).digest('hex');
export const json = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';

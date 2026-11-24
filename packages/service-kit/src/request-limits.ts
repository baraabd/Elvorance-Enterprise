import { AppError, assert } from './errors.ts';

export interface RequestLimitOptions {
  readonly windowMs?: number;
  readonly perIp?: number;
  readonly perPrincipal?: number;
  readonly maxKeys?: number;
  readonly now?: () => number;
}
interface Window {
  count: number;
  resetAt: number;
}

/** Per-process, bounded fixed windows. Never trust caller-supplied forwarding/identity headers. */
export class RequestLimits {
  readonly #windows = new Map<string, Window>();
  readonly #windowMs: number;
  readonly #perIp: number;
  readonly #perPrincipal: number;
  readonly #maxKeys: number;
  readonly #now: () => number;
  #lastSweep = 0;
  constructor(options: RequestLimitOptions = {}) {
    this.#windowMs = options.windowMs ?? 60_000;
    this.#perIp = options.perIp ?? 600;
    this.#perPrincipal = options.perPrincipal ?? 300;
    this.#maxKeys = options.maxKeys ?? 10_000;
    this.#now = options.now ?? (() => performance.now());
    for (const value of [this.#windowMs, this.#perIp, this.#perPrincipal, this.#maxKeys])
      assert(
        Number.isSafeInteger(value) && value > 0,
        'CONFIGURATION',
        'Invalid request limit',
        500,
      );
  }
  ip(ip: string): void {
    this.#consume(JSON.stringify(['ip', ip]), this.#perIp);
  }
  principal(tenantId: string, subject: string): void {
    this.#consume(JSON.stringify(['principal', tenantId, subject]), this.#perPrincipal);
  }
  get retryAfterSeconds(): number {
    return Math.ceil(this.#windowMs / 1000);
  }
  #consume(key: string, maximum: number): void {
    const now = this.#now();
    if (now - this.#lastSweep >= this.#windowMs) {
      for (const [id, window] of this.#windows) if (window.resetAt <= now) this.#windows.delete(id);
      this.#lastSweep = now;
    }
    let window = this.#windows.get(key);
    if (!window || window.resetAt <= now) {
      // Never evict active entries: rotating keys must not reset somebody else's budget.
      if (!window && this.#windows.size >= this.#maxKeys) {
        throw new AppError(429, 'RATE_LIMITED', 'Request capacity exceeded; retry later');
      }
      window = { count: 0, resetAt: now + this.#windowMs };
      this.#windows.set(key, window);
    }
    if (window.count >= maximum)
      throw new AppError(429, 'RATE_LIMITED', 'Too many requests; retry later');
    window.count += 1;
  }
}

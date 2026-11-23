import { AuthError } from './errors.ts';
import type { ValidatedConfig } from './configuration.ts';
import type { AuthStorage, AuthStorageKey, AuthTransaction, StoredSession } from './types.ts';

const MAX_RECORD_SIZE = 64 * 1024;
const TRANSACTION_TTL_MS = 5 * 60 * 1000;

function record(value: string): Record<string, unknown> {
  if (value.length > MAX_RECORD_SIZE) throw new AuthError('invalid_transaction');
  const parsed: unknown = JSON.parse(value);
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new AuthError('invalid_transaction');
  }
  return parsed as Record<string, unknown>;
}

function matchesBinding(value: Record<string, unknown>, config: ValidatedConfig): boolean {
  return (
    value.version === 1 &&
    value.issuer === config.issuer &&
    value.clientId === config.clientId &&
    value.redirectUri === config.redirectUri &&
    value.environment === config.environment
  );
}

function secret(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 32 * 1024;
}

/** All storage operations are ordered, so logout cannot be overtaken by a late token write. */
export class SessionVault {
  #queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly storage: AuthStorage,
    private readonly config: ValidatedConfig,
    private readonly now: () => number,
  ) {}

  #serial<T>(work: () => Promise<T>): Promise<T> {
    const operation = this.#queue.then(work).catch((error: unknown) => {
      if (error instanceof AuthError) throw error;
      throw new AuthError('secure_storage_unavailable');
    });
    this.#queue = operation.catch(() => undefined);
    return operation;
  }

  async session(): Promise<StoredSession | null> {
    return this.#serial(async () => {
      const raw = await this.storage.get('auth-session');
      if (raw === null) return null;
      try {
        const value = record(raw);
        if (
          !matchesBinding(value, this.config) ||
          !secret(value.refreshToken) ||
          !secret(value.nonce) ||
          !(
            value.authTime === null ||
            (typeof value.authTime === 'number' &&
              Number.isFinite(value.authTime) &&
              value.authTime > 0)
          ) ||
          typeof value.subject !== 'string' ||
          value.subject.length < 1 ||
          value.subject.length > 512
        )
          throw new AuthError('invalid_transaction');
        return value as unknown as StoredSession;
      } catch {
        await this.storage.remove('auth-session');
        return null;
      }
    });
  }

  async transaction(): Promise<AuthTransaction | null> {
    return this.#serial(async () => {
      const raw = await this.storage.get('auth-transaction');
      if (raw === null) return null;
      try {
        const value = record(raw);
        if (
          !matchesBinding(value, this.config) ||
          !secret(value.state) ||
          !secret(value.nonce) ||
          typeof value.codeVerifier !== 'string' ||
          !/^[A-Za-z0-9._~-]{43,128}$/.test(value.codeVerifier) ||
          typeof value.createdAt !== 'number' ||
          !Number.isFinite(value.createdAt) ||
          value.createdAt > this.now() ||
          this.now() - value.createdAt > TRANSACTION_TTL_MS
        )
          throw new AuthError('invalid_transaction');
        return value as unknown as AuthTransaction;
      } catch {
        await this.storage.remove('auth-transaction');
        return null;
      }
    });
  }

  save(
    key: AuthStorageKey,
    value: AuthTransaction | StoredSession,
    current: () => boolean,
  ): Promise<void> {
    return this.#serial(async () => {
      if (!current()) throw new AuthError('operation_cancelled');
      await this.storage.set(key, JSON.stringify(value));
      // A logout can occur while the native bridge is committing this write.
      if (!current()) {
        await this.storage.remove(key);
        throw new AuthError('operation_cancelled');
      }
    });
  }

  remove(key: AuthStorageKey): Promise<void> {
    return this.#serial(() => this.storage.remove(key));
  }

  clear(): Promise<void> {
    return this.#serial(async () => {
      // Try both deletions even if one native operation fails.
      const outcomes = await Promise.allSettled([
        this.storage.remove('auth-session'),
        this.storage.remove('auth-transaction'),
      ]);
      if (outcomes.some((result) => result.status === 'rejected')) {
        throw new AuthError('secure_storage_unavailable');
      }
    });
  }
}

import type { ApiError as WireApiError } from '@atlas/contracts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;
  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined>;
}
export interface CommandOptions extends RequestOptions {
  /** Generate once per user intent and reuse after an uncertain network outcome. */
  idempotencyKey: string;
}
export interface ClientOptions {
  baseUrl: string;
  /** Auth adapter owns PKCE/secure storage. The transport never persists tokens. */
  accessToken: () => Promise<string | null>;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export function createApiClient(options: ClientOptions) {
  const base = new URL(options.baseUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    (base.protocol !== 'https:' && !(base.protocol === 'http:' && local))
  ) {
    throw new Error('API base URL must use HTTPS (HTTP is allowed for loopback development only).');
  }
  const fetcher = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000)
    throw new Error('Invalid API timeout.');

  async function request<T>(
    method: string,
    path: string,
    body: unknown,
    requestOptions: RequestOptions,
    key?: string,
  ): Promise<T> {
    if (!/^\/v1\/[a-zA-Z0-9_/-]+$/.test(path) || path.includes('..') || path.includes('//')) {
      throw new Error('Only relative, versioned API paths are allowed.');
    }
    const url = new URL(base.pathname.replace(/\/$/, '') + path, base.origin);
    for (const [name, value] of Object.entries(requestOptions.query ?? {})) {
      if (value !== undefined) url.searchParams.set(name, String(value));
    }
    const token = await options.accessToken();
    if (!token)
      throw new ApiError(401, 'authentication_required', 'Sign in before accessing company data.');
    if (/\s/.test(token)) throw new Error('Invalid access token.');
    const headers = new Headers({ Accept: 'application/json', Authorization: `Bearer ${token}` });
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    if (key) headers.set('Idempotency-Key', key);
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    const signal = requestOptions.signal
      ? AbortSignal.any([timeout.signal, requestOptions.signal])
      : timeout.signal;
    try {
      const response = await fetcher(url, {
        method,
        headers,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (response.status === 204) return undefined as T;
      const type = response.headers.get('content-type') || '';
      if (!type.includes('application/json'))
        throw new ApiError(
          response.status,
          'invalid_response',
          'The API returned an unexpected response.',
        );
      const data: unknown = await response.json();
      if (!response.ok) {
        const error = (data as Partial<WireApiError> | null)?.error;
        throw new ApiError(
          response.status,
          error?.code || 'request_failed',
          error?.message || 'Request failed.',
          error?.requestId,
        );
      }
      return data as T;
    } catch (error) {
      if (timeout.signal.aborted && !requestOptions.signal?.aborted) {
        throw new ApiError(
          0,
          'timeout',
          'The server did not respond in time. Check command status before retrying.',
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    get<T>(path: string, requestOptions: RequestOptions = {}) {
      return request<T>('GET', path, undefined, requestOptions);
    },
    command<T>(path: string, body: unknown, requestOptions: CommandOptions) {
      if (!/^[\w-]{8,128}$/.test(requestOptions.idempotencyKey))
        throw new Error('A stable idempotency key (8–128 characters) is required.');
      return request<T>('POST', path, body, requestOptions, requestOptions.idempotencyKey);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

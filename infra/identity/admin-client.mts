import { readFile, stat } from 'node:fs/promises';
import type { JsonRecord } from './types.mts';

export function object(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Invalid ${label} response.`);
  return value as JsonRecord;
}

export interface AdminClient {
  get(path: string): Promise<unknown>;
  exists(path: string): Promise<boolean>;
  write(method: 'POST' | 'PUT', path: string, body: unknown): Promise<void>;
  remove(path: string, body?: unknown): Promise<void>;
}

/** Admin tokens stay in the process and are never written into generated realm/app settings. */
export function createAdminClient(
  baseUrl: string,
  token: string,
  fetcher: typeof fetch = fetch,
): AdminClient {
  const base = new URL(baseUrl);
  if (
    base.protocol !== 'https:' ||
    base.origin !== baseUrl.replace(/\/$/, '') ||
    !token ||
    /\s/.test(token)
  ) {
    throw new Error('A dedicated HTTPS identity origin and valid admin token are required.');
  }
  async function request(method: string, path: string, body?: unknown): Promise<Response> {
    if (
      (!path.startsWith('/admin/realms') && !(path === '/admin/serverinfo' && method === 'GET')) ||
      path.includes('..') ||
      path.startsWith('//')
    ) {
      throw new Error('Unsupported identity administration path.');
    }
    const url = new URL(path, base);
    if (url.origin !== base.origin) throw new Error('Identity administration origin mismatch.');
    try {
      return await fetcher(url, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error(
        'Identity administration request failed; check service availability and TLS.',
      );
    }
  }
  function success(response: Response) {
    if (!response.ok || response.redirected)
      throw new Error(`Identity administration rejected the operation (HTTP ${response.status}).`);
  }
  return {
    async exists(path) {
      const response = await request('GET', path);
      if (response.status === 404) return false;
      success(response);
      await response.body?.cancel();
      return true;
    },
    async get(path) {
      const response = await request('GET', path);
      success(response);
      try {
        return await response.json();
      } catch {
        throw new Error('Identity administration returned an invalid JSON response.');
      }
    },
    async write(method, path, body) {
      const response = await request(method, path, body);
      success(response);
      await response.body?.cancel();
    },
    async remove(path, body) {
      const response = await request('DELETE', path, body);
      success(response);
      await response.body?.cancel();
    },
  };
}

export async function adminTokenFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  if (env.KEYCLOAK_ADMIN_TOKEN && env.KEYCLOAK_ADMIN_TOKEN_FILE)
    throw new Error('Specify exactly one admin token source.');
  let token = env.KEYCLOAK_ADMIN_TOKEN;
  if (env.KEYCLOAK_ADMIN_TOKEN_FILE) {
    const info = await stat(env.KEYCLOAK_ADMIN_TOKEN_FILE);
    if (!info.isFile() || (process.platform !== 'win32' && (info.mode & 0o077) !== 0)) {
      throw new Error('Admin token file must be a regular file readable only by its owner.');
    }
    token = (await readFile(env.KEYCLOAK_ADMIN_TOKEN_FILE, 'utf8')).trim();
  }
  if (!token || /\s/.test(token) || token.length > 32_768)
    throw new Error('Provide KEYCLOAK_ADMIN_TOKEN_FILE or KEYCLOAK_ADMIN_TOKEN securely.');
  return token;
}

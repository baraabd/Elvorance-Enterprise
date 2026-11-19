import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { CatalogDirectory, Principal } from '@elvorance/contracts';
import { AppError, type AuthVerifier } from '@elvorance/service-kit';
export const principals: Record<string, Principal> = {
  admin: { sub: 'admin-a', tenantId: 'tenant-a', roles: ['admin'] },
  rep: { sub: 'rep-user-a', tenantId: 'tenant-a', roles: ['rep'], repId: 'rep-a' },
  client: { sub: 'client-user-a', tenantId: 'tenant-a', roles: ['client'], clientId: 'client-a' },
  finance: { sub: 'finance-a', tenantId: 'tenant-a', roles: ['finance'] },
  delivery: { sub: 'delivery-a', tenantId: 'tenant-a', roles: ['delivery'] },
  support: { sub: 'support-a', tenantId: 'tenant-a', roles: ['support'] },
  otherRep: { sub: 'rep-user-b', tenantId: 'tenant-a', roles: ['rep'], repId: 'rep-b' },
  otherClient: {
    sub: 'client-user-b',
    tenantId: 'tenant-a',
    roles: ['client'],
    clientId: 'client-b',
  },
  outsider: { sub: 'admin-b', tenantId: 'tenant-b', roles: ['admin'] },
};
export const auth: AuthVerifier = async (authorization) => {
  const principal = principals[authorization?.replace(/^Bearer /, '') ?? ''];
  if (!principal) throw new AppError(401, 'UNAUTHENTICATED', 'Test identity is missing');
  return structuredClone(principal);
};
export function catalogPrices(prices: Record<string, number>): CatalogDirectory {
  return {
    async getCatalog() {
      return {
        configured: true,
        recordVersion: 1,
        currency: 'SAR',
        items: Object.entries(prices).map(([id, unitPriceMinor]) => ({
          id,
          title: `${id} service`,
          unitPriceMinor,
        })),
      };
    },
  };
}
export async function call(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  url: string,
  token: string,
  body?: unknown,
  key: string = randomUUID(),
) {
  const response = await app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}`, 'idempotency-key': key },
    ...(body === undefined
      ? {}
      : {
          payload: JSON.stringify(body),
          headers: {
            authorization: `Bearer ${token}`,
            'idempotency-key': key,
            'content-type': 'application/json',
          },
        }),
  });
  return { status: response.statusCode, body: response.json() as Record<string, any> };
}

import type { Principal } from '@elvorance/contracts';
import {
  assert,
  bool,
  notFound,
  object,
  requireRole,
  text,
  version,
  type Transaction,
} from '@elvorance/service-kit';
import type { Region } from '../domain/model.ts';
export async function updateRegion(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
): Promise<Region> {
  requireRole(principal, 'admin');
  const body = object(input);
  assert(
    Object.keys(body).every((key) => ['expectedVersion', 'name', 'code', 'active'].includes(key)),
    'UNKNOWN_FIELD',
    'Only region metadata may be changed',
  );
  assert(
    ['name', 'code', 'active'].some((key) => body[key] !== undefined),
    'EMPTY_PATCH',
    'Provide a region change',
  );
  const value = (await tx.get<Region>('regions', id)) ?? notFound('Region');
  return tx.replace<Region>(
    'regions',
    {
      ...value,
      name: body.name === undefined ? value.name : text(body.name, 'name', 2, 150),
      code: body.code === undefined ? value.code : text(body.code, 'code', 1, 30),
      active: body.active === undefined ? value.active : bool(body.active, 'active'),
    },
    version(body),
  );
}

import type { Entity, Principal, Role } from '@elvorance/contracts';
import { hasRole } from './auth.ts';
import { assert } from './errors.ts';
import { integer, object, text } from './validation.ts';
import type { Filter } from './repository.ts';

export interface RowScope {
  equals: Filter;
  notEquals?: Filter;
}
export interface PageOptions {
  scopes: RowScope[];
  after: string | null;
  limit: number;
}
export interface PageResult<T> {
  items: T[];
  nextCursor: string | null;
  limit: number;
}
export function pageOptions(query: unknown, scopes: RowScope[]): PageOptions {
  const params = object(query);
  const after =
    params.cursor == null || params.cursor === '' ? null : text(params.cursor, 'cursor', 1, 100);
  if (after) assert(/^[A-Za-z0-9_:-]+$/.test(after), 'INVALID_CURSOR', 'Invalid list cursor');
  return {
    scopes,
    after,
    limit: params.limit === undefined ? 100 : integer(Number(params.limit), 'limit', 1, 200),
  };
}
export function actorScopes(
  principal: Principal,
  privileged: Role[] = ['admin'],
  clientField: string | false = 'clientId',
): RowScope[] {
  if (hasRole(principal, ...privileged)) return [{ equals: {} }];
  const scopes: RowScope[] = [];
  if (hasRole(principal, 'rep') && principal.repId)
    scopes.push({ equals: { repId: principal.repId } });
  if (clientField && hasRole(principal, 'client') && principal.clientId)
    scopes.push({ equals: { [clientField]: principal.clientId } });
  return scopes;
}
export function pageResult<T extends Entity>(rows: T[], limit: number): PageResult<T> {
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? items.at(-1)!.id : null, limit };
}
export function validatePage(options: PageOptions): void {
  integer(options.limit, 'limit', 1, 200);
  assert(
    options.after === null ||
      (typeof options.after === 'string' && /^[A-Za-z0-9_:-]{1,100}$/.test(options.after)),
    'INVALID_CURSOR',
    'Invalid list cursor',
  );
  assert(
    Array.isArray(options.scopes) && options.scopes.length <= 8,
    'INVALID_SCOPE',
    'Invalid list scope',
    500,
  );
}

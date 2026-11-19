import type { CustomerDirectory, Principal, VisitRoute } from '@elvorance/contracts';
import {
  actorScopes,
  array,
  assert,
  dateOnly,
  notFound,
  object,
  oneOf,
  pageOptions,
  requireRole,
  text,
  version,
  type Transaction,
} from '@elvorance/service-kit';
import type { Visit } from '../domain/model.ts';
import { currentCustomer, repScope } from './assignment.ts';

export async function authorizeRoute(
  tx: Transaction,
  principal: Principal,
  value: VisitRoute,
  directory: CustomerDirectory,
  authorization: string,
): Promise<Visit[]> {
  repScope(principal, value);
  const visits: Visit[] = [];
  for (const id of value.visitIds) {
    const visit = (await tx.get<Visit>('visits', id)) ?? notFound('Route visit');
    assert(
      visit.repId === value.repId,
      'ROUTE_ASSIGNMENT',
      'Every route stop must belong to this representative',
    );
    await currentCustomer(principal, visit.clientId, directory, authorization, value.repId);
    visits.push(visit);
  }
  return visits;
}
export async function getRoute(
  tx: Transaction,
  principal: Principal,
  id: string,
  directory: CustomerDirectory,
  authorization: string,
): Promise<VisitRoute> {
  const result = (await tx.get<VisitRoute>('visit_routes', id)) ?? notFound('Route');
  await authorizeRoute(tx, principal, result, directory, authorization);
  return result;
}
async function routeFields(
  tx: Transaction,
  principal: Principal,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
  current?: VisitRoute,
) {
  const body = object(input);
  const date = dateOnly(body.date ?? current?.date, 'date');
  assert(date, 'ROUTE_DATE', 'A route date is required');
  const visitIds = array(body.visitIds ?? current?.visitIds, 'visitIds', 40, 1).map((id) =>
    text(id, 'visitId', 1, 100),
  );
  assert(
    new Set(visitIds).size === visitIds.length,
    'DUPLICATE_STOP',
    'A visit can only appear once in a route',
  );
  const first = (await tx.get<Visit>('visits', visitIds[0]!)) ?? notFound('Route visit');
  const repId = current?.repId ?? first.repId;
  repScope(principal, { repId });
  const status = oneOf(
    body.status ?? current?.status ?? 'planned',
    ['planned', 'active', 'completed', 'cancelled'] as const,
    'status',
  );
  if (!current) assert(status === 'planned', 'ROUTE_STATE', 'New routes start in planned state');
  if (current)
    assert(
      !['completed', 'cancelled'].includes(current.status),
      'ROUTE_CLOSED',
      'Closed routes cannot be changed',
      409,
    );
  for (const id of visitIds) {
    const visit = (await tx.get<Visit>('visits', id)) ?? notFound('Route visit');
    assert(
      visit.repId === repId && visit.scheduledAt.slice(0, 10) === date,
      'ROUTE_SCOPE',
      'Route stops must belong to one representative and the selected UTC date',
    );
    await currentCustomer(
      principal,
      visit.clientId,
      directory,
      authorization,
      repId,
      !['completed', 'cancelled'].includes(status),
    );
    if (status === 'completed')
      assert(
        ['completed', 'cancelled'].includes(visit.status),
        'ROUTE_INCOMPLETE',
        'Complete or cancel every route visit first',
        409,
      );
  }
  if (!['completed', 'cancelled'].includes(status)) {
    const routes = await tx.list<VisitRoute>('visit_routes', { repId });
    assert(
      !routes.some(
        (route) =>
          route.id !== current?.id &&
          !['completed', 'cancelled'].includes(route.status) &&
          route.visitIds.some((id) => visitIds.includes(id)),
      ),
      'VISIT_ALREADY_ROUTED',
      'A visit already belongs to another open route',
      409,
    );
  }
  return { repId, name: text(body.name ?? current?.name, 'name', 3, 150), date, visitIds, status };
}
export async function createRoute(
  tx: Transaction,
  principal: Principal,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
): Promise<VisitRoute> {
  requireRole(principal, 'rep', 'admin');
  return tx.insert<VisitRoute>(
    'visit_routes',
    await routeFields(tx, principal, input, directory, authorization),
  );
}
export async function updateRoute(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
): Promise<VisitRoute> {
  const current = await getRoute(tx, principal, id, directory, authorization);
  return tx.replace<VisitRoute>(
    'visit_routes',
    { ...current, ...(await routeFields(tx, principal, input, directory, authorization, current)) },
    version(object(input)),
  );
}
export async function listRoutes(tx: Transaction, principal: Principal, query: unknown) {
  requireRole(principal, 'rep', 'admin');
  return tx.page<VisitRoute>(
    'visit_routes',
    pageOptions(query, actorScopes(principal, ['admin'], false)),
  );
}

import type { CustomerDirectory, Principal, VisitRoute } from '@elvorance/contracts';
import {
  assert,
  instant,
  now,
  object,
  optionalText,
  text,
  version,
  type Transaction,
} from '@elvorance/service-kit';
import type { Visit } from '../domain/model.ts';
import { authorizeOwned, ownedRecord } from './assignment.ts';

export async function updateVisit(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
): Promise<Visit> {
  const body = object(input);
  const current = await ownedRecord<Visit>(tx, 'visits', id, principal, directory, authorization);
  assert(
    ['scheduled', 'active'].includes(current.status),
    'VISIT_STATE',
    'Only a scheduled or active visit can be edited',
    409,
  );
  assert(
    body.clientId === undefined && body.repId === undefined && body.status === undefined,
    'IMMUTABLE_ASSIGNMENT',
    'Visit assignment and state use explicit commands',
  );
  if (current.status === 'active')
    assert(
      body.scheduledAt === undefined && body.purpose === undefined,
      'VISIT_STATE',
      'An active visit can only update its notes',
      409,
    );
  await authorizeOwned(
    principal,
    current,
    directory,
    authorization,
    current.status === 'scheduled',
  );
  const scheduledAt =
    body.scheduledAt === undefined ? current.scheduledAt : instant(body.scheduledAt, 'scheduledAt');
  if (scheduledAt.slice(0, 10) !== current.scheduledAt.slice(0, 10)) {
    const routes = await tx.list<VisitRoute>('visit_routes', { repId: current.repId });
    assert(
      !routes.some(
        (route) =>
          !['completed', 'cancelled'].includes(route.status) && route.visitIds.includes(id),
      ),
      'ROUTE_SCHEDULE_CONFLICT',
      'Remove this visit from its open route before changing its date',
      409,
    );
  }
  const result = await tx.replace<Visit>(
    'visits',
    {
      ...current,
      scheduledAt,
      purpose:
        body.purpose === undefined ? current.purpose : text(body.purpose, 'purpose', 3, 2000),
      notes: body.notes === undefined ? current.notes : optionalText(body.notes, 'notes', 5000),
    },
    version(body),
  );
  await tx.emit('sales.visit_rescheduled.v1', result.id, result.version, {
    visitId: id,
    clientId: result.clientId,
    repId: result.repId,
    scheduledAt: result.scheduledAt,
  });
  return result;
}
export async function cancelVisit(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
): Promise<Visit> {
  const body = object(input);
  const current = await ownedRecord<Visit>(tx, 'visits', id, principal, directory, authorization);
  assert(
    ['scheduled', 'active'].includes(current.status),
    'VISIT_STATE',
    'Only a scheduled or active visit can be cancelled',
    409,
  );
  const result = await tx.replace<Visit>(
    'visits',
    {
      ...current,
      status: 'cancelled',
      outcome: 'cancelled_by_rep',
      notes: text(body.reason, 'reason', 3, 1000),
      completedAt: current.status === 'active' ? now() : null,
    },
    version(body),
  );
  await tx.emit('sales.visit_cancelled.v1', result.id, result.version, {
    visitId: id,
    clientId: result.clientId,
    repId: result.repId,
  });
  return result;
}

import type { CustomerDirectory, Principal, RepTask } from '@elvorance/contracts';
import {
  assert,
  dateOnly,
  hasRole,
  now,
  object,
  oneOf,
  optionalText,
  requireRole,
  text,
  version,
  type Transaction,
} from '@elvorance/service-kit';
import { currentCustomer, ownedRecord } from './assignment.ts';

function taskFields(input: unknown, current?: RepTask) {
  const body = object(input);
  const dueOn = dateOnly(body.dueOn ?? current?.dueOn, 'dueOn');
  assert(dueOn, 'DUE_DATE_REQUIRED', 'A task due date is required');
  return {
    title: text(body.title ?? current?.title, 'title', 3, 200),
    dueOn,
    priority: oneOf(
      body.priority ?? current?.priority ?? 'normal',
      ['low', 'normal', 'high'] as const,
      'priority',
    ),
    notes: optionalText(body.notes ?? current?.notes, 'notes', 3000),
  };
}
export async function createTask(
  tx: Transaction,
  principal: Principal,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
): Promise<RepTask> {
  requireRole(principal, 'rep', 'admin');
  const body = object(input);
  const clientId = body.clientId ? text(body.clientId, 'clientId', 1, 100) : null;
  const customer = clientId
    ? await currentCustomer(principal, clientId, directory, authorization, undefined, true)
    : null;
  const repId =
    customer?.repId ??
    (hasRole(principal, 'admin') ? text(body.repId, 'repId', 1, 100) : principal.repId!);
  return tx.insert<RepTask>('tasks', {
    ...taskFields(body),
    clientId,
    customerName: customer?.name ?? null,
    repId,
    status: 'open',
    completedAt: null,
  });
}
export async function updateTask(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
): Promise<RepTask> {
  const body = object(input);
  const current = await ownedRecord<RepTask>(tx, 'tasks', id, principal, directory, authorization);
  assert(
    body.repId === undefined && (body.clientId === undefined || body.clientId === current.clientId),
    'IMMUTABLE_ASSIGNMENT',
    'Task assignment cannot be changed',
  );
  const status = oneOf(
    body.status ?? current.status,
    ['open', 'done', 'cancelled'] as const,
    'status',
  );
  if (status === 'open' && current.clientId)
    await currentCustomer(
      principal,
      current.clientId,
      directory,
      authorization,
      current.repId,
      true,
    );
  const result = await tx.replace<RepTask>(
    'tasks',
    {
      ...current,
      ...taskFields(body, current),
      status,
      completedAt: status === 'done' ? (current.completedAt ?? now()) : null,
    },
    version(body),
  );
  await tx.emit('sales.task_updated.v1', result.id, result.version, {
    taskId: result.id,
    clientId: result.clientId,
    repId: result.repId,
    status: result.status,
  });
  return result;
}

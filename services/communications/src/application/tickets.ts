import type { Principal } from '@atlas/contracts';
import {
  assert,
  hasRole,
  isOwner,
  newId,
  notFound,
  now,
  object,
  oneOf,
  requireRole,
  text,
  version,
  type Transaction,
} from '@atlas/service-kit';
import type { Notification, Ticket } from '../domain/model.ts';
export function visible(
  principal: Principal,
  value: { clientId: string | null; repId: string | null },
): boolean {
  return isOwner(principal, value, ['admin', 'support']);
}
export async function ticket(tx: Transaction, principal: Principal, id: string): Promise<Ticket> {
  const value = (await tx.get<Ticket>('tickets', id)) ?? notFound('Ticket');
  assert(visible(principal, value), 'NOT_FOUND', 'Ticket was not found', 404);
  return value;
}
export async function createTicket(
  tx: Transaction,
  principal: Principal,
  input: unknown,
): Promise<Ticket> {
  requireRole(principal, 'client', 'rep');
  const body = object(input);
  const value = await tx.insert<Ticket>('tickets', {
    clientId: principal.clientId ?? null,
    repId: principal.repId ?? null,
    subject: text(body.subject, 'subject', 3, 200),
    category: oneOf(
      body.category,
      ['billing', 'delivery', 'account', 'general'] as const,
      'category',
    ),
    status: 'open',
    openedBy: principal.sub,
    messages: [
      {
        id: newId(),
        senderId: principal.sub,
        senderRole: principal.roles.includes('client') ? 'client' : 'rep',
        body: text(body.message, 'message', 5, 5000),
        createdAt: now(),
      },
    ],
    resolvedAt: null,
  });
  await tx.emit('communications.ticket_opened.v1', value.id, value.version, {
    ticketId: value.id,
    clientId: value.clientId,
    repId: value.repId,
  });
  return value;
}
export async function replyTicket(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
): Promise<Ticket> {
  const body = object(input);
  const value = await ticket(tx, principal, id);
  assert(
    value.status === 'open',
    'TICKET_CLOSED',
    'Reopen the resolved ticket before replying',
    409,
  );
  assert(value.messages.length < 200, 'MESSAGE_LIMIT', 'Ticket has reached its reply limit');
  return tx.replace<Ticket>(
    'tickets',
    {
      ...value,
      messages: [
        ...value.messages,
        {
          id: newId(),
          senderId: principal.sub,
          senderRole: hasRole(principal, 'admin', 'support')
            ? 'support'
            : principal.roles.includes('client')
              ? 'client'
              : 'rep',
          body: text(body.message, 'message', 1, 5000),
          createdAt: now(),
        },
      ],
    },
    version(body),
  );
}
export async function statusTicket(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
): Promise<Ticket> {
  const body = object(input);
  const value = await ticket(tx, principal, id);
  const status = oneOf(body.status, ['open', 'resolved'] as const, 'status');
  assert(status !== value.status, 'TICKET_STATE', 'Ticket already has the requested status', 409);
  return tx.replace<Ticket>(
    'tickets',
    { ...value, status, resolvedAt: status === 'resolved' ? now() : null },
    version(body),
  );
}
export async function readNotification(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
): Promise<Notification> {
  const body = object(input);
  const value = (await tx.get<Notification>('notifications', id)) ?? notFound('Notification');
  assert(visible(principal, value), 'NOT_FOUND', 'Notification was not found', 404);
  if (value.readBy.includes(principal.sub)) return value;
  return tx.replace<Notification>(
    'notifications',
    { ...value, readBy: [...value.readBy, principal.sub] },
    version(body),
  );
}

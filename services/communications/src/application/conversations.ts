import type {
  Conversation,
  ConversationMessage,
  ConversationReadReceipt,
  CustomerDirectory,
  Principal,
} from '@elvorance/contracts';
import {
  actorScopes,
  AppError,
  assert,
  hasRole,
  integer,
  isOwner,
  notFound,
  now,
  object,
  pageOptions,
  requireRole,
  text,
  version,
  type Transaction,
} from '@elvorance/service-kit';

function senderRole(
  principal: Principal,
  value: { clientId: string; repId: string },
): ConversationMessage['senderRole'] {
  if (hasRole(principal, 'admin')) return 'admin';
  if (hasRole(principal, 'support')) return 'support';
  if (hasRole(principal, 'rep') && principal.repId === value.repId) return 'rep';
  assert(
    hasRole(principal, 'client') && principal.clientId === value.clientId,
    'NOT_FOUND',
    'Conversation was not found',
    404,
  );
  return 'client';
}

export async function authorizeConversation(
  principal: Principal,
  value: Conversation,
  directory: CustomerDirectory,
  authorization: string,
  sending = false,
): Promise<void> {
  requireRole(principal, 'rep', 'client', 'admin', 'support');
  assert(
    isOwner(principal, value, ['admin', 'support']),
    'NOT_FOUND',
    'Conversation was not found',
    404,
  );
  const customer = await directory.getCustomer(value.clientId, authorization);
  const role = senderRole(principal, value);
  if (role === 'rep')
    assert(
      customer.repId === principal.repId && value.repId === principal.repId,
      'NOT_FOUND',
      'Conversation was not found',
      404,
    );
  if (sending && role !== 'client')
    assert(
      !customer.doNotContact,
      'DO_NOT_CONTACT',
      'Customer has opted out of outbound contact',
      409,
    );
  if (sending)
    assert(
      customer.repId === value.repId,
      'CONVERSATION_REASSIGNED',
      'Open the conversation for the current representative',
      409,
    );
}
export async function conversation(
  tx: Transaction,
  principal: Principal,
  id: string,
  directory: CustomerDirectory,
  authorization: string,
): Promise<Conversation> {
  const result = (await tx.get<Conversation>('conversations', id)) ?? notFound('Conversation');
  await authorizeConversation(principal, result, directory, authorization);
  return result;
}
export async function listConversations(
  tx: Transaction,
  principal: Principal,
  directory: CustomerDirectory,
  authorization: string,
  query: unknown,
) {
  requireRole(principal, 'rep', 'client', 'admin', 'support');
  const page = await tx.page<Conversation>(
    'conversations',
    pageOptions(query, actorScopes(principal, ['admin', 'support'])),
  );
  const result: (Conversation & { lastReadSequence: number })[] = [];
  for (const row of page.items) {
    try {
      await authorizeConversation(principal, row, directory, authorization);
    } catch (error) {
      if (error instanceof AppError && [403, 404].includes(error.statusCode)) continue;
      throw error;
    }
    const receipt = (
      await tx.list<ConversationReadReceipt>('conversation_reads', {
        conversationId: row.id,
        subject: principal.sub,
      })
    )[0];
    result.push({ ...row, lastReadSequence: receipt?.lastReadSequence ?? 0 });
  }
  return { ...page, items: result };
}
export async function createConversation(
  tx: Transaction,
  principal: Principal,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
): Promise<Conversation> {
  requireRole(principal, 'rep', 'client', 'admin', 'support');
  const body = object(input);
  const customer = await directory.getCustomer(
    text(body.clientId, 'clientId', 1, 100),
    authorization,
  );
  const context = { clientId: customer.id, repId: customer.repId };
  assert(
    isOwner(principal, context, ['admin', 'support']),
    'NOT_FOUND',
    'Customer was not found',
    404,
  );
  if (senderRole(principal, context) !== 'client')
    assert(
      !customer.doNotContact,
      'DO_NOT_CONTACT',
      'Customer has opted out of outbound contact',
      409,
    );
  const existing = (await tx.list<Conversation>('conversations', context))[0];
  if (existing) return existing;
  return tx.insert<Conversation>('conversations', {
    ...context,
    customerName: customer.name,
    lastMessageId: null,
    lastMessageAt: null,
    messageCount: 0,
  });
}
export async function sendMessage(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
): Promise<{ conversation: Conversation; message: ConversationMessage }> {
  const body = object(input);
  const current = await conversation(tx, principal, id, directory, authorization);
  await authorizeConversation(principal, current, directory, authorization, true);
  assert(
    current.version === version(body),
    'VERSION_CONFLICT',
    'Conversation changed; reload before sending',
    409,
  );
  const message = await tx.insert<ConversationMessage>('conversation_messages', {
    conversationId: id,
    clientId: current.clientId,
    repId: current.repId,
    senderId: principal.sub,
    senderRole: senderRole(principal, current),
    body: text(body.body, 'body', 1, 4000),
    sequence: current.messageCount + 1,
  });
  const updated = await tx.replace<Conversation>(
    'conversations',
    {
      ...current,
      lastMessageId: message.id,
      lastMessageAt: message.createdAt,
      messageCount: message.sequence,
    },
    current.version,
  );
  await tx.emit('communications.message_created.v1', message.id, message.version, {
    conversationId: id,
    messageId: message.id,
    clientId: current.clientId,
    repId: current.repId,
    senderId: principal.sub,
  });
  return { conversation: updated, message };
}
export async function messages(
  tx: Transaction,
  principal: Principal,
  id: string,
  query: unknown,
  directory: CustomerDirectory,
  authorization: string,
) {
  const current = await conversation(tx, principal, id, directory, authorization);
  const params = object(query);
  const cursor = params.cursor ?? '0';
  assert(
    typeof cursor === 'string' && /^(0|[1-9][0-9]{0,15})$/.test(cursor),
    'INVALID_CURSOR',
    'Invalid message cursor',
  );
  const after = integer(Number(cursor), 'cursor', 0);
  const limit = params.limit === undefined ? 100 : integer(Number(params.limit), 'limit', 1, 200);
  const rows = await tx.sequencePage<ConversationMessage>(
    'conversation_messages',
    { conversationId: id },
    after,
    limit + 1,
  );
  const items = rows.slice(0, limit);
  const receipt =
    (
      await tx.list<ConversationReadReceipt>('conversation_reads', {
        conversationId: id,
        subject: principal.sub,
      })
    )[0] ?? null;
  return {
    conversation: current,
    items,
    nextCursor: rows.length > limit ? String(items.at(-1)!.sequence) : null,
    receipt,
  };
}
export async function readConversation(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
): Promise<ConversationReadReceipt> {
  const body = object(input);
  const current = await conversation(tx, principal, id, directory, authorization);
  assert(
    current.version === version(body),
    'VERSION_CONFLICT',
    'Conversation changed; reload before marking messages read',
    409,
  );
  const message =
    (await tx.get<ConversationMessage>(
      'conversation_messages',
      text(body.lastMessageId, 'lastMessageId', 1, 100),
    )) ?? notFound('Message');
  assert(
    message.conversationId === id,
    'NOT_FOUND',
    'Message was not found in this conversation',
    404,
  );
  const receipt = (
    await tx.list<ConversationReadReceipt>('conversation_reads', {
      conversationId: id,
      subject: principal.sub,
    })
  )[0];
  if (receipt && receipt.lastReadSequence >= message.sequence) return receipt;
  const content = {
    conversationId: id,
    subject: principal.sub,
    lastMessageId: message.id,
    lastReadSequence: message.sequence,
    readAt: now(),
  };
  return receipt
    ? tx.replace<ConversationReadReceipt>(
        'conversation_reads',
        { ...receipt, ...content },
        receipt.version,
      )
    : tx.insert<ConversationReadReceipt>('conversation_reads', content);
}

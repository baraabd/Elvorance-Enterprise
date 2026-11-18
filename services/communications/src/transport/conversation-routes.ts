import type { FastifyInstance } from 'fastify';
import type { CustomerDirectory } from '@elvorance/contracts';
import { command, routeId, type Repository } from '@elvorance/service-kit';
import {
  authorizeConversation,
  conversation,
  createConversation,
  listConversations,
  messages,
  readConversation,
  sendMessage,
} from '../application/conversations.ts';
export function registerConversationRoutes(
  app: FastifyInstance,
  repository: Repository,
  directory: CustomerDirectory,
): void {
  app.get('/v1/conversations', async (request) =>
    repository.transaction(request.principal.tenantId, (tx) =>
      listConversations(
        tx,
        request.principal,
        directory,
        request.headers.authorization!,
        request.query,
      ),
    ),
  );
  app.post('/v1/conversations', async (request) =>
    command(
      request,
      repository,
      'communications.createConversation',
      (tx) =>
        createConversation(
          tx,
          request.principal,
          request.body,
          directory,
          request.headers.authorization!,
        ),
      async (_tx, result) =>
        authorizeConversation(request.principal, result, directory, request.headers.authorization!),
    ),
  );
  app.get('/v1/conversations/:id/messages', async (request) =>
    repository.transaction(request.principal.tenantId, (tx) =>
      messages(
        tx,
        request.principal,
        routeId(request),
        request.query,
        directory,
        request.headers.authorization!,
      ),
    ),
  );
  app.post('/v1/conversations/:id/messages', async (request) =>
    command(
      request,
      repository,
      'communications.sendMessage',
      (tx) =>
        sendMessage(
          tx,
          request.principal,
          routeId(request),
          request.body,
          directory,
          request.headers.authorization!,
        ),
      async (_tx, result) =>
        authorizeConversation(
          request.principal,
          result.conversation,
          directory,
          request.headers.authorization!,
        ),
    ),
  );
  app.post('/v1/conversations/:id/read', async (request) =>
    command(
      request,
      repository,
      'communications.readConversation',
      (tx) =>
        readConversation(
          tx,
          request.principal,
          routeId(request),
          request.body,
          directory,
          request.headers.authorization!,
        ),
      async (tx, result) => {
        await conversation(
          tx,
          request.principal,
          result.conversationId,
          directory,
          request.headers.authorization!,
        );
      },
    ),
  );
}

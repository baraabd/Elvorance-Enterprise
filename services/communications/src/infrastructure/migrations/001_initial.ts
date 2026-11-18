import { addOwnedTablesMigration, storageMigration } from '@elvorance/service-kit';
const initialTables = ['notifications', 'tickets'] as const;
const messageTables = ['conversations', 'conversation_messages', 'conversation_reads'] as const;
export const tables = [...initialTables, ...messageTables] as const;
export const migrations = [
  storageMigration(initialTables, ''),
  addOwnedTablesMigration(
    2,
    'customer_conversations',
    messageTables,
    `
  CREATE UNIQUE INDEX conversation_per_assignment ON conversations (tenant_id, (data->>'clientId'), (data->>'repId'));
  CREATE UNIQUE INDEX message_sequence ON conversation_messages (tenant_id, (data->>'conversationId'), ((data->>'sequence')::bigint));
  CREATE UNIQUE INDEX read_receipt_per_subject ON conversation_reads (tenant_id, (data->>'conversationId'), (data->>'subject'));
`,
  ),
];

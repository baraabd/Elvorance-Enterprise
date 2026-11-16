import type { Entity } from '@atlas/contracts';
export interface Notification extends Entity {
  clientId: string | null;
  repId: string | null;
  eventId: string;
  type: string;
  title: string;
  resourceId: string;
  readBy: string[];
}
export interface TicketMessage {
  id: string;
  senderId: string;
  senderRole: string;
  body: string;
  createdAt: string;
}
export interface Ticket extends Entity {
  clientId: string | null;
  repId: string | null;
  subject: string;
  category: 'billing' | 'delivery' | 'account' | 'general';
  status: 'open' | 'resolved';
  openedBy: string;
  messages: TicketMessage[];
  resolvedAt: string | null;
}

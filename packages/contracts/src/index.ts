/** Wire contracts only. Business rules remain inside their owning service. */
export type { ServiceCatalogItem } from './catalog.ts';

export const roles = ['admin', 'rep', 'client', 'finance', 'delivery', 'support'] as const;
export type Role = (typeof roles)[number];
export interface Principal {
  sub: string;
  tenantId: string;
  roles: Role[];
  repId?: string;
  clientId?: string;
}
export interface Entity {
  id: string;
  tenantId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface EventEnvelope<T = unknown> {
  id: string;
  type: string;
  schemaVersion: 1;
  source: string;
  tenantId: string;
  aggregateId: string;
  aggregateVersion: number;
  occurredAt: string;
  correlationId: string;
  causationId?: string;
  payload: T;
}
export interface ScopeItem {
  serviceId: string;
  title: string;
  quantity: number;
  unitPriceMinor: number;
  deliverables: string[];
  duration: string;
}
export interface PaymentInstallment {
  id: string;
  label: string;
  amountMinor: number;
  dueOn: string | null;
}
export interface ContractSnapshot {
  /** Additive v1 fields. Both absent means a legacy undiscounted contract. */
  subtotalMinor?: number;
  discountMinor?: number;
  contractId: string;
  quoteId: string;
  visitId: string;
  clientId: string;
  repId: string;
  customerName: string;
  currency: string;
  items: ScopeItem[];
  totalMinor: number;
  terms: string;
  paymentPlan: PaymentInstallment[];
  approvedAt: string;
  approvedBy: string;
}
export type ContractApproved = EventEnvelope<ContractSnapshot>;
export interface CustomerContext {
  id: string;
  name: string;
  repId: string;
  regionId: string | null;
  doNotContact: boolean;
  consentVersion: number;
  version: number;
}
export interface ApiError {
  error: { code: string; message: string; requestId?: string };
}
export interface CustomerDirectory {
  getCustomer(id: string, authorization: string): Promise<CustomerContext>;
}
export interface CatalogPrice {
  id: string;
  title: string;
  unitPriceMinor: number;
}
export interface CatalogSnapshot {
  configured: boolean;
  recordVersion: number;
  currency: string;
  items: CatalogPrice[];
}
export interface CatalogDirectory {
  getCatalog(authorization: string): Promise<CatalogSnapshot>;
}
export type DiscoveryAnswer = string | number | string[];
export interface DiscoveryRecord extends Entity {
  clientId: string;
  repId: string;
  configurationRevision: number;
  activityId: string;
  answers: Record<string, DiscoveryAnswer>;
  status: 'draft' | 'submitted';
  notes: string;
  savedBy: string;
}
export interface RepresentativeProfile extends Entity {
  subject: string;
  displayName: string;
  phone: string;
  locale: 'ar' | 'en';
  timeZone: string;
}
export interface RepTask extends Entity {
  repId: string;
  clientId: string | null;
  customerName: string | null;
  title: string;
  dueOn: string;
  priority: 'low' | 'normal' | 'high';
  status: 'open' | 'done' | 'cancelled';
  notes: string;
  completedAt: string | null;
}
export interface Opportunity extends Entity {
  repId: string;
  clientId: string;
  customerName: string;
  title: string;
  stage: 'new' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';
  valueMinor: number;
  currency: string;
  expectedCloseOn: string | null;
  notes: string;
  contractId: string | null;
}
export interface VisitRoute extends Entity {
  repId: string;
  name: string;
  date: string;
  visitIds: string[];
  status: 'planned' | 'active' | 'completed' | 'cancelled';
}
export interface Conversation extends Entity {
  clientId: string;
  customerName: string;
  repId: string;
  lastMessageId: string | null;
  lastMessageAt: string | null;
  messageCount: number;
}
export interface ConversationMessage extends Entity {
  conversationId: string;
  clientId: string;
  repId: string;
  senderId: string;
  senderRole: 'rep' | 'client' | 'admin' | 'support';
  body: string;
  sequence: number;
}
export interface ConversationReadReceipt extends Entity {
  conversationId: string;
  subject: string;
  lastMessageId: string;
  lastReadSequence: number;
  readAt: string;
}
export interface ListResult<T> {
  items: T[];
  nextCursor?: string | null;
  limit?: number;
}
export const eventTypes = {
  customerCreated: 'crm.customer_created.v1',
  quoteSent: 'sales.quote_sent.v1',
  quoteAccepted: 'sales.quote_accepted.v1',
  contractApproved: 'contract.approved.v1',
  projectCreated: 'delivery.project_created.v1',
  invoicesCreated: 'billing.invoices_created.v1',
  paymentRecorded: 'billing.payment_recorded.v1',
  ticketOpened: 'communications.ticket_opened.v1',
  messageCreated: 'communications.message_created.v1',
  discountApprovalRequested: 'sales.discount_approval_requested.v1',
  discountApprovalDecided: 'sales.discount_approval_decided.v1',
} as const;

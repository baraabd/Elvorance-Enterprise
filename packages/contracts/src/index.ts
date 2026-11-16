/** Wire contracts only. Business rules remain inside their owning service. */
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
export interface ListResult<T> {
  items: T[];
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
} as const;

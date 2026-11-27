import type { ContractSnapshot, Entity, PaymentInstallment, ScopeItem } from '@elvorance/contracts';
export interface Visit extends Entity {
  clientId: string;
  customerName: string;
  repId: string;
  regionId: string | null;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  scheduledAt: string;
  purpose: string;
  startedAt: string | null;
  completedAt: string | null;
  startProof:
    | { kind: 'gps'; latitude: number; longitude: number; accuracy: number; capturedAt: string }
    | { kind: 'manual'; reason: string }
    | null;
  outcome: string | null;
  notes: string;
  nextStep: string;
  agreementSnapshot: object | null;
}
export interface Quote extends Entity {
  visitId: string;
  clientId: string;
  customerName: string;
  repId: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'changes_requested' | 'cancelled';
  subtotalMinor: number;
  discountMinor: number;
  catalogVersion: number;
  customPricing: boolean;
  currency: string;
  items: ScopeItem[];
  totalMinor: number;
  terms: string;
  paymentPlan: PaymentInstallment[];
  validUntil: string;
  sentAt: string | null;
  acceptedAt: string | null;
  acceptedBy: string | null;
  customerResponse: string;
  revisionOf: string | null;
}
export interface DiscountApproval extends Entity {
  quoteId: string;
  clientId: string;
  repId: string;
  contentHash: string;
  subtotalMinor: number;
  discountMinor: number;
  status: 'pending' | 'approved' | 'rejected' | 'superseded';
  requestedBy: string;
  reason: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string;
}
export interface Contract extends Entity {
  quoteId: string;
  quoteVersion: number;
  visitId: string;
  clientId: string;
  customerName: string;
  repId: string;
  status: 'pending' | 'approved';
  currency: string;
  items: ScopeItem[];
  totalMinor: number;
  terms: string;
  paymentPlan: PaymentInstallment[];
  quoteSnapshot: Quote;
  approvedAt: string | null;
  approvedBy: string | null;
  signerName: string | null;
}
export interface Fulfillment extends Entity {
  contractId: string;
  clientId: string;
  repId: string;
  projectId: string | null;
  invoiceIds: string[];
  projectStatus: 'pending' | 'ready';
  invoicesStatus: 'pending' | 'ready';
}
export const toApprovedSnapshot = (value: Contract): ContractSnapshot => ({
  contractId: value.id,
  quoteId: value.quoteId,
  visitId: value.visitId,
  clientId: value.clientId,
  repId: value.repId,
  customerName: value.customerName,
  currency: value.currency,
  items: structuredClone(value.items),
  // Preserve the approved commercial evidence rather than inferring a discount downstream.
  subtotalMinor: value.quoteSnapshot.subtotalMinor ?? value.totalMinor,
  discountMinor: value.quoteSnapshot.discountMinor ?? 0,
  totalMinor: value.totalMinor,
  terms: value.terms,
  paymentPlan: structuredClone(value.paymentPlan),
  approvedAt: value.approvedAt!,
  approvedBy: value.approvedBy!,
});

export interface CustomerProjection extends Entity {
  customerId: string;
  sourceVersion: number;
  doNotContact: boolean;
  repId: string;
  consentVersion: number;
}

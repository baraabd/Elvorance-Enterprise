import type { ContractSnapshot, Entity } from '@elvorance/contracts';
export interface ContractAccount extends Entity {
  contractId: string;
  clientId: string;
  repId: string;
  currency: string;
  totalMinor: number;
  paidMinor: number;
  contractSnapshot: ContractSnapshot;
}
export interface Invoice extends Entity {
  contractId: string;
  clientId: string;
  repId: string;
  paymentPlanId: string;
  label: string;
  currency: string;
  amountMinor: number;
  paidMinor: number;
  dueOn: string | null;
  status: 'open' | 'part_paid' | 'paid';
}
export interface Payment extends Entity {
  requestId: string;
  invoiceId: string;
  contractId: string;
  clientId: string;
  repId: string;
  amountMinor: number;
  currency: string;
  method: 'bank_transfer' | 'cash' | 'external_provider';
  reference: string;
  recordedBy: string;
  recordedAt: string;
}

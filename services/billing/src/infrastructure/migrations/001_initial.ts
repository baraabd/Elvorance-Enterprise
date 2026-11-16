import { storageMigration } from '@atlas/service-kit';
export const tables = ['contract_accounts', 'invoices', 'payments'] as const;
export const migrations = [
  storageMigration(
    tables,
    "CREATE UNIQUE INDEX one_invoice_per_installment ON invoices (tenant_id, (data->>'contractId'), (data->>'paymentPlanId')); CREATE UNIQUE INDEX one_account_per_contract ON contract_accounts (tenant_id, (data->>'contractId')); CREATE UNIQUE INDEX unique_payment_request ON payments (tenant_id, (data->>'requestId'));",
  ),
];

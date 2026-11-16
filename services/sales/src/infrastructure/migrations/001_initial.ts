import { storageMigration } from '@elvorance/service-kit';
export const tables = [
  'visits',
  'quotes',
  'contracts',
  'fulfillments',
  'customer_contexts',
] as const;
export const migrations = [
  storageMigration(
    tables,
    "CREATE UNIQUE INDEX one_contract_per_quote ON contracts (tenant_id, (data->>'quoteId')); CREATE UNIQUE INDEX one_active_visit_per_rep ON visits (tenant_id, (data->>'repId')) WHERE data->>'status'='active'; CREATE UNIQUE INDEX one_fulfillment_per_contract ON fulfillments (tenant_id, (data->>'contractId'));",
  ),
];

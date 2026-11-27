import { tenantSecurityMigration } from '@elvorance/service-kit';
import { addOwnedTablesMigration, storageMigration } from '@elvorance/service-kit';
const initialTables = [
  'visits',
  'quotes',
  'contracts',
  'fulfillments',
  'customer_contexts',
] as const;
const workTables = ['tasks', 'opportunities', 'visit_routes', 'discount_approvals'] as const;
const requestTables = ['service_requests'] as const;
export const tables = [...initialTables, ...workTables, ...requestTables] as const;
export const migrations = [
  storageMigration(
    initialTables,
    "CREATE UNIQUE INDEX one_contract_per_quote ON contracts (tenant_id, (data->>'quoteId')); CREATE UNIQUE INDEX one_active_visit_per_rep ON visits (tenant_id, (data->>'repId')) WHERE data->>'status'='active'; CREATE UNIQUE INDEX one_fulfillment_per_contract ON fulfillments (tenant_id, (data->>'contractId'));",
  ),
  addOwnedTablesMigration(
    2,
    'representative_work',
    workTables,
    `
    CREATE INDEX tasks_rep_due ON tasks (tenant_id, (data->>'repId'), (data->>'dueOn'));
    CREATE INDEX opportunities_rep_stage ON opportunities (tenant_id, (data->>'repId'), (data->>'stage'));
    CREATE INDEX routes_rep_date ON visit_routes (tenant_id, (data->>'repId'), (data->>'date'));
    CREATE UNIQUE INDEX one_pending_discount_approval ON discount_approvals (tenant_id, (data->>'quoteId')) WHERE data->>'status'='pending';
  `,
  ),
  tenantSecurityMigration(3),
  addOwnedTablesMigration(
    4,
    'client_service_requests',
    requestTables,
    `CREATE INDEX service_requests_client ON service_requests (tenant_id, (data->>'clientId'), id);
     CREATE INDEX service_requests_rep ON service_requests (tenant_id, (data->>'repId'), id);`,
  ),
];

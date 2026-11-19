import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { CatalogSnapshot, CustomerContext } from '@elvorance/contracts';
import { AppError, MemoryRepository, type Repository } from '@elvorance/service-kit';
import { defaultConfiguration } from '@elvorance/questionnaire';
import { createApp as createCrm } from '../../services/crm/src/app.ts';
import { createApp as createSales } from '../../services/sales/src/app.ts';
import { createApp as createCommunications } from '../../services/communications/src/app.ts';
import { createApp as createIdentity } from '../../services/identity/src/app.ts';
import { tables as crmTables } from '../../services/crm/src/infrastructure/migrations/001_initial.ts';
import { tables as salesTables } from '../../services/sales/src/infrastructure/migrations/001_initial.ts';
import { tables as communicationsTables } from '../../services/communications/src/infrastructure/migrations/001_initial.ts';
import { tables as identityTables } from '../../services/identity/src/infrastructure/migrations/001_initial.ts';
import { auth, call } from './helpers.ts';

export async function repFixture(
  t: TestContext,
  repositories?: {
    crm: Repository;
    sales: Repository;
    communications: Repository;
    identity: Repository;
  },
  tenantId = 'tenant-a',
) {
  let clientId = '';
  const scopedAuth: typeof auth = async (authorization) => {
    const principal = await auth(authorization);
    if (authorization !== 'Bearer outsider') principal.tenantId = tenantId;
    if (authorization === 'Bearer client') principal.clientId = clientId;
    return principal;
  };
  const crmRepository = repositories?.crm ?? new MemoryRepository('crm', crmTables);
  const salesRepository = repositories?.sales ?? new MemoryRepository('sales', salesTables);
  const communicationsRepository =
    repositories?.communications ?? new MemoryRepository('communications', communicationsTables);
  const crm = createCrm({ repository: crmRepository, auth: scopedAuth });
  const directory = {
    async getCustomer(id: string, authorization: string): Promise<CustomerContext> {
      const response = await crm.inject({
        method: 'GET',
        url: `/v1/customers/${id}/context`,
        headers: { authorization },
      });
      if (response.statusCode !== 200)
        throw new AppError(response.statusCode, 'CUSTOMER_SCOPE', 'Customer is not accessible');
      return response.json() as CustomerContext;
    },
    async getCatalog(authorization: string): Promise<CatalogSnapshot> {
      const response = await crm.inject({
        method: 'GET',
        url: '/v1/catalog',
        headers: { authorization },
      });
      if (response.statusCode !== 200)
        throw new AppError(response.statusCode, 'CATALOG_SCOPE', 'Catalog is not accessible');
      return response.json() as CatalogSnapshot;
    },
  };
  const sales = createSales({
    repository: salesRepository,
    auth: scopedAuth,
    customerDirectory: directory,
  });
  const communications = createCommunications({
    repository: communicationsRepository,
    auth: scopedAuth,
    customerDirectory: directory,
  });
  const identity = createIdentity({
    repository: repositories?.identity ?? new MemoryRepository('identity', identityTables),
    auth: scopedAuth,
  });
  t.after(async () => {
    await Promise.all([crm, sales, communications, identity].map((app) => app.close()));
  });
  const customerResponse = await call(crm, 'POST', '/v1/customers', 'rep', {
    name: 'Real staged customer',
    contactName: 'Customer contact',
    city: 'Riyadh',
    address: 'Office 24',
    notes: 'Private qualification notes',
  });
  assert.equal(customerResponse.status, 200);
  const customer = customerResponse.body;
  clientId = customer.id;
  const definition = defaultConfiguration();
  definition.questions = [
    {
      id: 'need',
      label: 'What does this customer need?',
      section: 'challenge',
      type: 'text',
      required: true,
      active: true,
      activityIds: ['services'],
      order: 10,
      options: [],
      otherAllowed: false,
      min: null,
      max: null,
    },
  ];
  const configurationInput = {
    expectedVersion: 0,
    definition,
    currency: 'SAR',
    catalog: [
      { id: 'web', title: 'Managed website', price: 100, category: 'software', active: true },
      {
        id: 'custom',
        title: 'Custom implementation',
        price: 0,
        category: 'software',
        active: true,
      },
    ],
  };
  const publish = async () => {
    const result = await call(crm, 'PUT', '/v1/configuration', 'admin', configurationInput);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body;
  };
  const schedule = async (scheduledAt = new Date().toISOString()) => {
    const result = await call(sales, 'POST', '/v1/visits', 'rep', {
      clientId,
      scheduledAt,
      purpose: 'Discover customer scope',
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body;
  };
  const start = async () => {
    const visit = await schedule();
    const result = await call(sales, 'POST', `/v1/visits/${visit.id}/start`, 'rep', {
      expectedVersion: visit.version,
      proof: { kind: 'manual', reason: 'Customer confirmed arrival in person' },
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body;
  };
  const quoteInput = (visitId: string, discountMinor = 0, serviceId = 'web') => ({
    visitId,
    currency: 'SAR',
    items: [
      {
        serviceId,
        title: 'Agreed website scope',
        quantity: 1,
        unitPriceMinor: 10000,
        deliverables: ['Customer website'],
        duration: 'Two weeks',
      },
    ],
    discountMinor,
    terms: 'Scope and payment terms agreed before delivery',
    validUntil: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    paymentPlan: [
      { id: 'first', label: 'Full amount', amountMinor: 10000 - discountMinor, dueOn: null },
    ],
  });
  return {
    crm,
    sales,
    communications,
    identity,
    customer,
    directory,
    configurationInput,
    publish,
    schedule,
    start,
    quoteInput,
    crmRepository,
    salesRepository,
    communicationsRepository,
  };
}

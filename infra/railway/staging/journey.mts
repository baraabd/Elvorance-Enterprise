import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { CatalogSnapshot, Principal } from '@elvorance/contracts';
import { defaultConfiguration } from '@elvorance/questionnaire';
import type { Customer } from '../../../services/crm/src/domain/model.ts';
import type {
  Contract,
  Fulfillment,
  Quote,
  Visit,
} from '../../../services/sales/src/domain/model.ts';
import type { Project } from '../../../services/delivery/src/domain/model.ts';
import type { Invoice } from '../../../services/billing/src/domain/model.ts';
import type { Notification } from '../../../services/communications/src/domain/model.ts';
import { ensure, assertStaging, domains as serviceNames } from './target.mts';
import { requiredValue } from './target.mts';
import { createIdentityFixtures } from './identity-fixture.mts';
import { hostedHttp } from './http.mts';
type Page<T> = { items: T[] };
async function poll<T>(
  name: string,
  read: () => Promise<T>,
  ready: (value: T) => boolean,
): Promise<T> {
  const deadline = Date.now() + 60_000;
  do {
    const value = await read();
    if (ready(value)) return value;
    await delay(750);
  } while (Date.now() < deadline);
  throw new Error(`${name} did not converge within 60 seconds.`);
}

function syntheticConfiguration() {
  const definition = defaultConfiguration();
  definition.activities = [{ id: 'ci-services', label: 'CI synthetic activity', active: true }];
  definition.questions = [
    {
      id: 'ci-need',
      label: 'CI synthetic scope question',
      section: 'challenge',
      type: 'text',
      required: true,
      active: true,
      activityIds: ['ci-services'],
      order: 10,
      options: [],
      otherAllowed: false,
      min: null,
      max: null,
    },
  ];
  return {
    expectedVersion: 0,
    definition,
    currency: 'SAR',
    catalog: [
      {
        id: 'ci-web',
        title: 'CI synthetic website',
        price: 100,
        category: 'software',
        active: true,
      },
    ],
  };
}

export async function hostedJourney(
  identities: Awaited<ReturnType<typeof createIdentityFixtures>>,
  tenantId: string,
) {
  assertStaging();
  const adminAccount = await identities.create({ tenantId, roles: ['admin'] });
  const admin = await identities.login(adminAccount, 'admin');
  const repAccount = await identities.create({ tenantId, roles: ['rep'], repId: 'ci-rep' });
  const rep = await identities.login(repAccount, 'rep');
  const outsiderAccount = await identities.create({
    tenantId: tenantId + '-foreign',
    roles: ['admin'],
  });
  const outsider = await identities.login(outsiderAccount, 'admin');
  const otherRepAccount = await identities.create({
    tenantId,
    roles: ['rep'],
    repId: 'ci-other-rep',
  });
  const otherRep = await identities.login(otherRepAccount, 'rep');
  const http = hostedHttp();
  const checks: Array<{ name: string; passed: true }> = [];
  const passed = (name: string) => {
    checks.push({ name, passed: true });
    console.log('ELVORANCE_CHECK ' + name);
  };
  const readiness = await http.request<{ status: string; dependencies: Record<string, boolean> }>(
    'GET',
    '/ready',
  );
  ensure(
    readiness.status === 'ready' &&
      serviceNames.every((name) => readiness.dependencies[name] === true),
    'All seven real service processes must be ready.',
  );
  await http.request('GET', '/v1/identity/me', { status: 401 });
  await http.request('GET', '/v1/identity/me', { token: 'invalid.invalid.invalid', status: 401 });
  const identity = await http.request<{ principal: Principal }>('GET', '/v1/identity/me', {
    session: rep,
  });
  ensure(
    identity.principal.tenantId === tenantId && identity.principal.repId === 'ci-rep',
    'Gateway and identity must preserve verified representative scope.',
  );
  for (const path of ['/v1/tracking/latest', '/v1/communications/notifications']) {
    const page = await http.request<Page<unknown>>('GET', path, { session: admin });
    ensure(
      Array.isArray(page.items) && page.items.length === 0,
      `${path} must be empty for the fresh CI tenant.`,
    );
  }
  passed('gateway, seven ready services, unauthenticated and malformed token denial');

  const publication = await http.request<{ source: string; recordVersion: number }>(
    'PUT',
    '/v1/crm/configuration',
    { session: admin, body: syntheticConfiguration() },
  );
  ensure(
    publication.source === 'tenant' && publication.recordVersion === 1,
    'Synthetic configuration must be explicitly published for this tenant.',
  );
  const catalog = await http.request<CatalogSnapshot>('GET', '/v1/crm/catalog', { session: rep });
  ensure(
    catalog.configured &&
      catalog.currency === 'SAR' &&
      catalog.items.some((item) => item.id === 'ci-web' && item.unitPriceMinor === 10000),
    'Sales must use the published synthetic catalog.',
  );

  const createKey = randomUUID();
  const createBody = {
    name: 'CI ONLY synthetic customer',
    city: 'CI test city',
    notes: 'Disposable runtime fixture; no real customer data.',
    tenantId: 'ci-forged-tenant',
    repId: 'ci-forged-rep',
  };
  const customer = await http.request<Customer>('POST', '/v1/crm/customers', {
    session: rep,
    body: createBody,
    key: createKey,
  });
  ensure(
    customer.tenantId === tenantId && customer.repId === 'ci-rep',
    'Customer ownership must derive from verified claims.',
  );
  const replay = await http.request<Customer>('POST', '/v1/crm/customers', {
    session: rep,
    body: createBody,
    key: createKey,
  });
  ensure(
    replay.id === customer.id && replay.version === customer.version,
    'Idempotent customer retry must return the original result.',
  );
  await http.request('POST', '/v1/crm/customers', {
    session: rep,
    body: { ...createBody, name: 'Changed CI payload' },
    key: createKey,
    status: 409,
  });
  const customers = await http.request<Page<Customer>>('GET', '/v1/crm/customers', {
    session: rep,
  });
  ensure(
    customers.items.length === 1 && customers.items[0]?.id === customer.id,
    'Retry must not duplicate a customer in PostgreSQL.',
  );
  for (const token of [outsider, otherRep])
    await http.request('GET', `/v1/crm/customers/${customer.id}`, { session: token, status: 404 });
  const foreign = await http.request<Page<Customer>>('GET', '/v1/crm/customers', {
    session: outsider,
  });
  ensure(foreign.items.length === 0, 'Cross-tenant collection must not expose this customer.');
  passed(
    'published fixture catalog, persisted customer, idempotent retry and tenant/owner isolation',
  );

  let visit = await http.request<Visit>('POST', '/v1/sales/visits', {
    session: rep,
    body: {
      clientId: customer.id,
      scheduledAt: new Date().toISOString(),
      purpose: 'CI synthetic manual visit',
    },
  });
  const startBody = {
    expectedVersion: visit.version,
    proof: { kind: 'manual', reason: 'CI synthetic manual arrival evidence; no GPS claim.' },
  };
  const startKey = randomUUID();
  visit = await http.request<Visit>('POST', `/v1/sales/visits/${visit.id}/start`, {
    session: rep,
    body: startBody,
    key: startKey,
  });
  const startRetry = await http.request<Visit>('POST', `/v1/sales/visits/${visit.id}/start`, {
    session: rep,
    body: startBody,
    key: startKey,
  });
  ensure(
    visit.status === 'active' &&
      visit.startProof?.kind === 'manual' &&
      startRetry.version === visit.version,
    'Manual visit start must persist once.',
  );
  await http.request('GET', `/v1/sales/visits/${visit.id}`, { session: outsider, status: 404 });
  let quote = await http.request<Quote>('POST', '/v1/sales/quotes', {
    session: rep,
    body: {
      visitId: visit.id,
      currency: 'SAR',
      totalMinor: 1,
      items: [
        {
          serviceId: 'ci-web',
          title: 'CI synthetic website scope',
          quantity: 1,
          unitPriceMinor: 10000,
          deliverables: ['CI synthetic deliverable'],
          duration: 'Two weeks',
        },
      ],
      terms: 'CI ONLY synthetic acceptance terms; not a commercial agreement.',
      validUntil: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      paymentPlan: [
        { id: 'deposit', label: 'CI deposit', amountMinor: 4000, dueOn: null },
        { id: 'balance', label: 'CI balance', amountMinor: 6000, dueOn: null },
      ],
    },
  });
  ensure(
    quote.totalMinor === 10000 && quote.status === 'draft',
    'Quote total must be computed by the real sales service.',
  );
  quote = await http.request<Quote>('POST', `/v1/sales/quotes/${quote.id}/send`, {
    session: rep,
    body: { expectedVersion: quote.version },
  });
  ensure(quote.status === 'sent', 'Quote must be sent before customer acceptance.');
  passed('manual visit and quote use live CRM/catalog service boundaries');

  const clientAccount = await identities.create({
    tenantId,
    roles: ['client'],
    clientId: customer.id,
  });
  const client = await identities.login(clientAccount, 'client');
  const acceptBody = { expectedVersion: quote.version, consent: true };
  await http.request('POST', `/v1/sales/quotes/${quote.id}/accept`, {
    session: rep,
    body: acceptBody,
    status: 403,
  });
  await http.request('GET', `/v1/sales/quotes/${quote.id}`, { session: outsider, status: 404 });
  const acceptKey = randomUUID();
  const accepted = await http.request<{ quote: Quote; contract: Contract }>(
    'POST',
    `/v1/sales/quotes/${quote.id}/accept`,
    { session: client, body: acceptBody, key: acceptKey },
  );
  let contract = accepted.contract;
  ensure(
    accepted.quote.status === 'accepted' &&
      contract.status === 'pending' &&
      contract.totalMinor === 10000,
    'Client acceptance must create a pending contract with authoritative terms.',
  );
  const acceptRetry = await http.request<{ contract: Contract }>(
    'POST',
    `/v1/sales/quotes/${quote.id}/accept`,
    { session: client, body: acceptBody, key: acceptKey },
  );
  ensure(
    acceptRetry.contract.id === contract.id,
    'Acceptance retry must return the same contract.',
  );
  for (const path of ['/v1/delivery/projects', '/v1/billing/invoices']) {
    const page = await http.request<Page<unknown>>('GET', path, { session: client });
    ensure(page.items.length === 0, 'Client acceptance alone must not trigger fulfillment.');
  }
  await http.request('POST', `/v1/sales/contracts/${contract.id}/approve`, {
    session: client,
    body: {
      expectedVersion: contract.version,
      signerName: 'CI synthetic customer',
      consent: false,
    },
    status: 400,
  });
  passed('only the customer accepts; separate explicit contract consent is required');

  const approvalBody = {
    expectedVersion: contract.version,
    signerName: 'CI synthetic customer',
    consent: true,
  };
  const approvalKey = randomUUID();
  contract = await http.request<Contract>('POST', `/v1/sales/contracts/${contract.id}/approve`, {
    session: client,
    body: approvalBody,
    key: approvalKey,
  });
  ensure(contract.status === 'approved', 'Explicit customer approval must succeed.');
  const approvalRetry = await http.request<Contract>(
    'POST',
    `/v1/sales/contracts/${contract.id}/approve`,
    { session: client, body: approvalBody, key: approvalKey },
  );
  ensure(
    approvalRetry.id === contract.id && approvalRetry.version === contract.version,
    'Approval retry must not repeat the business transition.',
  );
  const fulfillment = await poll(
    'RabbitMQ fulfillment round trip',
    () =>
      http.request<Fulfillment & { status: string }>(
        'GET',
        `/v1/sales/contracts/${contract.id}/fulfillment`,
        { session: client },
      ),
    (value) => value.status === 'ready',
  );
  const projects = await http.request<Page<Project>>('GET', '/v1/delivery/projects', {
    session: client,
  });
  const invoices = await http.request<Page<Invoice>>('GET', '/v1/billing/invoices', {
    session: client,
  });
  ensure(
    projects.items.length === 1 &&
      projects.items[0]?.contractId === contract.id &&
      projects.items[0]?.id === fulfillment.projectId,
    'Delivery consumer must create exactly one matching project.',
  );
  ensure(
    projects.items[0]?.status === 'planning' && projects.items[0]?.progress === 0,
    'New fulfillment must not falsely claim completed delivery.',
  );
  ensure(
    invoices.items.length === 2 &&
      invoices.items.every(
        (invoice) =>
          invoice.contractId === contract.id &&
          invoice.status === 'open' &&
          invoice.paidMinor === 0,
      ),
    'Billing consumer must create the two unpaid plan invoices.',
  );
  ensure(
    invoices.items.reduce((total, invoice) => total + invoice.amountMinor, 0) ===
      contract.totalMinor,
    'Persisted invoices must balance to the approved contract.',
  );
  ensure(
    JSON.stringify(invoices.items.map((invoice) => invoice.id).sort()) ===
      JSON.stringify([...fulfillment.invoiceIds].sort()),
    'Sales must consume the billing acknowledgement with matching invoice IDs.',
  );
  const notifications = await poll(
    'Communications event consumption',
    () =>
      http.request<Page<Notification>>('GET', '/v1/communications/notifications', {
        session: client,
      }),
    (value) =>
      value.items.some(
        (item) => item.type === 'contract.approved.v1' && item.resourceId === contract.id,
      ),
  );
  ensure(
    notifications.items.every((item) => item.tenantId === tenantId),
    'Event-generated notifications must remain tenant scoped.',
  );
  for (const path of [
    `/v1/sales/contracts/${contract.id}/fulfillment`,
    `/v1/delivery/projects/${requiredValue(projects.items[0], 'Expected a fulfilled project.').id}`,
    `/v1/billing/invoices/${requiredValue(invoices.items[0], 'Expected a fulfilled invoice.').id}`,
  ])
    await http.request('GET', path, { session: outsider, status: 404 });
  passed(
    'real RabbitMQ outbox/inbox round trip creates one project, two invoices and scoped notifications',
  );

  visit = await http.request<Visit>('POST', `/v1/sales/visits/${visit.id}/complete`, {
    session: rep,
    body: {
      expectedVersion: visit.version,
      outcome: 'agreement',
      notes: 'CI synthetic customer separately accepted and approved.',
      nextStep: 'CI synthetic delivery handover',
    },
  });
  ensure(
    visit.status === 'completed' && visit.outcome === 'agreement',
    'Representative must be able to complete the accepted visit.',
  );
  passed('representative completes the approved agreement visit');

  return {
    http,
    checks,
    admin,
    rep,
    client,
    customer,
    quote,
    contract,
    projects,
    invoices,
    adminAccount,
    repAccount,
    clientAccount,
    recoveryReplay: {
      key: createKey,
      principal: identity.principal,
      body: createBody,
      customerId: customer.id,
    },
    report: {
      scope:
        'Hosted staging HTTPS + genuine OIDC + PostgreSQL + RabbitMQ; synthetic accounts and business fixtures',
      tenantId,
      requests: http.observations.length,
      checks,
      passed: true,
      fulfilled: {
        projects: projects.items.length,
        invoices: invoices.items.length,
        totalMinor: contract.totalMinor,
        currency: contract.currency,
      },
    },
  };
}

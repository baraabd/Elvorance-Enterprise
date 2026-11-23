import { createHmac, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type { CatalogSnapshot, Principal } from '@elvorance/contracts';
import { defaultConfiguration } from '@elvorance/questionnaire';
import type { Customer } from '../../services/crm/src/domain/model.ts';
import type { Contract, Fulfillment, Quote, Visit } from '../../services/sales/src/domain/model.ts';
import type { Project } from '../../services/delivery/src/domain/model.ts';
import type { Invoice } from '../../services/billing/src/domain/model.ts';
import type { Notification } from '../../services/communications/src/domain/model.ts';

// Synthetic CI records only. This deliberately cannot target hosted Staging or production.
const serviceNames = [
  'identity',
  'crm',
  'sales',
  'delivery',
  'billing',
  'tracking',
  'communications',
];
type Page<T> = { items: T[] };
type Check = { name: string; passed: true };
type RequestOptions = { token?: string; body?: unknown; key?: string; status?: number };

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function runtimeTarget(env: NodeJS.ProcessEnv): URL {
  const target = new URL(env.RUNTIME_GATEWAY_URL ?? `http://127.0.0.1:${env.GATEWAY_PORT || 3000}`);
  ensure(
    target.protocol === 'http:' &&
      ['127.0.0.1', '[::1]'].includes(target.hostname) &&
      !target.username &&
      !target.password &&
      target.pathname === '/' &&
      !target.search &&
      !target.hash,
    'Runtime journey requires a literal loopback HTTP gateway origin.',
  );
  ensure(
    env.CI === 'true' && /^elvorance-runtime-[0-9]+-[0-9]+$/.test(env.COMPOSE_PROJECT_NAME ?? ''),
    'Runtime journey requires an isolated elvorance-runtime-<run>-<attempt> CI Compose project.',
  );
  ensure(
    env.AUTH_MODE === 'dev-hs256' && env.NODE_ENV !== 'production',
    'Runtime journey requires explicit development authentication.',
  );
  return target;
}

function tokenSigner(env: NodeJS.ProcessEnv) {
  const { DEV_JWT_SECRET: secret, OIDC_ISSUER: issuer, OIDC_AUDIENCE: audience } = env;
  ensure(
    secret && secret.length >= 32 && issuer && audience,
    'Initialize the isolated Compose environment before running the journey.',
  );
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return (principal: Principal): string => {
    const now = Math.floor(Date.now() / 1000);
    const input = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
      sub: principal.sub,
      tenant_id: principal.tenantId,
      roles: principal.roles,
      ...(principal.repId ? { rep_id: principal.repId } : {}),
      ...(principal.clientId ? { client_id: principal.clientId } : {}),
      iss: issuer,
      aud: audience,
      iat: now,
      exp: now + 900,
    })}`;
    return `${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`;
  };
}

function gateway(base: URL) {
  let requests = 0;
  async function request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = new URL(path, base);
    ensure(
      url.origin === base.origin && path.startsWith('/'),
      'Runtime request left its loopback gateway.',
    );
    const headers: Record<string, string> = { accept: 'application/json' };
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (method !== 'GET') headers['idempotency-key'] = options.key ?? randomUUID();
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    requests++;
    const response = await fetch(url, {
      method,
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    ensure(
      response.status === (options.status ?? 200),
      `${method} ${path}: HTTP ${response.status}, expected ${options.status ?? 200}.`,
    );
    ensure(
      response.headers.get('content-type')?.includes('application/json'),
      `${method} ${path}: expected a JSON response.`,
    );
    return (await response.json()) as T;
  }
  return { request, count: () => requests };
}

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

async function journey(env: NodeJS.ProcessEnv) {
  // Validate the target BEFORE reading the secret into the signer or minting a token.
  const base = runtimeTarget(env);
  const sign = tokenSigner(env);
  const tenantId = `ci-runtime-${randomUUID()}`;
  const admin = sign({ sub: 'ci-admin', tenantId, roles: ['admin'] });
  const rep = sign({ sub: 'ci-representative', tenantId, roles: ['rep'], repId: 'ci-rep' });
  const outsider = sign({
    sub: 'ci-other-tenant',
    tenantId: `ci-other-${randomUUID()}`,
    roles: ['admin'],
  });
  const otherRep = sign({
    sub: 'ci-other-representative',
    tenantId,
    roles: ['rep'],
    repId: 'ci-other-rep',
  });
  const http = gateway(base);
  const checks: Check[] = [];
  const passed = (name: string) => {
    checks.push({ name, passed: true });
    console.log(`PASS ${name}`);
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
    token: rep,
  });
  ensure(
    identity.principal.tenantId === tenantId && identity.principal.repId === 'ci-rep',
    'Gateway and identity must preserve verified representative scope.',
  );
  for (const path of ['/v1/tracking/latest', '/v1/communications/notifications']) {
    const page = await http.request<Page<unknown>>('GET', path, { token: admin });
    ensure(
      Array.isArray(page.items) && page.items.length === 0,
      `${path} must be empty for the fresh CI tenant.`,
    );
  }
  passed('gateway, seven ready services, unauthenticated and malformed token denial');

  const publication = await http.request<{ source: string; recordVersion: number }>(
    'PUT',
    '/v1/crm/configuration',
    { token: admin, body: syntheticConfiguration() },
  );
  ensure(
    publication.source === 'tenant' && publication.recordVersion === 1,
    'Synthetic configuration must be explicitly published for this tenant.',
  );
  const catalog = await http.request<CatalogSnapshot>('GET', '/v1/crm/catalog', { token: rep });
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
    token: rep,
    body: createBody,
    key: createKey,
  });
  ensure(
    customer.tenantId === tenantId && customer.repId === 'ci-rep',
    'Customer ownership must derive from verified claims.',
  );
  const replay = await http.request<Customer>('POST', '/v1/crm/customers', {
    token: rep,
    body: createBody,
    key: createKey,
  });
  ensure(
    replay.id === customer.id && replay.version === customer.version,
    'Idempotent customer retry must return the original result.',
  );
  await http.request('POST', '/v1/crm/customers', {
    token: rep,
    body: { ...createBody, name: 'Changed CI payload' },
    key: createKey,
    status: 409,
  });
  const customers = await http.request<Page<Customer>>('GET', '/v1/crm/customers', { token: rep });
  ensure(
    customers.items.length === 1 && customers.items[0]?.id === customer.id,
    'Retry must not duplicate a customer in PostgreSQL.',
  );
  for (const token of [outsider, otherRep])
    await http.request('GET', `/v1/crm/customers/${customer.id}`, { token, status: 404 });
  const foreign = await http.request<Page<Customer>>('GET', '/v1/crm/customers', {
    token: outsider,
  });
  ensure(foreign.items.length === 0, 'Cross-tenant collection must not expose this customer.');
  passed(
    'published fixture catalog, persisted customer, idempotent retry and tenant/owner isolation',
  );

  let visit = await http.request<Visit>('POST', '/v1/sales/visits', {
    token: rep,
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
    token: rep,
    body: startBody,
    key: startKey,
  });
  const startRetry = await http.request<Visit>('POST', `/v1/sales/visits/${visit.id}/start`, {
    token: rep,
    body: startBody,
    key: startKey,
  });
  ensure(
    visit.status === 'active' &&
      visit.startProof?.kind === 'manual' &&
      startRetry.version === visit.version,
    'Manual visit start must persist once.',
  );
  await http.request('GET', `/v1/sales/visits/${visit.id}`, { token: outsider, status: 404 });
  let quote = await http.request<Quote>('POST', '/v1/sales/quotes', {
    token: rep,
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
    token: rep,
    body: { expectedVersion: quote.version },
  });
  ensure(quote.status === 'sent', 'Quote must be sent before customer acceptance.');
  passed('manual visit and quote use live CRM/catalog service boundaries');

  const client = sign({
    sub: 'ci-customer-account',
    tenantId,
    roles: ['client'],
    clientId: customer.id,
  });
  const acceptBody = { expectedVersion: quote.version, consent: true };
  await http.request('POST', `/v1/sales/quotes/${quote.id}/accept`, {
    token: rep,
    body: acceptBody,
    status: 403,
  });
  await http.request('GET', `/v1/sales/quotes/${quote.id}`, { token: outsider, status: 404 });
  const acceptKey = randomUUID();
  const accepted = await http.request<{ quote: Quote; contract: Contract }>(
    'POST',
    `/v1/sales/quotes/${quote.id}/accept`,
    { token: client, body: acceptBody, key: acceptKey },
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
    { token: client, body: acceptBody, key: acceptKey },
  );
  ensure(
    acceptRetry.contract.id === contract.id,
    'Acceptance retry must return the same contract.',
  );
  for (const path of ['/v1/delivery/projects', '/v1/billing/invoices']) {
    const page = await http.request<Page<unknown>>('GET', path, { token: client });
    ensure(page.items.length === 0, 'Client acceptance alone must not trigger fulfillment.');
  }
  await http.request('POST', `/v1/sales/contracts/${contract.id}/approve`, {
    token: client,
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
    token: client,
    body: approvalBody,
    key: approvalKey,
  });
  ensure(contract.status === 'approved', 'Explicit customer approval must succeed.');
  const approvalRetry = await http.request<Contract>(
    'POST',
    `/v1/sales/contracts/${contract.id}/approve`,
    { token: client, body: approvalBody, key: approvalKey },
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
        { token: client },
      ),
    (value) => value.status === 'ready',
  );
  const projects = await http.request<Page<Project>>('GET', '/v1/delivery/projects', {
    token: client,
  });
  const invoices = await http.request<Page<Invoice>>('GET', '/v1/billing/invoices', {
    token: client,
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
        token: client,
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
    `/v1/delivery/projects/${projects.items[0]!.id}`,
    `/v1/billing/invoices/${invoices.items[0]!.id}`,
  ])
    await http.request('GET', path, { token: outsider, status: 404 });
  passed(
    'real RabbitMQ outbox/inbox round trip creates one project, two invoices and scoped notifications',
  );

  visit = await http.request<Visit>('POST', `/v1/sales/visits/${visit.id}/complete`, {
    token: rep,
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

  // Sprint 07: verify cross-role convergence through the real gateway, never local UI state.
  const adminVisit = await http.request<Visit>('GET', `/v1/sales/visits/${visit.id}`, {
    token: admin,
  });
  const clientQuote = await http.request<Quote>('GET', `/v1/sales/quotes/${quote.id}`, {
    token: client,
  });
  const repContract = await http.request<Contract>('GET', `/v1/sales/contracts/${contract.id}`, {
    token: rep,
  });
  ensure(
    adminVisit.status === 'completed' && adminVisit.notes === visit.notes,
    'Admin must observe the persisted field report.',
  );
  ensure(
    clientQuote.status === 'accepted' && repContract.status === 'approved',
    'Rep and client must observe the same authoritative commercial decisions.',
  );
  const task = await http.request<{ id: string; version: number }>('POST', '/v1/sales/tasks', {
    token: rep,
    body: {
      clientId: customer.id,
      title: 'CI field handover',
      dueOn: new Date().toISOString().slice(0, 10),
    },
  });
  await http.request('PATCH', `/v1/sales/tasks/${task.id}`, {
    token: rep,
    body: { expectedVersion: task.version, status: 'done' },
  });
  await http.request('PATCH', `/v1/sales/tasks/${task.id}`, {
    token: rep,
    body: { expectedVersion: task.version, status: 'cancelled' },
    status: 409,
  });
  const adminTask = await http.request<{ status: string }>('GET', `/v1/sales/tasks/${task.id}`, {
    token: admin,
  });
  ensure(
    adminTask.status === 'done',
    'A stale field update must not overwrite the completed task.',
  );
  await http.request('GET', `/v1/sales/tasks/${task.id}`, { token: otherRep, status: 404 });
  passed(
    'field completion and conflict-safe handover converge for Admin, Client and Representative',
  );

  const conversation = await http.request<{ id: string; version: number }>(
    'POST',
    '/v1/communications/conversations',
    {
      token: rep,
      body: { clientId: customer.id },
    },
  );
  const conversationPath = `/v1/communications/conversations/${conversation.id}`;
  const sentMessage = await http.request<{
    conversation: { version: number };
    message: { id: string };
  }>('POST', conversationPath + '/messages', {
    token: rep,
    body: { expectedVersion: conversation.version, body: 'CI synthetic field handover message' },
  });
  const clientMessages = await http.request<{ items: { id: string }[] }>(
    'GET',
    conversationPath + '/messages',
    { token: client },
  );
  ensure(
    clientMessages.items.some((row) => row.id === sentMessage.message.id),
    'Client must receive the field message.',
  );
  await http.request('POST', conversationPath + '/read', {
    token: client,
    body: {
      expectedVersion: sentMessage.conversation.version,
      lastMessageId: sentMessage.message.id,
    },
  });
  const clientRead = await http.request<{ receipt: { lastMessageId: string } | null }>(
    'GET',
    conversationPath + '/messages',
    { token: client },
  );
  const repRead = await http.request<{ receipt: unknown }>('GET', conversationPath + '/messages', {
    token: rep,
  });
  ensure(
    clientRead.receipt?.lastMessageId === sentMessage.message.id && repRead.receipt === null,
    'Read acknowledgements must belong to the actual actor, not be copied between accounts.',
  );
  await http.request('GET', conversationPath + '/messages', { token: otherRep, status: 404 });
  await http.request('GET', conversationPath + '/messages', { token: outsider, status: 404 });
  passed(
    'field message delivery and actor-scoped read receipts persist across real service boundaries',
  );

  return {
    schemaVersion: 1,
    passed: true,
    environment: 'isolated-compose-ci',
    authMode: 'dev-hs256',
    syntheticData: true,
    sourceRevision: env.GITHUB_SHA ?? null,
    composeProject: env.COMPOSE_PROJECT_NAME,
    tenantId,
    completedAt: new Date().toISOString(),
    requests: http.count(),
    checks,
    fulfilled: {
      projects: projects.items.length,
      invoices: invoices.items.length,
      totalMinor: contract.totalMinor,
      currency: contract.currency,
    },
    scope:
      'Real HTTP gateway, seven Docker service processes, PostgreSQL and RabbitMQ. No hosted Staging, production OIDC, native package, physical device or payment collection proof.',
    productionPromotionAllowed: false,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../../infra/compose/.env', import.meta.url)));
    const report = await journey(process.env);
    const output = new URL('../../dist/runtime/compose-journey.json', import.meta.url);
    await mkdir(new URL('.', output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(
      `Runtime journey passed (${report.checks.length} checks, ${report.requests} HTTP requests). Evidence: dist/runtime/compose-journey.json`,
    );
  } catch (error) {
    // Never dump response bodies, environment, Authorization headers or JWTs.
    console.error(error instanceof Error ? error.message : 'Runtime journey failed.');
    process.exitCode = 1;
  }
}

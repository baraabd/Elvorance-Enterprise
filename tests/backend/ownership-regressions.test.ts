import test from 'node:test';
import assert from 'node:assert/strict';
import type { CustomerContext } from '@elvorance/contracts';
import { AppError, MemoryRepository } from '@elvorance/service-kit';
import { createApp as crmApp } from '../../services/crm/src/app.ts';
import { createApp as salesApp } from '../../services/sales/src/app.ts';
import { auth, call } from './helpers.ts';

test('current assignment is checked even on cached customer creation; old rep cannot regain a transferred customer', async (t) => {
  const app = crmApp({ repository: new MemoryRepository('crm', ['customers', 'regions']), auth });
  t.after(() => app.close());
  const input = { name: 'Customer subject to reassignment' };
  const key = 'customer-reassignment-replay';
  let customer = (await call(app, 'POST', '/v1/customers', 'rep', input, key)).body;
  customer = (
    await call(app, 'PATCH', `/v1/customers/${customer.id}`, 'admin', {
      expectedVersion: customer.version,
      repId: 'rep-b',
    })
  ).body;
  assert.equal(customer.repId, 'rep-b');
  const replay = await call(app, 'POST', '/v1/customers', 'rep', input, key);
  assert.equal(replay.status, 404);
  assert.equal(replay.body.name, undefined);
});

test('quote create/edit/revise and cached send all recheck current opt-out and assignment', async (t) => {
  const crm = crmApp({ repository: new MemoryRepository('crm', ['customers', 'regions']), auth });
  const sales = salesApp({
    repository: new MemoryRepository('sales', [
      'visits',
      'quotes',
      'contracts',
      'fulfillments',
      'customer_contexts',
    ]),
    auth,
    customerDirectory: {
      async getCustomer(id, authorization) {
        const response = await crm.inject({
          method: 'GET',
          url: `/v1/customers/${id}/context`,
          headers: { authorization },
        });
        if (response.statusCode !== 200)
          throw new AppError(response.statusCode, 'CUSTOMER_SCOPE', 'Customer is not accessible');
        return response.json() as CustomerContext;
      },
    },
  });
  t.after(async () => {
    await crm.close();
    await sales.close();
  });
  let customer = (
    await call(crm, 'POST', '/v1/customers', 'rep', { name: 'Consent change customer' })
  ).body;
  let visit = (
    await call(sales, 'POST', '/v1/visits', 'rep', {
      clientId: customer.id,
      purpose: 'Verify fresh sales consent',
      scheduledAt: new Date().toISOString(),
    })
  ).body;
  visit = (
    await call(sales, 'POST', `/v1/visits/${visit.id}/start`, 'rep', {
      expectedVersion: visit.version,
      proof: { kind: 'manual', reason: 'Explicit manual test proof' },
    })
  ).body;
  const input = {
    visitId: visit.id,
    currency: 'SAR',
    items: [
      {
        serviceId: 'web',
        title: 'Website',
        quantity: 1,
        unitPriceMinor: 10000,
        deliverables: ['Website scope'],
        duration: 'After planning',
      },
    ],
    terms: 'Original quote terms',
    validUntil: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    paymentPlan: [{ id: 'one', label: 'Full amount', amountMinor: 10000, dueOn: null }],
  };
  const createKey = 'quote-reassignment-replay';
  const draft = (await call(sales, 'POST', '/v1/quotes', 'rep', input, createKey)).body;
  let sent = (await call(sales, 'POST', '/v1/quotes', 'rep', input)).body;
  const sendInput = { expectedVersion: sent.version };
  const sendKey = 'quote-consent-send-replay';
  sent = (await call(sales, 'POST', `/v1/quotes/${sent.id}/send`, 'rep', sendInput, sendKey)).body;
  customer = (
    await call(crm, 'PATCH', `/v1/customers/${customer.id}`, 'admin', {
      expectedVersion: customer.version,
      doNotContact: true,
    })
  ).body;
  assert.equal((await call(sales, 'POST', '/v1/quotes', 'rep', input)).status, 409);
  assert.equal(
    (
      await call(sales, 'PATCH', `/v1/quotes/${draft.id}`, 'rep', {
        ...input,
        expectedVersion: draft.version,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(sales, 'POST', `/v1/quotes/${sent.id}/revise`, 'rep', {
        expectedVersion: sent.version,
      })
    ).status,
    409,
  );
  assert.equal(
    (await call(sales, 'POST', `/v1/quotes/${sent.id}/send`, 'rep', sendInput, sendKey)).status,
    409,
  );
  customer = (
    await call(crm, 'PATCH', `/v1/customers/${customer.id}`, 'admin', {
      expectedVersion: customer.version,
      doNotContact: false,
      repId: 'rep-b',
    })
  ).body;
  assert.equal((await call(sales, 'POST', '/v1/quotes', 'rep', input)).status, 404);
  assert.equal((await call(sales, 'POST', '/v1/quotes', 'rep', input, createKey)).status, 404);
  assert.equal(
    (
      await call(sales, 'PATCH', `/v1/quotes/${draft.id}`, 'rep', {
        ...input,
        expectedVersion: draft.version,
      })
    ).status,
    404,
  );
});

test('retained rep_id/client_id claims never grant list, detail or ticket actions after role removal', async (t) => {
  const { createApp: deliveryApp } = await import('../../services/delivery/src/app.ts');
  const { createApp: billingApp } = await import('../../services/billing/src/app.ts');
  const { createApp: communicationsApp } = await import('../../services/communications/src/app.ts');
  const formerAuth = async () => ({
    sub: 'former-user',
    tenantId: 'tenant-a',
    roles: [],
    repId: 'rep-a',
    clientId: 'client-a',
  });
  const salesRepository = new MemoryRepository('sales', [
    'visits',
    'quotes',
    'contracts',
    'fulfillments',
    'customer_contexts',
  ]);
  const crmRepository = new MemoryRepository('crm', ['customers', 'regions']);
  const deliveryRepository = new MemoryRepository('delivery', ['projects']);
  const billingRepository = new MemoryRepository('billing', [
    'contract_accounts',
    'invoices',
    'payments',
  ]);
  const communicationsRepository = new MemoryRepository('communications', [
    'tickets',
    'notifications',
  ]);
  const fixtures = [
    { repository: salesRepository, table: 'quotes', id: 'quote-private', status: 'draft' },
    { repository: salesRepository, table: 'contracts', id: 'contract-private', status: 'pending' },
    { repository: crmRepository, table: 'customers', id: 'client-a', status: 'active' },
    {
      repository: deliveryRepository,
      table: 'projects',
      id: 'project-private',
      status: 'planning',
    },
    { repository: billingRepository, table: 'invoices', id: 'invoice-private', status: 'open' },
    {
      repository: communicationsRepository,
      table: 'tickets',
      id: 'ticket-private',
      status: 'open',
    },
    {
      repository: communicationsRepository,
      table: 'notifications',
      id: 'notification-private',
      status: 'unread',
    },
  ];
  for (const fixture of fixtures)
    await fixture.repository.transaction('tenant-a', (tx) =>
      tx.insert(fixture.table, {
        id: fixture.id,
        clientId: 'client-a',
        repId: 'rep-a',
        status: fixture.status,
        title: 'Private tenant resource',
      }),
    );
  const apps = [
    {
      app: salesApp({
        repository: salesRepository,
        auth: formerAuth,
        customerDirectory: {
          async getCustomer() {
            throw new Error('Not used by this test');
          },
        },
      }),
      paths: [
        ['quotes', 'quote-private'],
        ['contracts', 'contract-private'],
      ],
    },
    {
      app: crmApp({ repository: crmRepository, auth: formerAuth }),
      paths: [['customers', 'client-a']],
    },
    {
      app: deliveryApp({ repository: deliveryRepository, auth: formerAuth }),
      paths: [['projects', 'project-private']],
    },
    {
      app: billingApp({ repository: billingRepository, auth: formerAuth }),
      paths: [['invoices', 'invoice-private']],
    },
    {
      app: communicationsApp({ repository: communicationsRepository, auth: formerAuth }),
      paths: [['tickets', 'ticket-private']],
    },
  ];
  t.after(async () => {
    await Promise.all(apps.map((entry) => entry.app.close()));
  });
  for (const { app, paths } of apps)
    for (const [path, id] of paths) {
      const list = await call(app, 'GET', `/v1/${path}`, 'unused');
      assert.equal(list.status, 200);
      assert.deepEqual(list.body.items, []);
      assert.equal((await call(app, 'GET', `/v1/${path}/${id}`, 'unused')).status, 404);
    }
  const communications = apps.at(-1)!.app;
  assert.equal(
    (
      await call(communications, 'POST', '/v1/tickets/ticket-private/replies', 'unused', {
        expectedVersion: 1,
        message: 'Unauthorized reply',
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call(communications, 'POST', '/v1/tickets/ticket-private/status', 'unused', {
        expectedVersion: 1,
        status: 'resolved',
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call(communications, 'POST', '/v1/notifications/notification-private/read', 'unused', {
        expectedVersion: 1,
      })
    ).status,
    404,
  );
});

test('out-of-order consent events cannot cancel a new visit or overwrite a newer opt-in', async () => {
  const { handleEvent: salesEvent } = await import(
    '../../services/sales/src/application/events.ts'
  );
  const { handleEvent: crmEvent } = await import('../../services/crm/src/application/events.ts');
  const { consumeEvent } = await import('@elvorance/events');
  const salesRepository = new MemoryRepository('sales', [
    'visits',
    'quotes',
    'contracts',
    'fulfillments',
    'customer_contexts',
  ]);
  const event = {
    id: 'consent-v3',
    type: 'crm.customer_updated.v1',
    schemaVersion: 1 as const,
    source: 'crm',
    tenantId: 'tenant-a',
    aggregateId: 'client-a',
    aggregateVersion: 3,
    occurredAt: new Date().toISOString(),
    correlationId: 'consent-order',
    payload: { id: 'client-a', repId: 'rep-a', consentVersion: 3, doNotContact: false },
  };
  await consumeEvent(salesRepository, 'sales-consent', event, salesEvent);
  await salesRepository.transaction('tenant-a', (tx) =>
    tx.insert('visits', {
      id: 'new-visit',
      clientId: 'client-a',
      repId: 'rep-a',
      status: 'scheduled',
    }),
  );
  await consumeEvent(
    salesRepository,
    'sales-consent',
    {
      ...event,
      id: 'consent-v2',
      aggregateVersion: 2,
      payload: { ...event.payload, consentVersion: 2, doNotContact: true },
    },
    salesEvent,
  );
  const visit = await salesRepository.transaction('tenant-a', (tx) =>
    tx.get('visits', 'new-visit'),
  );
  assert.equal((visit as unknown as { status: string }).status, 'scheduled');
  const crmRepository = new MemoryRepository('crm', ['customers', 'regions']);
  await crmRepository.transaction('tenant-a', (tx) =>
    tx.insert('customers', {
      id: 'client-a',
      name: 'Customer with newer opt-in',
      repId: 'rep-a',
      regionId: null,
      doNotContact: false,
      consentVersion: 3,
    }),
  );
  await consumeEvent(
    crmRepository,
    'crm-consent',
    {
      ...event,
      id: 'late-visit-opt-out',
      type: 'sales.visit_completed.v1',
      source: 'sales',
      aggregateId: 'old-visit',
      aggregateVersion: 3,
      payload: {
        clientId: 'client-a',
        repId: 'rep-a',
        doNotContact: true,
        customerConsentVersion: 2,
      },
    },
    crmEvent,
  );
  let customer = await crmRepository.transaction('tenant-a', (tx) =>
    tx.get('customers', 'client-a'),
  );
  assert.equal((customer as unknown as { doNotContact: boolean }).doNotContact, false);
  await consumeEvent(
    crmRepository,
    'crm-consent',
    {
      ...event,
      id: 'current-visit-opt-out',
      type: 'sales.visit_completed.v1',
      source: 'sales',
      aggregateId: 'current-visit',
      aggregateVersion: 3,
      payload: {
        clientId: 'client-a',
        repId: 'rep-a',
        doNotContact: true,
        customerConsentVersion: 3,
      },
    },
    crmEvent,
  );
  customer = await crmRepository.transaction('tenant-a', (tx) => tx.get('customers', 'client-a'));
  assert.equal(
    (customer as unknown as { doNotContact: boolean; consentVersion: number }).doNotContact,
    true,
  );
  assert.equal((customer as unknown as { consentVersion: number }).consentVersion, 4);
});

test('dual-role identity sees a draft only through the representative who owns that quote', async (t) => {
  const repository = new MemoryRepository('sales', [
    'visits',
    'quotes',
    'contracts',
    'fulfillments',
    'customer_contexts',
  ]);
  await repository.transaction('tenant-a', async (tx) => {
    await tx.insert('quotes', {
      id: 'dual-role-draft',
      clientId: 'client-a',
      repId: 'rep-a',
      status: 'draft',
      terms: 'Private draft terms',
    });
  });
  const app = salesApp({
    repository,
    auth: async () => ({
      sub: 'dual-role',
      tenantId: 'tenant-a',
      roles: ['rep', 'client'],
      repId: 'rep-b',
      clientId: 'client-a',
    }),
    customerDirectory: {
      async getCustomer() {
        throw new Error('Not used');
      },
    },
  });
  t.after(() => app.close());
  assert.deepEqual((await call(app, 'GET', '/v1/quotes', 'unused')).body.items, []);
  assert.equal((await call(app, 'GET', '/v1/quotes/dual-role-draft', 'unused')).status, 404);
  const ownerApp = salesApp({
    repository,
    auth: async () => ({
      sub: 'dual-owner',
      tenantId: 'tenant-a',
      roles: ['rep', 'client'],
      repId: 'rep-a',
      clientId: 'other-client',
    }),
    customerDirectory: {
      async getCustomer() {
        throw new Error('Not used');
      },
    },
  });
  t.after(() => ownerApp.close());
  assert.equal((await call(ownerApp, 'GET', '/v1/quotes', 'unused')).body.items.length, 1);
  assert.equal((await call(ownerApp, 'GET', '/v1/quotes/dual-role-draft', 'unused')).status, 200);
});

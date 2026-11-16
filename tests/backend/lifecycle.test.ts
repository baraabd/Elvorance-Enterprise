import test from 'node:test';
import assert from 'node:assert/strict';
import type { CustomerContext, Entity, EventEnvelope } from '@atlas/contracts';
import { MemoryRepository } from '@atlas/service-kit';
import { consumeEvent } from '@atlas/events';
import { createApp as crmApp } from '../../services/crm/src/app.ts';
import { createApp as salesApp, handleEvent as salesEvent } from '../../services/sales/src/app.ts';
import {
  createApp as deliveryApp,
  handleEvent as deliveryEvent,
} from '../../services/delivery/src/app.ts';
import {
  createApp as billingApp,
  handleEvent as billingEvent,
} from '../../services/billing/src/app.ts';
import { auth, call, principals } from './helpers.ts';

test('visit → quote → customer acceptance → explicit contract approval → separate project and invoice consumers', async (t) => {
  const crmRepo = new MemoryRepository('crm', ['customers', 'regions']);
  const salesRepo = new MemoryRepository('sales', [
    'visits',
    'quotes',
    'contracts',
    'fulfillments',
    'customer_contexts',
  ]);
  const deliveryRepo = new MemoryRepository('delivery', ['projects']);
  const billingRepo = new MemoryRepository('billing', [
    'contract_accounts',
    'invoices',
    'payments',
  ]);
  const crm = crmApp({ repository: crmRepo, auth });
  const sales = salesApp({
    repository: salesRepo,
    auth,
    customerDirectory: {
      async getCustomer(id, authorization) {
        const response = await crm.inject({
          method: 'GET',
          url: `/v1/customers/${id}/context`,
          headers: { authorization },
        });
        assert.equal(response.statusCode, 200);
        return response.json() as CustomerContext;
      },
    },
  });
  const delivery = deliveryApp({ repository: deliveryRepo, auth });
  const billing = billingApp({ repository: billingRepo, auth });
  t.after(async () => {
    await Promise.all([crm.close(), sales.close(), delivery.close(), billing.close()]);
  });
  const region = (await call(crm, 'POST', '/v1/regions', 'admin', { name: 'Riyadh', code: 'RYD' }))
    .body;
  const customer = (
    await call(crm, 'POST', '/v1/customers', 'rep', {
      name: 'QA Customer',
      regionId: region.id,
      tenantId: 'tenant-b',
      repId: 'rep-b',
    })
  ).body;
  assert.equal(customer.tenantId, 'tenant-a');
  assert.equal(customer.repId, 'rep-a');
  principals.client!.clientId = customer.id;
  let visit = (
    await call(sales, 'POST', '/v1/visits', 'rep', {
      clientId: customer.id,
      purpose: 'Scope discovery',
      scheduledAt: new Date().toISOString(),
    })
  ).body;
  assert.equal((await call(sales, 'GET', `/v1/visits/${visit.id}`, 'otherRep')).status, 404);
  assert.equal((await call(sales, 'GET', `/v1/visits/${visit.id}`, 'outsider')).status, 404);
  const startKey = 'start-idempotent-001';
  const start = {
    expectedVersion: visit.version,
    proof: { kind: 'manual', reason: 'Customer office reception confirmed arrival' },
  };
  visit = (await call(sales, 'POST', `/v1/visits/${visit.id}/start`, 'rep', start, startKey)).body;
  assert.equal(
    (await call(sales, 'POST', `/v1/visits/${visit.id}/start`, 'rep', start, startKey)).body
      .version,
    visit.version,
  );
  assert.equal(
    (
      await call(
        sales,
        'POST',
        `/v1/visits/${visit.id}/start`,
        'rep',
        { ...start, proof: { kind: 'manual', reason: 'Different request content' } },
        startKey,
      )
    ).status,
    409,
  );
  const quoteInput = {
    visitId: visit.id,
    currency: 'SAR',
    items: [
      {
        serviceId: 'web',
        title: 'Website',
        quantity: 1,
        unitPriceMinor: 100001,
        deliverables: ['Responsive website'],
        duration: 'Agreed after discovery',
      },
      {
        serviceId: 'brand',
        title: 'Brand identity',
        quantity: 1,
        unitPriceMinor: 49999,
        deliverables: ['Brand guidelines'],
        duration: 'Two weeks',
      },
    ],
    totalMinor: 1,
    terms: 'Original agreed scope and acceptance terms',
    validUntil: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    paymentPlan: [
      { id: 'deposit', label: 'Deposit', amountMinor: 50000, dueOn: null },
      { id: 'handover', label: 'Handover', amountMinor: 100000, dueOn: null },
    ],
  };
  let quote = (await call(sales, 'POST', '/v1/quotes', 'rep', quoteInput)).body;
  assert.equal(quote.totalMinor, 150000);
  assert.equal(quote.items.length, 2);
  assert.equal((await call(sales, 'GET', `/v1/quotes/${quote.id}`, 'client')).status, 404);
  assert.equal(
    (
      await call(sales, 'POST', '/v1/quotes', 'rep', {
        ...quoteInput,
        paymentPlan: [{ id: 'bad', label: 'Bad installment', amountMinor: 149999 }],
      })
    ).status,
    400,
  );
  assert.equal(
    (await call(sales, 'POST', `/v1/quotes/${quote.id}/send`, 'rep', { expectedVersion: 99 }))
      .status,
    409,
  );
  quote = (
    await call(sales, 'POST', `/v1/quotes/${quote.id}/send`, 'rep', {
      expectedVersion: quote.version,
    })
  ).body;
  assert.equal(
    (
      await call(sales, 'POST', `/v1/quotes/${quote.id}/accept`, 'otherClient', {
        expectedVersion: quote.version,
        consent: true,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call(sales, 'POST', `/v1/quotes/${quote.id}/accept`, 'rep', {
        expectedVersion: quote.version,
        consent: true,
      })
    ).status,
    403,
  );
  const acceptKey = 'accept-idempotent-001';
  const acceptInput = {
    expectedVersion: quote.version,
    consent: true,
    totalMinor: 1,
    terms: 'Tampered terms',
    paymentWishes: 'Please discuss the dates',
  };
  const accepted = await call(
    sales,
    'POST',
    `/v1/quotes/${quote.id}/accept`,
    'client',
    acceptInput,
    acceptKey,
  );
  assert.equal(accepted.status, 200);
  let contract = accepted.body.contract;
  quote = accepted.body.quote;
  assert.equal(contract.status, 'pending');
  assert.equal(contract.totalMinor, 150000);
  assert.equal(contract.terms, quoteInput.terms);
  assert.equal(
    (await call(sales, 'POST', `/v1/quotes/${quote.id}/accept`, 'client', acceptInput, acceptKey))
      .body.contract.id,
    contract.id,
  );
  assert.equal(
    (await call(sales, 'POST', `/v1/quotes/${quote.id}/accept`, 'client', acceptInput)).status,
    409,
  );
  assert.equal(
    salesRepo.events().filter((event) => event.type === 'contract.approved.v1').length,
    0,
  );
  assert.equal((await call(delivery, 'GET', '/v1/projects', 'client')).body.items.length, 0);
  assert.equal(
    (
      await call(sales, 'PATCH', `/v1/quotes/${quote.id}`, 'rep', {
        ...quoteInput,
        expectedVersion: quote.version,
        terms: 'Changed later',
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(sales, 'POST', `/v1/contracts/${contract.id}/approve`, 'client', {
        expectedVersion: contract.version,
        signerName: 'QA Customer',
        consent: false,
      })
    ).status,
    400,
  );
  const approveKey = 'approve-idempotent-001';
  const approveInput = {
    expectedVersion: contract.version,
    signerName: 'QA Customer',
    consent: true,
  };
  contract = (
    await call(
      sales,
      'POST',
      `/v1/contracts/${contract.id}/approve`,
      'client',
      approveInput,
      approveKey,
    )
  ).body;
  assert.equal(contract.status, 'approved');
  assert.equal(
    (
      await call(
        sales,
        'POST',
        `/v1/contracts/${contract.id}/approve`,
        'client',
        approveInput,
        approveKey,
      )
    ).body.id,
    contract.id,
  );
  assert.equal(
    (await call(sales, 'POST', `/v1/contracts/${contract.id}/approve`, 'client', approveInput))
      .status,
    409,
  );
  const approvedEvent = salesRepo.events().find((event) => event.type === 'contract.approved.v1')!;
  assert.equal(
    (await call(sales, 'GET', `/v1/contracts/${contract.id}/fulfillment`, 'client')).body.status,
    'pending',
  );
  assert.equal(
    await consumeEvent(deliveryRepo, 'delivery-test', approvedEvent, deliveryEvent),
    'processed',
  );
  assert.equal(
    await consumeEvent(deliveryRepo, 'delivery-test', approvedEvent, deliveryEvent),
    'duplicate',
  );
  await consumeEvent(
    deliveryRepo,
    'delivery-test',
    { ...approvedEvent, id: 'second-delivery-of-business-event' },
    deliveryEvent,
  );
  await consumeEvent(billingRepo, 'billing-test', approvedEvent, billingEvent);
  assert.equal(
    await consumeEvent(billingRepo, 'billing-test', approvedEvent, billingEvent),
    'duplicate',
  );
  let project = (await call(delivery, 'GET', '/v1/projects', 'client')).body.items[0];
  const invoices = (await call(billing, 'GET', '/v1/invoices', 'client')).body.items;
  assert.equal((await call(delivery, 'GET', '/v1/projects', 'client')).body.items.length, 1);
  assert.equal(project.status, 'planning');
  assert.equal(project.progress, 0);
  assert.deepEqual(project.milestones, []);
  assert.deepEqual(project.deliverables, []);
  assert.equal(project.contractSnapshot.items.length, 2);
  assert.equal(invoices.length, 2);
  assert.equal(
    invoices.reduce((sum: number, invoice: Record<string, any>) => sum + invoice.amountMinor, 0),
    contract.totalMinor,
  );
  assert.deepEqual(invoices.map((invoice: Record<string, any>) => invoice.paymentPlanId).sort(), [
    'deposit',
    'handover',
  ]);
  for (const event of [...deliveryRepo.events(), ...billingRepo.events()])
    await consumeEvent(salesRepo, 'sales-test', event, salesEvent);
  assert.equal(
    (await call(sales, 'GET', `/v1/contracts/${contract.id}/fulfillment`, 'client')).body.status,
    'ready',
  );
  let invoice = invoices[0];
  assert.equal(
    (
      await call(billing, 'POST', `/v1/invoices/${invoice.id}/payments`, 'client', {
        expectedVersion: invoice.version,
        amountMinor: 1,
        requestId: 'client-fake-payment',
        method: 'cash',
        reference: 'Forged customer payment',
      })
    ).status,
    403,
  );
  const payment = {
    expectedVersion: invoice.version,
    amountMinor: invoice.amountMinor,
    requestId: 'receipt-unique-001',
    method: 'bank_transfer',
    reference: 'Verified bank receipt QA001',
  };
  assert.equal(
    (
      await call(billing, 'POST', `/v1/invoices/${invoice.id}/payments`, 'finance', {
        ...payment,
        amountMinor: invoice.amountMinor + 1,
      })
    ).status,
    409,
  );
  const paymentKey = 'payment-idempotent-001';
  const paid = await call(
    billing,
    'POST',
    `/v1/invoices/${invoice.id}/payments`,
    'finance',
    payment,
    paymentKey,
  );
  assert.equal(paid.status, 200);
  assert.equal(paid.body.invoice.status, 'paid');
  assert.equal(
    (
      await call(
        billing,
        'POST',
        `/v1/invoices/${invoice.id}/payments`,
        'finance',
        payment,
        paymentKey,
      )
    ).body.payment.id,
    paid.body.payment.id,
  );
  assert.equal(
    (await call(billing, 'POST', `/v1/invoices/${invoice.id}/payments`, 'finance', payment)).status,
    409,
  );
  assert.equal(
    (await call(billing, 'GET', `/v1/invoices/${invoice.id}/payments`, 'finance')).body.items
      .length,
    1,
  );
  assert.equal(
    (
      await call(delivery, 'POST', `/v1/projects/${project.id}/complete`, 'delivery', {
        expectedVersion: project.version,
      })
    ).status,
    409,
  );
  project = (
    await call(delivery, 'POST', `/v1/projects/${project.id}/milestones`, 'delivery', {
      expectedVersion: project.version,
      title: 'Build the agreed deliverable',
      dueOn: null,
    })
  ).body;
  const milestoneId = project.milestones[0].id;
  assert.equal(
    (
      await call(
        delivery,
        'POST',
        `/v1/projects/${project.id}/milestones/${milestoneId}`,
        'delivery',
        { expectedVersion: project.version, status: 'done' },
      )
    ).status,
    409,
  );
  project = (
    await call(
      delivery,
      'POST',
      `/v1/projects/${project.id}/milestones/${milestoneId}`,
      'delivery',
      { expectedVersion: project.version, status: 'in_progress' },
    )
  ).body;
  project = (
    await call(delivery, 'POST', `/v1/projects/${project.id}/deliverables`, 'delivery', {
      expectedVersion: project.version,
      milestoneId,
      title: 'Implementation preview',
      content: 'A real review description of the completed agreed website and brand materials.',
      url: 'https://example.com/preview',
    })
  ).body;
  const deliverableId = project.deliverables[0].id;
  project = (
    await call(
      delivery,
      'POST',
      `/v1/projects/${project.id}/deliverables/${deliverableId}/review`,
      'client',
      {
        expectedVersion: project.version,
        revision: 1,
        decision: 'changes_requested',
        feedback: 'Please make the contact section clearer',
      },
    )
  ).body;
  assert.equal(project.status, 'active');
  assert.equal(project.progress, 0);
  project = (
    await call(
      delivery,
      'POST',
      `/v1/projects/${project.id}/deliverables/${deliverableId}/revise`,
      'delivery',
      {
        expectedVersion: project.version,
        title: 'Implementation preview',
        content:
          'The revised implementation includes the requested clear contact section and final brand materials.',
        url: 'https://example.com/preview-v2',
      },
    )
  ).body;
  assert.equal(project.deliverables[0].history.length, 1);
  assert.equal(
    (
      await call(
        delivery,
        'POST',
        `/v1/projects/${project.id}/deliverables/${deliverableId}/review`,
        'client',
        { expectedVersion: project.version, revision: 1, decision: 'approved' },
      )
    ).status,
    409,
  );
  project = (
    await call(
      delivery,
      'POST',
      `/v1/projects/${project.id}/deliverables/${deliverableId}/review`,
      'client',
      { expectedVersion: project.version, revision: 2, decision: 'approved' },
    )
  ).body;
  assert.notEqual(project.status, 'completed');
  project = (
    await call(
      delivery,
      'POST',
      `/v1/projects/${project.id}/milestones/${milestoneId}`,
      'delivery',
      { expectedVersion: project.version, status: 'done' },
    )
  ).body;
  assert.equal(project.progress, 95);
  project = (
    await call(delivery, 'POST', `/v1/projects/${project.id}/complete`, 'delivery', {
      expectedVersion: project.version,
    })
  ).body;
  assert.equal(project.status, 'completed');
  assert.equal(project.progress, 100);
  visit = (
    await call(sales, 'POST', `/v1/visits/${visit.id}/complete`, 'rep', {
      expectedVersion: visit.version,
      outcome: 'agreement',
      notes: 'Customer explicitly accepted and approved through their account.',
      agreementSnapshot: { paid: true, totalMinor: 1 },
    })
  ).body;
  assert.equal(visit.status, 'completed');
  assert.equal(visit.agreementSnapshot.quotes[0].totalMinor, 150000);
  assert.equal(visit.agreementSnapshot.contracts[0].status, 'approved');
  assert.equal(visit.agreementSnapshot.paid, undefined);
});

test('transaction rollback includes domain, outbox, idempotency and inbox', async () => {
  const repository = new MemoryRepository('atomic-test', ['records']);
  await assert.rejects(
    repository.transaction('tenant-a', async (tx) => {
      await tx.insert<Entity>('records', { id: 'rolled-back' });
      await tx.emit('test.created.v1', 'rolled-back', 1, {});
      throw new Error('Failure before commit');
    }),
  );
  assert.equal((await repository.transaction('tenant-a', (tx) => tx.list('records'))).length, 0);
  assert.equal(repository.events().length, 0);
  const event: EventEnvelope = {
    id: 'event-retry',
    type: 'test.event.v1',
    schemaVersion: 1,
    source: 'test',
    tenantId: 'tenant-a',
    aggregateId: 'one',
    aggregateVersion: 1,
    occurredAt: new Date().toISOString(),
    correlationId: 'correlation',
    payload: {},
  };
  await assert.rejects(
    consumeEvent(repository, 'consumer', event, async (tx) => {
      await tx.insert<Entity>('records', { id: 'one' });
      throw new Error('Consumer fails');
    }),
  );
  assert.equal(
    await consumeEvent(repository, 'consumer', event, async (tx) => {
      await tx.insert<Entity>('records', { id: 'one' });
    }),
    'processed',
  );
  assert.equal(
    await consumeEvent(repository, 'consumer', event, async () => {
      throw new Error('Must not run twice');
    }),
    'duplicate',
  );
});

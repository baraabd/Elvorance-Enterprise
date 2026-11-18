import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import type { FastifyInstance } from 'fastify';
import { repFixture } from '../backend/rep-fixture.ts';
import { call, principals } from '../backend/helpers.ts';
import { createRepApi } from '../../apps/rep-mobile/src/server/api.ts';
import type { View, ViewContext } from '../../apps/rep-mobile/src/server/context.ts';
import { TrackingController } from '../../apps/rep-mobile/src/server/tracking.ts';
import { customers } from '../../apps/rep-mobile/src/server/views/customers.ts';
import { visits } from '../../apps/rep-mobile/src/server/views/visits.ts';
import { tasks, opportunities, routes } from '../../apps/rep-mobile/src/server/views/planning.ts';
import { catalog } from '../../apps/rep-mobile/src/server/views/records.ts';
import { quotes } from '../../apps/rep-mobile/src/server/views/quotes.ts';
import { messages } from '../../apps/rep-mobile/src/server/views/messages.ts';

// Keep JSDOM's worker files in its installed package when the test runner bundles TS.
const { JSDOM } = createRequire(import.meta.url)('jsdom') as typeof import('jsdom');
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);

async function until(predicate: () => boolean, reason: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(reason);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function fixture(t: TestContext) {
  const services = await repFixture(t);
  const dom = new JSDOM('<main id="app"></main>', { url: 'https://localhost/' });
  const names = [
    'window',
    'document',
    'navigator',
    'localStorage',
    'HTMLElement',
    'HTMLInputElement',
    'HTMLTextAreaElement',
    'HTMLSelectElement',
    'HTMLFormElement',
    'Option',
    'FormData',
    'Event',
    'CustomEvent',
    'AbortController',
    'AbortSignal',
  ] as const;
  const previous = names.map(
    (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  for (const name of names)
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: dom.window[name],
    });
  const controller = new AbortController();
  const root = dom.window.document.querySelector<HTMLElement>('#app')!;
  const requests: {
    method: string;
    path: string;
    body: unknown;
    key: string | null;
    status: number;
  }[] = [];
  const errors: unknown[] = [];
  const notifications: string[] = [];
  let loseResponse = false;
  const serviceMap: Record<string, FastifyInstance> = {
    crm: services.crm,
    sales: services.sales,
    communications: services.communications,
    identity: services.identity,
  };
  const api = createRepApi({
    baseUrl: 'https://gateway.test',
    accessToken: async () => 'rep',
    fetch: async (input, init) => {
      const url = new URL(String(input));
      const service = serviceMap[url.pathname.split('/')[2]!];
      assert.ok(service, `Unexpected UI service ${url.pathname}`);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('authorization'), 'Bearer rep');
      assert.equal(init?.credentials, 'omit');
      assert.equal(init?.cache, 'no-store');
      assert.equal(init?.redirect, 'error');
      const method = (init?.method ?? 'GET') as 'GET' | 'POST' | 'PATCH' | 'PUT';
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      const response = await service.inject({
        method,
        url: url.pathname.replace(/^\/v1\/[^/]+/, '/v1') + url.search,
        headers: Object.fromEntries(headers),
        ...(body === undefined ? {} : { payload: body }),
      });
      requests.push({
        method,
        path: url.pathname,
        body,
        key: headers.get('idempotency-key'),
        status: response.statusCode,
      });
      if (loseResponse && method !== 'GET' && response.statusCode < 400) {
        loseResponse = false;
        throw new TypeError('The connection closed after the service committed the command.');
      }
      return new Response(response.body, {
        status: response.statusCode,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  let current: View = customers;
  const context: ViewContext = {
    api,
    root,
    signal: controller.signal,
    principal: structuredClone(principals.rep!),
    refresh: async () => {
      root.replaceChildren();
      await current(context);
    },
    navigate: async () => {
      throw new Error('Unexpected navigation in view integration test');
    },
    notify: (message) => notifications.push(message),
    tracking: new TrackingController(api, () => {}),
  };
  root.addEventListener('rep:error', (event) => errors.push((event as CustomEvent).detail), {
    signal: controller.signal,
  });
  t.after(() => {
    controller.abort();
    api.clear();
    dom.window.close();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  return {
    ...services,
    dom,
    root,
    requests,
    errors,
    notifications,
    context,
    dropNextCommittedResponse: () => {
      loseResponse = true;
    },
    async render(view: View) {
      current = view;
      await context.refresh();
    },
  };
}

function button(root: ParentNode, label: string): HTMLButtonElement {
  const result = Array.from(root.querySelectorAll('button')).find(
    (node) => node.textContent === label,
  );
  assert.ok(result, `Missing button: ${label}`);
  return result;
}

function article(root: ParentNode, title: string): HTMLElement {
  const result = Array.from(root.querySelectorAll<HTMLElement>('article.card')).find(
    (node) => node.querySelector('h2')?.textContent === title,
  );
  assert.ok(result, `Missing record card: ${title}`);
  return result;
}

async function editor(root: ParentNode, label: string): Promise<HTMLFormElement> {
  button(root, label).click();
  await until(() => Boolean(root.querySelector('form')), `Editor did not open: ${label}`);
  return root.querySelector<HTMLFormElement>('form')!;
}

function fill(form: HTMLFormElement, values: Record<string, string | boolean>): void {
  for (const [name, value] of Object.entries(values)) {
    const control = form.elements.namedItem(name);
    assert.ok(
      control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement,
      `Missing field ${name}`,
    );
    if (control instanceof HTMLInputElement && control.type === 'checkbox')
      control.checked = Boolean(value);
    else control.value = String(value);
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

async function submit(
  form: HTMLFormElement,
  values: Record<string, string | boolean> = {},
  doubleClick = false,
): Promise<string> {
  fill(form, values);
  assert.equal(
    form.reportValidity(),
    true,
    'The test must satisfy visible HTML validation before submitting.',
  );
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(form.getAttribute('aria-busy'), 'true');
  if (doubleClick) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await until(() => !form.hasAttribute('aria-busy'), 'Form submission did not settle');
  return form.querySelector('.form-status')?.textContent ?? '';
}

test('customer UI creates with defaults and preserves money, arrays and text safely when editing', async (t) => {
  const f = await fixture(t);
  await f.render(customers);
  const form = await editor(f.root, 'إضافة عميل');
  assert.equal(
    await submit(
      form,
      {
        name: 'UI customer',
        phone: '+966500001111',
        budgetMinor: '123.45',
        tags: 'priority، local,priority',
        needs: 'website، support',
      },
      true,
    ),
    'تم الحفظ.',
  );
  const saved = (await call(f.crm, 'GET', '/v1/customers', 'rep')).body.items.find(
    (item: { name: string }) => item.name === 'UI customer',
  );
  assert.equal(saved.status, 'new');
  assert.equal(saved.budgetMinor, 12345);
  assert.deepEqual(saved.tags, ['priority', 'local']);
  assert.deepEqual(saved.needs, ['website', 'support']);
  assert.equal(
    f.requests.filter((entry) => entry.path === '/v1/crm/customers' && entry.method === 'POST')
      .length,
    1,
  );
  const change = await editor(article(f.root, 'UI customer'), 'تعديل البيانات');
  assert.equal((change.elements.namedItem('budgetMinor') as HTMLInputElement).value, '123.45');
  const unsafeText = '<img src=x onerror=alert(1)> customer';
  assert.equal(
    await submit(change, { name: unsafeText, status: 'qualified', notes: 'Reviewed in the UI' }),
    'تم الحفظ.',
  );
  const updated = (await call(f.crm, 'GET', `/v1/customers/${saved.id}`, 'rep')).body;
  assert.equal(updated.budgetMinor, 12345);
  assert.equal(updated.status, 'qualified');
  assert.deepEqual(updated.tags, ['priority', 'local']);
  assert.match(f.root.textContent ?? '', /<img src=x onerror=alert\(1\)> customer/);
  assert.equal(f.root.querySelector('img'), null);
  assert.deepEqual(f.errors, []);
});

test('an ambiguous UI save retries the same idempotency key without losing input or creating duplicates', async (t) => {
  const f = await fixture(t);
  await f.render(customers);
  const form = await editor(f.root, 'إضافة عميل');
  f.dropNextCommittedResponse();
  assert.match(await submit(form, { name: 'Retry customer', status: 'new' }), /تعذّر الاتصال/);
  assert.equal((form.elements.namedItem('name') as HTMLInputElement).value, 'Retry customer');
  assert.equal(await submit(form), 'تم الحفظ.');
  const commands = f.requests.filter(
    (entry) => entry.method === 'POST' && entry.path === '/v1/crm/customers',
  );
  assert.equal(commands.length, 2);
  assert.ok(commands[0]!.key);
  assert.equal(commands[0]!.key, commands[1]!.key);
  const saved = (await call(f.crm, 'GET', '/v1/customers', 'rep')).body.items.filter(
    (item: { name: string }) => item.name === 'Retry customer',
  );
  assert.equal(saved.length, 1);
});

test('visit UI schedules, records an explicit manual arrival, and completes with the service version', async (t) => {
  const f = await fixture(t);
  await f.render(visits);
  const scheduledAt = new Date(Date.now() + 3600000).toISOString().slice(0, 16);
  const planned = await editor(f.root, 'جدولة زيارة');
  assert.equal(
    await submit(planned, {
      clientId: f.customer.id,
      scheduledAt,
      purpose: 'UI qualification visit',
    }),
    'تم الحفظ.',
  );
  const arriving = await editor(article(f.root, f.customer.name), 'تسجيل الوصول');
  assert.match(await submit(arriving, { kind: 'manual', reason: 'no' }), /خمسة أحرف/);
  assert.equal(f.requests.filter((entry) => entry.path.endsWith('/start')).length, 0);
  assert.equal(
    await submit(arriving, { reason: 'Customer confirmed arrival; GPS unavailable indoors' }),
    'تم الحفظ.',
  );
  const active = (await call(f.sales, 'GET', '/v1/visits', 'rep')).body.items[0];
  assert.equal(active.status, 'active');
  assert.equal(active.startProof.kind, 'manual');
  const completion = await editor(article(f.root, f.customer.name), 'إنهاء الزيارة');
  assert.equal(
    await submit(completion, {
      outcome: 'follow_up',
      notes: 'Discussed requirements and timing',
      nextStep: 'Prepare a priced proposal',
    }),
    'تم الحفظ.',
  );
  const completed = (await call(f.sales, 'GET', `/v1/visits/${active.id}`, 'rep')).body;
  assert.equal(completed.status, 'completed');
  assert.equal(completed.nextStep, 'Prepare a priced proposal');
  assert.equal(completed.version, active.version + 1);
});

test('published catalog feeds quote UI prices and a balanced payment plan before sending', async (t) => {
  const f = await fixture(t);
  await f.publish();
  const visit = await f.start();
  await f.render(catalog);
  assert.match(f.root.textContent ?? '', /Managed website/);
  await f.render(quotes);
  const form = await editor(f.root, 'إعداد عرض');
  fill(form, {
    visitId: visit.id,
    validUntil: tomorrow(),
    terms: 'Company website scope and customer-approved schedule',
    discount: '10.00',
  });
  const fields = Array.from(form.querySelectorAll<HTMLElement>('fieldset'));
  const lines = fields.find(
    (field) => field.querySelector('legend')?.textContent === 'بنود العرض',
  )!;
  (lines.querySelector('select') as HTMLSelectElement).value = 'web';
  (lines.querySelector('input[name$="_price"]') as HTMLInputElement).value = '0.01';
  const installments = fields.find(
    (field) => field.querySelector('legend')?.textContent === 'جدول الدفعات',
  )!;
  const amount = installments.querySelector<HTMLInputElement>('input[name$="_amount"]')!;
  amount.value = '80.00';
  assert.match(await submit(form), /مجموع الدفعات/);
  assert.equal(
    f.requests.filter((entry) => entry.method === 'POST' && entry.path === '/v1/sales/quotes')
      .length,
    0,
  );
  button(form, 'تعبئة الدفعة الأولى بكامل الإجمالي').click();
  await until(
    () => amount.value === '90.00',
    'Payment auto-fill did not use the published catalog price',
  );
  assert.equal(await submit(form), 'تم الحفظ.');
  const saved = (await call(f.sales, 'GET', '/v1/quotes', 'rep')).body.items[0];
  assert.equal(saved.items[0].unitPriceMinor, 10000);
  assert.equal(saved.totalMinor, 9000);
  assert.equal(saved.paymentPlan[0].amountMinor, 9000);
  assert.equal(saved.status, 'draft');
  const sending = await editor(article(f.root, f.customer.name), 'إرسال للعميل');
  assert.equal(await submit(sending), 'تم الحفظ.');
  assert.equal((await call(f.sales, 'GET', `/v1/quotes/${saved.id}`, 'rep')).body.status, 'sent');
});

test('discovery UI validates and persists the published tenant questionnaire', async (t) => {
  const f = await fixture(t);
  const configuration = await f.publish();
  await f.render(customers);
  const form = await editor(article(f.root, f.customer.name), 'اكتشاف الاحتياج');
  fill(form, { activityId: 'services', status: 'submitted' });
  assert.ok(form.elements.namedItem('need'));
  assert.match(await submit(form), /استكمال الإجابات/);
  assert.equal(f.requests.filter((entry) => entry.method === 'PUT').length, 0);
  assert.equal(
    await submit(form, {
      need: 'A maintainable website integrated with customer support',
      notes: 'Decision maker confirmed priorities',
    }),
    'تم الحفظ.',
  );
  const saved = (await call(f.crm, 'GET', `/v1/customers/${f.customer.id}/discovery`, 'rep')).body
    .record;
  assert.equal(saved.status, 'submitted');
  assert.equal(saved.configurationRevision, configuration.definition.revision);
  assert.equal(saved.answers.need, 'A maintainable website integrated with customer support');
});

test('discovery solution choices come from the active tenant catalog and round-trip through CRM', async (t) => {
  const f = await fixture(t);
  f.configurationInput.definition.questions.push({
    id: 'solutions',
    label: 'Select services requested by this customer',
    section: 'solution',
    type: 'multi',
    required: true,
    active: true,
    activityIds: ['services'],
    order: 20,
    options: [],
    otherAllowed: false,
    min: null,
    max: null,
  });
  f.configurationInput.catalog.push({
    id: 'retired',
    title: 'Retired service',
    price: 20,
    category: 'software',
    active: false,
  });
  await f.publish();
  await f.render(customers);
  const form = await editor(article(f.root, f.customer.name), 'اكتشاف الاحتياج');
  fill(form, {
    activityId: 'services',
    status: 'submitted',
    need: 'A maintained customer website',
  });
  const solutions = form.elements.namedItem('solutions') as HTMLSelectElement;
  assert.ok(solutions instanceof HTMLSelectElement);
  assert.equal(solutions.multiple, true);
  assert.deepEqual(
    Array.from(solutions.options, (option) => option.value),
    ['web', 'custom'],
  );
  assert.equal(await submit(form, { solutions: 'web' }), 'تم الحفظ.');
  const saved = (await call(f.crm, 'GET', `/v1/customers/${f.customer.id}/discovery`, 'rep')).body
    .record;
  assert.equal(saved.status, 'submitted');
  assert.deepEqual(saved.answers.solutions, ['web']);
  const reopened = await editor(article(f.root, f.customer.name), 'اكتشاف الاحتياج');
  assert.deepEqual(
    Array.from(
      (reopened.elements.namedItem('solutions') as HTMLSelectElement).selectedOptions,
      (option) => option.value,
    ),
    ['web'],
  );
});

test('task UI creates and completes assigned work and renders version conflicts without overwriting', async (t) => {
  const f = await fixture(t);
  await f.render(tasks);
  const form = await editor(f.root, 'إضافة');
  assert.equal(
    await submit(form, {
      title: 'Prepare customer scope',
      clientId: f.customer.id,
      dueOn: tomorrow(),
      notes: 'Discuss with the customer',
    }),
    'تم الحفظ.',
  );
  const saved = (await call(f.sales, 'GET', '/v1/tasks', 'rep')).body.items[0];
  assert.equal(saved.priority, 'normal');
  assert.equal(saved.status, 'open');
  const change = await editor(article(f.root, 'Prepare customer scope'), 'تعديل');
  assert.equal(await submit(change, { status: 'done' }), 'تم الحفظ.');
  const completed = (await call(f.sales, 'GET', `/v1/tasks/${saved.id}`, 'rep')).body;
  assert.equal(completed.status, 'done');
  const stale = await editor(article(f.root, 'Prepare customer scope'), 'تعديل');
  const concurrent = await call(f.sales, 'PATCH', `/v1/tasks/${saved.id}`, 'rep', {
    expectedVersion: completed.version,
    notes: 'Changed on another device',
  });
  assert.equal(concurrent.status, 200);
  assert.match(await submit(stale, { notes: 'Stale overwrite attempt' }), /تغيّر السجل/);
  assert.equal(
    (await call(f.sales, 'GET', `/v1/tasks/${saved.id}`, 'rep')).body.notes,
    'Changed on another device',
  );
});

test('an existing opportunity can close lost after withdrawal while new sales remain blocked', async (t) => {
  const f = await fixture(t);
  await f.render(opportunities);
  const create = await editor(f.root, 'إضافة');
  assert.equal(
    await submit(create, {
      title: 'Customer website opportunity',
      clientId: f.customer.id,
      valueMinor: '100.00',
    }),
    'تم الحفظ.',
  );
  const saved = (await call(f.sales, 'GET', '/v1/opportunities', 'rep')).body.items[0];
  const withdrawal = await call(f.crm, 'PATCH', `/v1/customers/${f.customer.id}`, 'rep', {
    expectedVersion: f.customer.version,
    doNotContact: true,
  });
  assert.equal(withdrawal.status, 200);
  await f.render(opportunities);
  const change = await editor(article(f.root, 'Customer website opportunity'), 'تعديل');
  const client = change.elements.namedItem('clientId') as HTMLSelectElement;
  assert.equal(
    client.value,
    f.customer.id,
    'Editing must retain the immutable customer assignment.',
  );
  assert.equal(await submit(change, { stage: 'lost' }), 'تم الحفظ.');
  const closed = (await call(f.sales, 'GET', `/v1/opportunities/${saved.id}`, 'rep')).body;
  assert.equal(closed.stage, 'lost');
  const newSale = await editor(f.root, 'إضافة');
  assert.equal((newSale.elements.namedItem('clientId') as HTMLSelectElement).options.length, 0);
  const denied = await call(f.sales, 'POST', '/v1/opportunities', 'rep', {
    clientId: f.customer.id,
    title: 'Forbidden new opportunity',
    valueMinor: 10000,
  });
  assert.equal(denied.status, 409);
  assert.equal(denied.body.error.code, 'DO_NOT_CONTACT');
});

test('route editing retains a cancelled stop for completion but creation excludes cancelled visits', async (t) => {
  const f = await fixture(t);
  const instant = new Date(Date.now() + 3600000).toISOString();
  const visit = await f.schedule(instant);
  await f.render(routes);
  const create = await editor(f.root, 'إضافة');
  assert.equal(
    await submit(create, {
      name: 'Customer route plan',
      date: instant.slice(0, 10),
      visitIds: visit.id,
    }),
    'تم الحفظ.',
  );
  const saved = (await call(f.sales, 'GET', '/v1/routes', 'rep')).body.items[0];
  const cancelled = await call(f.sales, 'POST', `/v1/visits/${visit.id}/cancel`, 'rep', {
    expectedVersion: visit.version,
    reason: 'Customer requested cancellation of this visit',
  });
  assert.equal(cancelled.status, 200);
  await f.render(routes);
  const next = await editor(f.root, 'إضافة');
  assert.equal((next.elements.namedItem('visitIds') as HTMLSelectElement).options.length, 0);
  const change = await editor(article(f.root, 'Customer route plan'), 'تعديل');
  const selected = Array.from(
    (change.elements.namedItem('visitIds') as HTMLSelectElement).selectedOptions,
    (option) => option.value,
  );
  assert.deepEqual(
    selected,
    [visit.id],
    'The existing cancelled stop must not disappear from the edit payload.',
  );
  assert.equal(await submit(change, { status: 'completed' }), 'تم الحفظ.');
  const completed = (await call(f.sales, 'GET', `/v1/routes/${saved.id}`, 'rep')).body;
  assert.equal(completed.status, 'completed');
  assert.deepEqual(completed.visitIds, [visit.id]);
});

test('messaging UI opens customer conversations, sends escaped content and persists explicit read receipts', async (t) => {
  const f = await fixture(t);
  await f.render(messages);
  const start = await editor(f.root, 'بدء محادثة');
  assert.equal(await submit(start, { clientId: f.customer.id }), 'تم الحفظ.');
  const conversation = (await call(f.communications, 'GET', '/v1/conversations', 'rep')).body
    .items[0];
  button(article(f.root, f.customer.name), 'فتح المحادثة').click();
  await until(
    () => Boolean(f.root.querySelector('form textarea[name="body"]')),
    'Message thread did not open',
  );
  const form = f.root.querySelector<HTMLFormElement>('form')!;
  const body = '<script>alert(1)</script> Confirmed the meeting time';
  assert.equal(await submit(form, { body }), 'تم الحفظ.');
  assert.match(f.root.textContent ?? '', /<script>alert\(1\)<\/script>/);
  assert.equal(f.root.querySelector('script'), null);
  const thread = (
    await call(f.communications, 'GET', `/v1/conversations/${conversation.id}/messages`, 'rep')
  ).body;
  assert.equal(thread.items.length, 1);
  assert.equal(thread.items[0].body, body);
  assert.equal(thread.receipt, null);
  button(f.root, 'تعليم الرسائل المعروضة كمقروءة').click();
  await until(
    () => f.notifications.includes('تم تسجيل القراءة.'),
    'Read receipt was not confirmed',
  );
  const read = (
    await call(f.communications, 'GET', `/v1/conversations/${conversation.id}/messages`, 'rep')
  ).body.receipt;
  assert.equal(read.subject, principals.rep!.sub);
  assert.equal(read.lastMessageId, thread.items[0].id);
});

test('no-contact visit UI persists CRM withdrawal before sales completion without broker delivery', async (t) => {
  for (const concurrentCompletion of [false, true]) {
    await t.test(
      concurrentCompletion
        ? 'a failed second command keeps withdrawal in force'
        : 'successful completion blocks further contact immediately',
      async (scenario) => {
        const f = await fixture(scenario);
        await f.publish();
        const active = await f.start();
        const conversation = await call(f.communications, 'POST', '/v1/conversations', 'rep', {
          clientId: f.customer.id,
        });
        assert.equal(conversation.status, 200);
        await f.render(visits);
        const form = await editor(article(f.root, f.customer.name), 'إنهاء الزيارة');

        if (concurrentCompletion) {
          // A second device commits a legitimate completion after this UI captured its version.
          const competing = await call(f.sales, 'POST', `/v1/visits/${active.id}/complete`, 'rep', {
            expectedVersion: active.version,
            outcome: 'follow_up',
            notes: 'Completed concurrently on another device',
            nextStep: 'Review the customer preference',
          });
          assert.equal(competing.status, 200);
        }

        const status = await submit(form, {
          outcome: 'no_contact',
          notes: 'Customer expressly withdrew permission for further contact',
          nextStep: 'Respect the withdrawal',
        });
        if (concurrentCompletion) assert.match(status, /تغيّر السجل/);
        else assert.equal(status, 'تم الحفظ.');

        const commands = f.requests.filter((request) => request.method !== 'GET');
        assert.deepEqual(
          commands.map(({ method, path, status }) => ({ method, path, status })),
          [
            { method: 'PATCH', path: `/v1/crm/customers/${f.customer.id}`, status: 200 },
            {
              method: 'POST',
              path: `/v1/sales/visits/${active.id}/complete`,
              status: concurrentCompletion ? 409 : 200,
            },
          ],
        );
        const customer = (await call(f.crm, 'GET', `/v1/customers/${f.customer.id}`, 'rep')).body;
        assert.equal(customer.doNotContact, true);
        const completed = (await call(f.sales, 'GET', `/v1/visits/${active.id}`, 'rep')).body;
        assert.equal(completed.outcome, concurrentCompletion ? 'follow_up' : 'no_contact');

        // This fixture has no broker consumer. Both services consult CRM's current authority.
        const quote = await call(f.sales, 'POST', '/v1/quotes', 'rep', f.quoteInput(active.id));
        assert.equal(quote.status, 409);
        assert.equal(quote.body.error.code, 'DO_NOT_CONTACT');
        const message = await call(
          f.communications,
          'POST',
          `/v1/conversations/${conversation.body.id}/messages`,
          'rep',
          {
            expectedVersion: conversation.body.version,
            body: 'This outbound message must be rejected',
          },
        );
        assert.equal(message.status, 409);
        assert.equal(message.body.error.code, 'DO_NOT_CONTACT');
        const thread = (
          await call(
            f.communications,
            'GET',
            `/v1/conversations/${conversation.body.id}/messages`,
            'rep',
          )
        ).body;
        assert.equal(thread.items.length, 0);
        assert.deepEqual(f.errors, []);
      },
    );
  }
});

/* Migrated v1.1 regression cases: sources are generated from the CURRENT modular workspaces, never the old application code. */
/* Real DOM lifecycle tests. Run after npm install: node tests/client-lifecycle.cjs.
 * These verify local demo workflows, not real payment, signing or browser layout. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '../../dist/test-adapters');
const key = 'atlas.crm.2027.v1';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [];
const contexts = [];
const cents = (value) => Math.round(Number(value) * 100);

async function create(app = 'client', snapshot) {
  const errors = [],
    console = new VirtualConsole();
  console.on('jsdomError', (error) => errors.push(String(error)));
  console.on('error', (...args) => errors.push(args.map(String).join(' ')));
  const dom = new JSDOM(
    '<!doctype html><html lang="ar" dir="rtl"><head></head><body><div id="app"></div></body></html>',
    {
      url: 'https://atlas-lifecycle.test/' + app + '.html',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      virtualConsole: console,
    },
  );
  const w = dom.window;
  w.scrollTo = () => {};
  if (snapshot)
    w.localStorage.setItem(key, typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot));
  for (const file of [
    'src/shared/icons.js',
    'src/shared/seed.js',
    'src/shared/core.js',
    'src/apps/' + app + '.js',
  ])
    w.eval(fs.readFileSync(path.join(root, file), 'utf8') + '\n//# sourceURL=' + file);
  w.Atlas.start(app);
  await pause(5);
  const context = { dom, w, A: w.Atlas, errors };
  contexts.push(context);
  return context;
}
function $(ctx, selector) {
  const element = ctx.w.document.querySelector(selector);
  assert.ok(element, 'Missing control ' + selector);
  return element;
}
function fill(ctx, name, value) {
  const element = $(ctx, '[name="' + name + '"]');
  if (element.type === 'checkbox') element.checked = Boolean(value);
  else element.value = String(value);
  element.dispatchEvent(new ctx.w.Event('input', { bubbles: true }));
  return element;
}
async function go(ctx, route, params = {}) {
  ctx.A.go(route, params);
  await pause(12);
  assert.equal(ctx.A.route(), route);
  assert.ok(!$(ctx, '#main-content').textContent.includes('تعذر عرض هذه الصفحة'));
}
async function click(ctx, selector) {
  $(ctx, selector).dispatchEvent(
    new ctx.w.MouseEvent('click', { bubbles: true, cancelable: true }),
  );
  await pause(12);
}
async function submit(ctx, action, form) {
  (form || $(ctx, 'form[data-submit="' + action + '"]')).dispatchEvent(
    new ctx.w.Event('submit', { bubbles: true, cancelable: true }),
  );
  await pause(25);
}
const snapshot = (ctx) => JSON.parse(ctx.w.localStorage.getItem(key));
const ownContract = (ctx) =>
  ctx.A.state().contracts.find((contract) => contract.quoteId === 'quote-1');
function newerStorage(ctx, mutate) {
  const next = snapshot(ctx);
  mutate(next);
  next._revision++;
  next._updatedAt = new Date().toISOString();
  ctx.w.localStorage.setItem(key, JSON.stringify(next));
}
async function accept(ctx, quoteId = 'quote-1') {
  await go(ctx, 'quote-detail', { id: quoteId });
  await click(ctx, '[data-action="accept-quote-modal"]');
  fill(ctx, 'acceptTerms', true);
  await submit(ctx, 'accept-quote');
  return ctx.A.state().contracts.find((contract) => contract.quoteId === quoteId);
}
async function sign(ctx, contractId) {
  await go(ctx, 'contract-detail', { id: contractId });
  await click(ctx, '[data-action="sign-contract-modal"]');
  fill(ctx, 'signer', 'أحمد المصري');
  fill(ctx, 'confirmation', 'أوافق');
  fill(ctx, 'demoConsent', true);
  const oldForm = $(ctx, 'form[data-submit="sign-contract"]');
  await submit(ctx, 'sign-contract');
  return oldForm;
}
async function check(name, fn) {
  const firstContext = contexts.length;
  try {
    const evidence = await fn();
    const errors = contexts.slice(firstContext).flatMap((context) => context.errors);
    assert.deepEqual(errors, []);
    checks.push({ name, status: 'passed', evidence });
    console.log('PASS ' + name);
  } catch (error) {
    checks.push({ name, status: 'failed', message: error.message, stack: error.stack });
    console.error('FAIL ' + name + ': ' + error.message);
  } finally {
    contexts.slice(firstContext).forEach((context) => context.w.close());
  }
}

async function main() {
  await check(
    'Quote scope, original terms and numeric prices survive catalog changes before and after signing',
    async () => {
      const ctx = await create();
      ctx.A.update((state) => {
        const quote = state.quotes.find((row) => row.id === 'quote-1');
        quote.items = [
          {
            serviceId: 'svc-web',
            title: 'موقع متفق عليه',
            qty: 1,
            price: 100.01,
            features: ['صفحات متجاوبة'],
            deliverables: ['ثلاث صفحات متفق عليها'],
          },
          {
            serviceId: 'svc-brand',
            title: 'دليل علامة متفق عليه',
            qty: 1,
            price: 50,
            features: [],
            deliverables: ['دليل الهوية الأصلي'],
          },
        ];
        quote.total = 150.01;
        quote.discount = 0;
        quote.terms = '40% عند البدء و60% عند التسليم. ثلاث صفحات فقط.';
        quote.scopeSnapshot = { items: JSON.parse(JSON.stringify(quote.items)) };
      });
      const quoted = JSON.parse(
        JSON.stringify(ctx.A.state().quotes.find((row) => row.id === 'quote-1')),
      );
      const contract = await accept(ctx);
      assert.ok(contract);
      assert.equal(contract.terms, quoted.terms);
      assert.equal(contract.total, 150.01);
      assert.equal(contract.itemsSnapshot[0].price, 100.01);
      assert.equal(contract.scopeSnapshot[0].deliverables[0], 'ثلاث صفحات متفق عليها');
      ctx.A.update((state) => {
        const service = state.catalog.find((row) => row.id === 'svc-web');
        service.title = 'كتالوج تغير';
        service.price = 99999;
        service.deliverables = ['تسليم مختلف غير متفق عليه'];
      });
      await sign(ctx, contract.id);
      const current = ctx.A.state().contracts.find((row) => row.id === contract.id),
        project = ctx.A.state().projects.find((row) => row.id === current.projectId);
      assert.equal(current.terms, quoted.terms);
      assert.equal(current.total, 150.01);
      assert.equal(current.scopeSnapshot[0].deliverables[0], 'ثلاث صفحات متفق عليها');
      assert.deepEqual(Array.from(project.serviceIds), ['svc-web', 'svc-brand']);
      await go(ctx, 'contract-detail', { id: contract.id });
      assert.ok($(ctx, '#main-content').textContent.includes('ثلاث صفحات متفق عليها'));
      assert.ok(!$(ctx, '#main-content').textContent.includes('تسليم مختلف غير متفق عليه'));
      return {
        total: current.total,
        services: Array.from(project.serviceIds),
        preservedTerms: true,
        catalogNotContractSource: true,
      };
    },
  );
  await check(
    'Signing provisions one planning project and matching invoices; repeated signing creates nothing',
    async () => {
      const ctx = await create(),
        contract = await accept(ctx);
      const oldForm = await sign(ctx, contract.id);
      const current = ctx.A.state().contracts.find((row) => row.id === contract.id),
        projects = ctx.A.state().projects.filter((row) => row.contractId === contract.id),
        invoices = ctx.A.state().invoices.filter((row) => row.contractId === contract.id);
      assert.equal(current.status, 'signed');
      assert.equal(projects.length, 1);
      assert.equal(projects[0].status, 'planning');
      assert.equal(projects[0].stage, 'discovery');
      assert.equal(projects[0].progress, 0);
      assert.equal(projects[0].deliverables.length, 0);
      assert.ok(
        projects[0].milestones.every((row) => row.status === 'pending' && row.date === null),
      );
      assert.equal(invoices.length, current.paymentPlan.length);
      assert.equal(
        invoices.reduce((sum, row) => sum + cents(row.total), 0),
        cents(current.total),
      );
      assert.ok(
        invoices.every(
          (row) =>
            current.paymentPlan.some(
              (part) => part.id === row.paymentPlanId && cents(part.amount) === cents(row.total),
            ) &&
            row.paid === 0 &&
            row.projectId === projects[0].id,
        ),
      );
      await submit(ctx, 'sign-contract', oldForm);
      assert.equal(
        ctx.A.state().projects.filter((row) => row.contractId === contract.id).length,
        1,
      );
      assert.equal(
        ctx.A.state().invoices.filter((row) => row.contractId === contract.id).length,
        invoices.length,
      );
      await go(ctx, 'project-detail', { id: projects[0].id });
      assert.equal(
        ctx.w.document.querySelectorAll('.client-stage-list .current,.client-stage-list .done')
          .length,
        0,
      );
      assert.ok($(ctx, '#main-content').textContent.includes('لم يبدأ التنفيذ'));
      return {
        projects: 1,
        invoices: invoices.length,
        stage: 'discovery',
        planning: true,
        repeatedSignSafe: true,
      };
    },
  );
  await check('Percentage installment rounding preserves every cent', async () => {
    const ctx = await create();
    ctx.A.update((state) => {
      const quote = state.quotes.find((row) => row.id === 'quote-1');
      quote.items = [
        { serviceId: 'svc-web', title: 'اختبار مبالغ الدفعات', qty: 1, price: 100.01 },
      ];
      quote.total = 100.01;
      quote.terms = '33.33% أولى، 33.33% ثانية، 33.34% عند التسليم.';
    });
    const contract = await accept(ctx);
    await sign(ctx, contract.id);
    const invoices = ctx.A.state().invoices.filter((row) => row.contractId === contract.id);
    assert.equal(
      invoices.reduce((sum, row) => sum + cents(row.total), 0),
      10001,
    );
    assert.equal(invoices.length, 3);
    assert.ok(invoices.every((row) => row.total > 0));
    return { invoiceCents: Array.from(invoices, (row) => cents(row.total)), totalCents: 10001 };
  });
  await check(
    'Latest-storage expiry and changed quote scope reject stale acceptance without partial writes',
    async () => {
      for (const change of [
        (quote) => {
          quote.validUntil = '2000-01-01';
        },
        (quote) => {
          quote.terms = 'نطاق جديد لم يطلع عليه العميل بعد.';
        },
      ]) {
        const ctx = await create();
        await go(ctx, 'quote-detail', { id: 'quote-1' });
        await click(ctx, '[data-action="accept-quote-modal"]');
        fill(ctx, 'acceptTerms', true);
        newerStorage(ctx, (state) => change(state.quotes.find((row) => row.id === 'quote-1')));
        await submit(ctx, 'accept-quote');
        const stored = snapshot(ctx);
        assert.equal(stored.quotes.find((row) => row.id === 'quote-1').status, 'sent');
        assert.equal(stored.contracts.filter((row) => row.quoteId === 'quote-1').length, 0);
        assert.ok($(ctx, '#app-modal').open);
        assert.equal(ctx.w.document.querySelectorAll('.toast-success').length, 0);
      }
    },
  );
  await check(
    'Changed contract terms and unbalanced installments cannot sign or create resources',
    async () => {
      const ctx = await create();
      await go(ctx, 'contract-detail', { id: 'contract-2' });
      await click(ctx, '[data-action="sign-contract-modal"]');
      fill(ctx, 'signer', 'أحمد المصري');
      fill(ctx, 'confirmation', 'أوافق');
      fill(ctx, 'demoConsent', true);
      newerStorage(ctx, (state) => {
        state.contracts.find((row) => row.id === 'contract-2').terms += '\nتغيير لم يراجع.';
      });
      await submit(ctx, 'sign-contract');
      assert.equal(
        snapshot(ctx).contracts.find((row) => row.id === 'contract-2').status,
        'pending',
      );
      assert.equal(
        snapshot(ctx).projects.filter((row) => row.contractId === 'contract-2').length,
        0,
      );
      const another = await create();
      another.A.update((state) => {
        state.contracts.find((row) => row.id === 'contract-2').paymentPlan[0].amount = 419;
      });
      await sign(another, 'contract-2');
      assert.equal(
        another.A.state().contracts.find((row) => row.id === 'contract-2').status,
        'pending',
      );
      assert.equal(
        another.A.state().invoices.filter((row) => row.contractId === 'contract-2').length,
        0,
      );
    },
  );
  await check(
    'Old signed contract recovery preserves historical paid balance and signer without re-signing',
    async () => {
      const ctx = await create();
      ctx.A.update((state) => {
        const contract = state.contracts.find((row) => row.id === 'contract-2');
        contract.status = 'signed';
        contract.signer = 'صاحب الموافقة السابق';
        contract.signedAt = '2026-01-01T12:00:00Z';
        contract.paid = 123.45;
      });
      await go(ctx, 'contract-detail', { id: 'contract-2' });
      await click(ctx, '[data-action="provision-contract"]');
      const state = ctx.A.state(),
        contract = state.contracts.find((row) => row.id === 'contract-2'),
        invoices = state.invoices.filter((row) => row.contractId === contract.id);
      assert.equal(contract.signer, 'صاحب الموافقة السابق');
      assert.equal(contract.signedAt, '2026-01-01T12:00:00Z');
      assert.equal(contract.status, 'signed');
      assert.equal(contract.paid, 123.45);
      assert.equal(
        invoices.reduce((sum, row) => sum + cents(row.paid), 0),
        12345,
      );
      assert.equal(
        invoices.reduce((sum, row) => sum + cents(row.total), 0),
        42000,
      );
      assert.equal(invoices[0].openingBalance, 123.45);
      assert.equal(invoices[0].payments.length, 0);
      assert.equal(ctx.w.document.querySelectorAll('[data-action="provision-contract"]').length, 0);
      return { paidPreserved: 123.45, noNewPaymentLedger: true, originalSignaturePreserved: true };
    },
  );
  await check(
    'Existing active project recovery adds only missing invoice and preserves legacy projects and dates',
    async () => {
      const ctx = await create(),
        before = snapshot(ctx);
      await go(ctx, 'contract-detail', { id: 'contract-1' });
      await click(ctx, '[data-action="provision-contract"]');
      const state = ctx.A.state(),
        contract = state.contracts.find((row) => row.id === 'contract-1'),
        invoices = state.invoices.filter((row) => row.contractId === contract.id);
      assert.equal(state.projects.length, before.projects.length);
      assert.equal(state.projects.find((row) => row.id === 'project-1').progress, 42);
      assert.equal(contract.paid, 980);
      assert.equal(invoices.length, 3);
      assert.equal(
        invoices.reduce((sum, row) => sum + cents(row.total), 0),
        cents(contract.total),
      );
      for (const previous of before.invoices.filter((row) => row.contractId === contract.id)) {
        const current = invoices.find((row) => row.id === previous.id);
        assert.equal(current.paid, previous.paid);
        assert.equal(current.total, previous.total);
        assert.equal(current.dueDate, previous.dueDate);
      }
      return { projectsUnchanged: true, invoices: 3, historicalPaid: 980 };
    },
  );
  await check(
    'Partial payment replay is rejected and correct paymentPlanId is credited',
    async () => {
      const ctx = await create(),
        contract = await accept(ctx);
      await sign(ctx, contract.id);
      const invoices = ctx.A.state().invoices.filter((row) => row.contractId === contract.id),
        invoice = invoices[1];
      await go(ctx, 'invoice-detail', { id: invoice.id });
      await click(ctx, '[data-action="payment-modal"]');
      fill(ctx, 'amount', 50);
      fill(ctx, 'demoPayment', true);
      const form = $(ctx, 'form[data-submit="record-payment"]'),
        requestId = $(ctx, '[name="requestId"]').value;
      await submit(ctx, 'record-payment');
      await submit(ctx, 'record-payment', form);
      const current = ctx.A.state().invoices.find((row) => row.id === invoice.id),
        agreement = ctx.A.state().contracts.find((row) => row.id === contract.id);
      assert.equal(current.paid, 50);
      assert.equal(current.payments.length, 1);
      assert.equal(current.payments[0].id, requestId);
      assert.equal(agreement.paid, 50);
      assert.equal(agreement.paymentPlan.find((row) => row.id === invoice.paymentPlanId).paid, 50);
      assert.equal(agreement.paymentPlan[0].paid, 0);
      assert.equal(current.status, 'partial');
      return { invoicePaid: 50, contractPaid: 50, ledgerEntries: 1, exactPlanCredited: true };
    },
  );
  await check(
    'Payment cancel, invalid precision and overpayment leave balances intact',
    async () => {
      const ctx = await create();
      await go(ctx, 'invoice-detail', { id: 'invoice-2' });
      await click(ctx, '[data-action="payment-modal"]');
      fill(ctx, 'amount', 20);
      fill(ctx, 'demoPayment', true);
      await click(ctx, '[data-action="close-modal"]');
      assert.equal(ctx.A.state().invoices.find((row) => row.id === 'invoice-2').paid, 0);
      await click(ctx, '[data-action="payment-modal"]');
      fill(ctx, 'demoPayment', true);
      const input = fill(ctx, 'amount', 980.01);
      input.removeAttribute('max');
      await submit(ctx, 'record-payment');
      assert.equal(ctx.A.state().invoices.find((row) => row.id === 'invoice-2').paid, 0);
      fill(ctx, 'amount', 1.001);
      input.removeAttribute('step');
      input.step = 'any';
      await submit(ctx, 'record-payment');
      assert.equal(ctx.A.state().invoices.find((row) => row.id === 'invoice-2').paid, 0);
    },
  );
  await check(
    'Approval or revision targets the reviewed version and cannot complete the project',
    async () => {
      const ctx = await create();
      await go(ctx, 'deliverable-detail', { id: 'project-1', deliverable: 'deliverable-1' });
      await click(ctx, '[data-action="approve-deliverable"]');
      newerStorage(ctx, (state) => {
        const item = state.projects.find((row) => row.id === 'project-1').deliverables[0];
        item.version = 'v3.0';
        item.content = 'محتوى جديد يحتاج أن يراه العميل قبل الاعتماد.';
      });
      await click(ctx, '[data-action="confirm-action"]');
      assert.equal(
        snapshot(ctx).projects.find((row) => row.id === 'project-1').deliverables[0].status,
        'pending',
      );
      const fresh = await create('client', snapshot(ctx));
      await go(fresh, 'deliverable-detail', { id: 'project-1', deliverable: 'deliverable-1' });
      assert.ok($(fresh, '#main-content').textContent.includes('محتوى جديد يحتاج'));
      await click(fresh, '[data-action="revise-deliverable-modal"]');
      fill(fresh, 'reason', 'أرجو تعديل هذا النص وتوضيح زر الحجز بصورة أفضل.');
      await submit(fresh, 'revise-deliverable');
      let project = fresh.A.state().projects.find((row) => row.id === 'project-1');
      assert.equal(project.deliverables[0].status, 'changes_requested');
      assert.equal(project.progress, 42);
      assert.notEqual(project.status, 'completed');
      fresh.A.update((state) => {
        const item = state.projects.find((row) => row.id === 'project-1').deliverables[0];
        item.content = 'تحديث فعلي يتضمن النص الجديد وزر حجز أوضح للمراجعة.';
        item.version = 'v4.0';
        item.status = 'pending';
        item.adminResponse = 'تم تعديل النص وزر الحجز كما طلبت.';
      });
      await click(fresh, '[data-action="approve-deliverable"]');
      await click(fresh, '[data-action="confirm-action"]');
      project = fresh.A.state().projects.find((row) => row.id === 'project-1');
      assert.equal(project.deliverables[0].status, 'approved');
      assert.notEqual(project.status, 'completed');
      assert.equal(project.progress, 42);
    },
  );
  await check(
    'New web projects show only supplied content and never inherit the cafe design proof',
    async () => {
      const ctx = await create();
      ctx.A.update((state) => {
        state.projects.push({
          id: 'project-content-test',
          clientId: 'client-1',
          title: 'موقع جديد',
          contractId: '',
          serviceId: 'svc-web',
          status: 'waiting_client',
          stage: 'design',
          progress: 20,
          milestones: [],
          deliverables: [
            {
              id: 'actual-content',
              title: 'تسليم فعلي',
              type: 'design',
              status: 'pending',
              version: 1,
              content: '<script>لا ينفذ</script> محتوى فعلي قدمه الفريق للمراجعة.',
              url: 'https://example.test/design',
            },
          ],
        });
      });
      await go(ctx, 'deliverable-detail', {
        id: 'project-content-test',
        deliverable: 'actual-content',
      });
      assert.equal(ctx.w.document.querySelectorAll('.client-cafe-proof').length, 0);
      assert.equal(ctx.w.document.querySelectorAll('#main-content script').length, 0);
      assert.ok($(ctx, '#main-content').textContent.includes('<script>لا ينفذ</script>'));
      assert.equal($(ctx, 'a[href="https://example.test/design"]').rel, 'noopener noreferrer');
    },
  );
  await check(
    'Client no-contact preference cancels scheduled contacts and follow-ups, preserving internal tasks',
    async () => {
      const ctx = await create();
      ctx.A.update((state) => {
        state.tasks.push(
          {
            id: 'follow-stop',
            clientId: 'client-1',
            repId: 'rep-1',
            title: 'متابعة للعميل',
            status: 'open',
            type: 'follow_up',
          },
          {
            id: 'internal-keep',
            clientId: 'client-1',
            repId: 'rep-1',
            title: 'تصحيح بيانات داخلية',
            status: 'open',
            type: 'data_correction',
          },
        );
      });
      await go(ctx, 'preferences');
      fill(ctx, 'doNotContact', true);
      await submit(ctx, 'save-preferences');
      const state = ctx.A.state();
      assert.ok(state.clients.find((row) => row.id === 'client-1').doNotContact);
      assert.equal(
        state.visits.filter((row) => row.clientId === 'client-1' && row.status === 'scheduled')
          .length,
        0,
      );
      assert.equal(state.tasks.find((row) => row.id === 'follow-stop').status, 'cancelled');
      assert.equal(state.tasks.find((row) => row.id === 'internal-keep').status, 'open');
      await go(ctx, 'preferences');
      fill(ctx, 'doNotContact', false);
      await submit(ctx, 'save-preferences');
      assert.equal(ctx.A.state().tasks.find((row) => row.id === 'follow-stop').status, 'cancelled');
    },
  );
  await check(
    'Client request flows through the rep quote into accepted contract, project and invoices',
    async () => {
      const client = await create();
      await go(client, 'request-service', { id: 'svc-web' });
      fill(client, 'title', 'موقع جديد من طلب العميل');
      fill(
        client,
        'brief',
        'نحتاج موقعًا جديدًا يحوي قائمة الخدمات ونموذج الحجز مع صفحات متجاوبة.',
      );
      fill(client, 'budget', 2400);
      fill(client, 'deadline', client.A.addDays(40));
      await submit(client, 'submit-service-request');
      const opportunity = client.A.state().opportunities.find(
        (row) => row.title === 'موقع جديد من طلب العميل',
      );
      assert.ok(opportunity);
      const rep = await create('rep', snapshot(client));
      await go(rep, 'opportunity-detail', { id: opportunity.id });
      await click(rep, '[data-action="quote-new"]');
      fill(rep, 'title', 'عرض تنفيذ طلب العميل');
      if (!rep.w.document.querySelector('[data-input="quote-qty"]'))
        await click(rep, '[data-action="quote-add"][data-id="svc-web"]');
      fill(
        rep,
        'terms',
        '50% عند بدء التنفيذ و50% بعد مراجعة التسليم. يشمل الموقع الصفحات المتفق عليها.',
      );
      await click(rep, '[data-action="save-send-quote"]');
      const quote = rep.A.state().quotes.find((row) => row.title === 'عرض تنفيذ طلب العميل');
      assert.ok(quote);
      assert.equal(quote.status, 'sent');
      assert.equal(quote.opportunityId, opportunity.id);
      assert.ok(quote.items[0].deliverables?.length);
      const resumed = await create('client', snapshot(rep));
      await go(resumed, 'requests');
      assert.ok(
        resumed.w.document.querySelector('[data-go="quote-detail"][data-id="' + quote.id + '"]'),
      );
      const contract = await accept(resumed, quote.id);
      await sign(resumed, contract.id);
      const state = resumed.A.state();
      assert.equal(state.opportunities.find((row) => row.id === opportunity.id).stage, 'won');
      assert.equal(state.projects.filter((row) => row.contractId === contract.id).length, 1);
      assert.equal(
        state.invoices
          .filter((row) => row.contractId === contract.id)
          .reduce((sum, row) => sum + cents(row.total), 0),
        cents(contract.total),
      );
      await go(resumed, 'requests');
      assert.ok(
        resumed.w.document.querySelector(
          '[data-go="contract-detail"][data-id="' + contract.id + '"]',
        ),
      );
      return {
        requestId: opportunity.id,
        quoteId: quote.id,
        contractId: contract.id,
        finalProjectState: 'planning',
      };
    },
  );
  await check(
    'Signing storage failure rolls back signature, project and invoices together',
    async () => {
      const ctx = await create(),
        contract = await accept(ctx);
      await go(ctx, 'contract-detail', { id: contract.id });
      await click(ctx, '[data-action="sign-contract-modal"]');
      fill(ctx, 'signer', 'أحمد المصري');
      fill(ctx, 'confirmation', 'أوافق');
      fill(ctx, 'demoConsent', true);
      const before = snapshot(ctx),
        original = ctx.w.Storage.prototype.setItem;
      ctx.w.Storage.prototype.setItem = function () {
        throw new ctx.w.DOMException('Quota exceeded', 'QuotaExceededError');
      };
      try {
        await submit(ctx, 'sign-contract');
      } finally {
        ctx.w.Storage.prototype.setItem = original;
      }
      assert.deepEqual(snapshot(ctx), before);
      assert.equal(ctx.A.state().contracts.find((row) => row.id === contract.id).status, 'pending');
      assert.equal(
        ctx.A.state().projects.filter((row) => row.contractId === contract.id).length,
        0,
      );
      assert.ok($(ctx, '#app-modal').open);
    },
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    const summary = {
      passed: checks.filter((check) => check.status === 'passed').length,
      failed: checks.filter((check) => check.status === 'failed').length,
      checks,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (summary.failed) process.exitCode = 1;
  });

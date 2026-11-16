// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/* Migrated v1.1 regression cases: sources are generated from the CURRENT modular workspaces, never the old application code. */
/* Behavioral checks of the real Elvorance client app. JSDOM is a DOM test adapter,
 * not evidence of native browser layout, legal signing or actual payment. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const jsdomRoot =
  process.env.ELVORANCE_JSDOM_PATH || path.dirname(require.resolve('jsdom/package.json'));
const { JSDOM, VirtualConsole } = require(jsdomRoot);
const FileList = require(path.join(jsdomRoot, 'lib/generated/idl/FileList.js'));
const idlUtils = require(path.join(jsdomRoot, 'lib/generated/idl/utils.js'));
const root = path.resolve(__dirname, '../../dist/test-adapters');
const storeKey = 'atlas.crm.2027.v1';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = {
  startedAt: new Date().toISOString(),
  method:
    'JSDOM DOM forms, click and submit events against actual shared icons, seed, core and client module',
  scope: 'Synthetic local state; no network, native file picker, real payment or legal signature',
  checks: [],
  errors: [],
};

async function create(saved) {
  const errors = [],
    vc = new VirtualConsole();
  vc.on('jsdomError', (error) => errors.push(String(error)));
  vc.on('error', (...args) => errors.push(args.map(String).join(' ')));
  const dom = new JSDOM(
    '<!doctype html><html dir="rtl" lang="ar"><head></head><body><div id="app"></div></body></html>',
    {
      url: 'https://elvorance-client-flow.example.test/client/',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      virtualConsole: vc,
    },
  );
  const w = dom.window;
  w.scrollTo = () => {};
  if (saved) w.localStorage.setItem(storeKey, saved);
  for (const file of [
    'src/shared/icons.js',
    'src/shared/seed.js',
    'src/shared/core.js',
    'src/apps/client.js',
  ])
    w.eval(fs.readFileSync(path.join(root, file), 'utf8') + '\n//# sourceURL=' + file);
  w.Elvorance.start('client');
  await pause(5);
  return { dom, w, A: w.Elvorance, errors };
}
const $ = (ctx, selector) => {
  const node = ctx.w.document.querySelector(selector);
  assert.ok(node, 'Missing DOM element: ' + selector);
  return node;
};
const saved = (ctx) => JSON.parse(ctx.w.localStorage.getItem(storeKey));
const stateCopy = (ctx) => JSON.parse(JSON.stringify(ctx.A.state()));
const modalOpen = (ctx) => ctx.w.document.querySelector('#app-modal').open;
async function go(ctx, route, params = {}) {
  ctx.A.go(route, params);
  await pause(12);
  assert.equal(ctx.A.route(), route);
  assert.ok(
    !$(ctx, '#main-content').textContent.includes('تعذر عرض هذه الصفحة'),
    route + ' render error',
  );
}
function field(ctx, name, value, selector = '') {
  const input = $(ctx, (selector ? selector + ' ' : '') + '[name="' + name + '"]');
  if (input.type === 'checkbox') input.checked = !!value;
  else input.value = String(value);
  input.dispatchEvent(new ctx.w.Event('input', { bubbles: true }));
  return input;
}
async function click(ctx, selector) {
  const node = $(ctx, selector);
  assert.ok(!node.disabled, 'Disabled button: ' + selector);
  node.dispatchEvent(new ctx.w.MouseEvent('click', { bubbles: true, cancelable: true }));
  await pause(12);
}
async function submit(ctx, action, node) {
  const form = node || $(ctx, 'form[data-submit="' + action + '"]');
  form.dispatchEvent(new ctx.w.Event('submit', { bubbles: true, cancelable: true }));
  await pause(35);
}
async function check(name, fn) {
  const ctx = await create();
  try {
    const evidence = await fn(ctx);
    assert.equal(ctx.errors.length, 0, ctx.errors.join('\n'));
    results.checks.push({ name, status: 'passed', ...(evidence ? { evidence } : {}) });
    console.log('PASS ' + name);
  } catch (error) {
    results.checks.push({ name, status: 'failed', message: error.message, stack: error.stack });
    console.log('FAIL ' + name + ': ' + error.message);
  } finally {
    results.errors.push(...ctx.errors);
    ctx.dom.window.close();
  }
}
async function openAccept(ctx) {
  await go(ctx, 'quote-detail', { id: 'quote-1' });
  await click(ctx, '[data-action="accept-quote-modal"]');
}
async function openPayment(ctx) {
  await go(ctx, 'invoice-detail', { id: 'invoice-2' });
  await click(ctx, '[data-action="payment-modal"]');
}
const attachmentItems = (ctx) =>
  ctx.A.state()
    .projects.find((p) => p.id === 'project-1')
    .deliverables.filter((d) => d.type === 'client_attachment');
function chooseFile(ctx, file) {
  // JSDOM has no native file chooser/DataTransfer. This creates its real FileList
  // wrapper so input.files, required validation and FormData all behave normally.
  const files = FileList.create(ctx.w);
  idlUtils.implForWrapper(files).push(idlUtils.implForWrapper(file));
  const input = $(ctx, 'input[name="attachment"]');
  input.files = files;
  input.dispatchEvent(new ctx.w.Event('change', { bubbles: true }));
}
const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1sAAAAASUVORK5CYII=',
  'base64',
);
async function attach(ctx, file) {
  await go(ctx, 'project-detail', { id: 'project-1' });
  await click(ctx, '[data-action="attach-project-modal"]');
  chooseFile(ctx, file);
  field(ctx, 'notes', 'مرجع مرفق من العميل للمراجعة.');
  await submit(ctx, 'attach-project');
}

async function main() {
  await check(
    'All 21 client routes render actual records with five bottom navigation items',
    async (ctx) => {
      const routes = [
        ['home'],
        ['services'],
        ['service-detail', { id: 'svc-web' }],
        ['request-service', { id: 'svc-store' }],
        ['requests'],
        ['quotes'],
        ['quote-detail', { id: 'quote-1' }],
        ['contracts'],
        ['contract-detail', { id: 'contract-1' }],
        ['projects'],
        ['project-detail', { id: 'project-1' }],
        ['deliverable-detail', { id: 'project-1', deliverable: 'deliverable-1' }],
        ['invoices'],
        ['invoice-detail', { id: 'invoice-2' }],
        ['support'],
        ['new-ticket'],
        ['ticket-detail', { id: 'ticket-1' }],
        ['messages'],
        ['account'],
        ['profile'],
        ['preferences'],
      ];
      for (const [route, params] of routes) {
        await go(ctx, route, params);
        assert.ok($(ctx, '#main-content').textContent.trim().length > 60);
      }
      assert.equal(ctx.w.document.querySelectorAll('.bottom-nav [data-nav]').length, 5);
      return { routeCount: routes.length, bottomNavigationItems: 5 };
    },
  );
  await check('Customer views exclude other customers and draft quotes', async (ctx) => {
    await go(ctx, 'quotes');
    assert.ok(
      !$(ctx, '#main-content').textContent.includes(
        ctx.A.state().quotes.find((q) => q.id === 'quote-2').title,
      ),
    );
    await go(ctx, 'quote-detail', { id: 'quote-2' });
    assert.equal(ctx.w.document.querySelectorAll('[data-action="accept-quote-modal"]').length, 0);
    await go(ctx, 'project-detail', { id: 'project-3' });
    assert.equal(ctx.w.document.querySelectorAll('[data-action="attach-project-modal"]').length, 0);
    ctx.A.update((s) => {
      s.quotes.find((q) => q.id === 'quote-1').status = 'draft';
    });
    await go(ctx, 'quote-detail', { id: 'quote-1' });
    assert.equal(ctx.w.document.querySelectorAll('[data-action="accept-quote-modal"]').length, 0);
    return { crossCustomerDetailsUnavailable: true, draftUnavailable: true };
  });
  await check(
    'Quote acceptance requires consent and creates exactly one pending contract and won opportunity',
    async (ctx) => {
      await openAccept(ctx);
      const before = stateCopy(ctx),
        oldForm = $(ctx, 'form[data-submit="accept-quote"]');
      await submit(ctx, 'accept-quote');
      assert.equal(ctx.A.state().quotes.find((q) => q.id === 'quote-1').status, 'sent');
      field(ctx, 'paymentWishes', 'أفضل توزيع الدفعات حسب التسليمات.');
      field(ctx, 'acceptTerms', true);
      await submit(ctx, 'accept-quote');
      const state = ctx.A.state(),
        contract = state.contracts.find((c) => c.quoteId === 'quote-1');
      assert.ok(contract);
      assert.equal(contract.status, 'pending');
      assert.equal(contract.total, 1350);
      assert.equal(contract.paid, 0);
      assert.equal(state.contracts.length, before.contracts.length + 1);
      assert.equal(state.quotes.find((q) => q.id === 'quote-1').status, 'accepted');
      assert.equal(state.opportunities.find((o) => o.id === 'opp-1').stage, 'won');
      assert.equal(state.opportunities.find((o) => o.id === 'opp-1').probability, 100);
      assert.equal(
        contract.paymentPlan.reduce((sum, p) => sum + p.amount, 0),
        contract.total,
      );
      assert.equal(ctx.A.route(), 'contract-detail');
      assert.equal(ctx.A.params().id, contract.id);
      // A customer's payment preference is a request, not an accepted contractual term.
      assert.equal(contract.paymentWishes, 'أفضل توزيع الدفعات حسب التسليمات.');
      assert.ok(!contract.terms.includes('أفضل توزيع الدفعات حسب التسليمات.'));
      assert.equal(contract.terms, state.quotes.find((q) => q.id === 'quote-1').terms);
      await submit(ctx, 'accept-quote', oldForm);
      assert.equal(ctx.A.state().contracts.filter((c) => c.quoteId === 'quote-1').length, 1);
      assert.equal(saved(ctx).contracts.find((c) => c.id === contract.id).status, 'pending');
      return {
        total: contract.total,
        paymentPlan: Array.from(contract.paymentPlan, (p) => p.amount),
        contractCountForQuote: 1,
        opportunityStage: 'won',
        destinationHasContractId: true,
      };
    },
  );
  await check(
    'Acceptance reuses an already linked contract instead of duplicating it',
    async (ctx) => {
      ctx.A.update((s) => {
        const template = s.contracts.find((c) => c.id === 'contract-2');
        s.contracts.push({ ...template, id: 'contract-existing', quoteId: 'quote-1', total: 1350 });
      });
      await openAccept(ctx);
      field(ctx, 'acceptTerms', true);
      await submit(ctx, 'accept-quote');
      assert.equal(ctx.A.state().contracts.filter((c) => c.quoteId === 'quote-1').length, 1);
      assert.equal(ctx.A.params().id, 'contract-existing');
      return { reusedContract: 'contract-existing' };
    },
  );
  await check('Expired quote remains unaccepted and cannot create a contract', async (ctx) => {
    ctx.A.update((s) => {
      s.quotes.find((q) => q.id === 'quote-1').validUntil = '2000-01-01';
    });
    await go(ctx, 'quote-detail', { id: 'quote-1' });
    const accept = ctx.w.document.querySelector('[data-action="accept-quote-modal"]');
    if (accept && !accept.disabled) {
      await click(ctx, '[data-action="accept-quote-modal"]');
      const form = ctx.w.document.querySelector('form[data-submit="accept-quote"]');
      if (form) {
        field(ctx, 'acceptTerms', true);
        await submit(ctx, 'accept-quote');
      }
    }
    assert.equal(ctx.A.state().quotes.find((q) => q.id === 'quote-1').status, 'sent');
    assert.equal(ctx.A.state().contracts.filter((c) => c.quoteId === 'quote-1').length, 0);
  });
  await check(
    'Quote revision and rejection persist distinct decisions and reasons',
    async (ctx) => {
      await go(ctx, 'quote-detail', { id: 'quote-1' });
      await click(ctx, '[data-action="revise-quote-modal"]');
      field(ctx, 'reason', 'أرجو إضافة مراجعة شهرية مفصلة إلى نطاق العمل.');
      field(ctx, 'paymentWishes', 'دفعات شهرية');
      await submit(ctx, 'revise-quote');
      assert.equal(
        ctx.A.state().quotes.find((q) => q.id === 'quote-1').status,
        'revision_requested',
      );
      assert.equal(ctx.A.state().opportunities.find((o) => o.id === 'opp-1').stage, 'negotiation');
      assert.ok(
        ctx.A.state()
          .quotes.find((q) => q.id === 'quote-1')
          .revisionRequest.includes('دفعات شهرية'),
      );
      ctx.A.update((s) => {
        s.quotes.find((q) => q.id === 'quote-1').status = 'sent';
      });
      await click(ctx, '[data-action="reject-quote-modal"]');
      field(ctx, 'reason', 'أحتاج تأجيل هذا العمل إلى الربع القادم.');
      await submit(ctx, 'reject-quote');
      const quote = ctx.A.state().quotes.find((q) => q.id === 'quote-1');
      assert.equal(quote.status, 'rejected');
      assert.ok(quote.notes.includes('الربع القادم'));
      assert.equal(ctx.A.state().contracts.filter((c) => c.quoteId === 'quote-1').length, 0);
    },
  );
  await check(
    'Demo signing validates name, exact confirmation and consent then persists signer and time',
    async (ctx) => {
      await go(ctx, 'contract-detail', { id: 'contract-2' });
      await click(ctx, '[data-action="sign-contract-modal"]');
      assert.ok($(ctx, '#app-modal').textContent.includes('ليست توقيعًا قانونيًا'));
      field(ctx, 'signer', 'أحمد المصري');
      field(ctx, 'confirmation', 'نعم');
      field(ctx, 'demoConsent', true);
      await submit(ctx, 'sign-contract');
      assert.equal(ctx.A.state().contracts.find((c) => c.id === 'contract-2').status, 'pending');
      field(ctx, 'confirmation', 'أوافق');
      field(ctx, 'demoConsent', false);
      await submit(ctx, 'sign-contract');
      assert.equal(ctx.A.state().contracts.find((c) => c.id === 'contract-2').status, 'pending');
      field(ctx, 'signer', 'أ');
      field(ctx, 'demoConsent', true);
      await submit(ctx, 'sign-contract');
      assert.equal(ctx.A.state().contracts.find((c) => c.id === 'contract-2').status, 'pending');
      field(ctx, 'signer', 'أحمد المصري');
      await submit(ctx, 'sign-contract');
      const contract = saved(ctx).contracts.find((c) => c.id === 'contract-2');
      assert.equal(contract.status, 'signed');
      assert.equal(contract.signer, 'أحمد المصري');
      assert.ok(Number.isFinite(Date.parse(contract.signedAt)));
      assert.equal(contract.paid, 0);
      return {
        invalidConfirmationBlocked: true,
        uncheckedConsentBlocked: true,
        shortNameBlocked: true,
        status: contract.status,
        noPaymentCreated: true,
      };
    },
  );
  await check(
    'Design approval has a real visual proof, requires confirmation and does not advance project stage',
    async (ctx) => {
      const original = stateCopy(ctx).projects.find((p) => p.id === 'project-1');
      await go(ctx, 'deliverable-detail', { id: 'project-1', deliverable: 'deliverable-1' });
      assert.ok($(ctx, '.client-cafe-proof').textContent.includes('مدار'));
      await click(ctx, '[data-action="approve-deliverable"]');
      assert.equal(
        ctx.A.state().projects.find((p) => p.id === 'project-1').deliverables[0].status,
        'pending',
      );
      await click(ctx, '[data-action="confirm-action"]');
      const project = ctx.A.state().projects.find((p) => p.id === 'project-1');
      assert.equal(project.deliverables[0].status, 'approved');
      assert.equal(project.status, 'active');
      assert.equal(project.stage, original.stage);
      assert.equal(project.progress, original.progress);
      assert.equal(
        ctx.w.document.querySelectorAll('[data-action="revise-deliverable-modal"]').length,
        0,
      );
      return {
        deliverable: 'approved',
        project: 'active',
        stagePreserved: project.stage,
        progressPreserved: project.progress,
      };
    },
  );
  await check(
    'Design revision requires useful feedback and keeps it on the same deliverable version',
    async (ctx) => {
      await go(ctx, 'deliverable-detail', { id: 'project-1', deliverable: 'deliverable-1' });
      await click(ctx, '[data-action="revise-deliverable-modal"]');
      field(ctx, 'reason', 'قصير');
      await submit(ctx, 'revise-deliverable');
      assert.equal(
        ctx.A.state().projects.find((p) => p.id === 'project-1').deliverables[0].status,
        'pending',
      );
      field(ctx, 'reason', 'أرجو تكبير زر حجز الطاولة مع زيادة التباين في الخلفية.');
      await submit(ctx, 'revise-deliverable');
      const item = ctx.A.state().projects.find((p) => p.id === 'project-1').deliverables[0];
      assert.equal(item.id, 'deliverable-1');
      assert.equal(item.version, 'v2.0');
      assert.equal(item.status, 'changes_requested');
      assert.ok(item.notes.includes('زر حجز الطاولة'));
      assert.ok(
        saved(ctx).messages.some((m) => m.from === 'client' && m.text.includes('زر حجز الطاولة')),
      );
      return { version: item.version, status: item.status, messageShared: true };
    },
  );
  await check(
    'Service request validates brief, budget and deadline then creates shared opportunity, needs and message',
    async (ctx) => {
      await go(ctx, 'request-service', { id: 'svc-store' });
      const before = ctx.A.state().opportunities.length;
      field(ctx, 'brief', 'قصير');
      await submit(ctx, 'submit-service-request');
      assert.equal(ctx.A.state().opportunities.length, before);
      field(
        ctx,
        'brief',
        'نحتاج متجرًا لبيع القهوة المختصة مع خيارات تغليف وشحن وعرض واضح للمنتجات.',
      );
      field(ctx, 'deadline', '2000-01-01');
      await submit(ctx, 'submit-service-request');
      assert.equal(ctx.A.state().opportunities.length, before);
      field(ctx, 'deadline', ctx.A.addDays(40));
      field(ctx, 'budget', '-1');
      await submit(ctx, 'submit-service-request');
      assert.equal(ctx.A.state().opportunities.length, before);
      field(ctx, 'title', 'متجر القهوة المختصة لمقهى مدار');
      field(ctx, 'budget', 4200);
      field(ctx, 'contact', 'email');
      field(ctx, 'bestTime', 'من العاشرة حتى الثانية');
      field(ctx, 'wishes', 'اللغتان العربية والإنجليزية');
      await submit(ctx, 'submit-service-request');
      const state = ctx.A.state(),
        request = state.opportunities.find((o) => o.title === 'متجر القهوة المختصة لمقهى مدار');
      assert.ok(request);
      assert.equal(request.clientId, 'client-1');
      assert.equal(request.repId, 'rep-1');
      assert.equal(request.stage, 'new');
      assert.equal(request.value, 4200);
      assert.ok(request.serviceIds.includes('svc-store'));
      assert.ok(request.notes.includes('اللغتان'));
      assert.ok(state.clients.find((c) => c.id === 'client-1').needs.includes('svc-store'));
      assert.ok(state.messages.some((m) => m.text.includes(request.title)));
      assert.equal(ctx.A.route(), 'requests');
      return { sharedOpportunity: request.id, value: request.value, stage: request.stage };
    },
  );
  await check(
    'Support request and replies persist; replying to a resolved request reopens it',
    async (ctx) => {
      await go(ctx, 'new-ticket', { project: 'project-1' });
      field(ctx, 'title', 'مراجعة نموذج الحجز');
      field(ctx, 'category', 'technical');
      field(ctx, 'priority', 'high');
      field(ctx, 'projectId', 'project-1');
      field(ctx, 'message', 'أحتاج مراجعة ترتيب حقول نموذج حجز الطاولة قبل إطلاق الموقع.');
      await submit(ctx, 'create-ticket');
      const ticket = ctx.A.state().tickets.find((t) => t.title === 'مراجعة نموذج الحجز');
      assert.ok(ticket);
      assert.equal(ticket.status, 'open');
      assert.equal(ticket.clientId, 'client-1');
      assert.equal(ticket.projectId, 'project-1');
      assert.equal(ctx.A.params().id, ticket.id);
      field(ctx, 'message', 'التغيير المطلوب هو وضع عدد الضيوف قبل الوقت.');
      await submit(ctx, 'reply-ticket');
      assert.equal(ctx.A.state().tickets.find((t) => t.id === ticket.id).messages.length, 2);
      ctx.A.update((s) => {
        s.tickets.find((t) => t.id === ticket.id).status = 'resolved';
      });
      field(ctx, 'message', 'أعدت التجربة وأحتاج متابعة جزئية إضافية.');
      await submit(ctx, 'reply-ticket');
      const updated = saved(ctx).tickets.find((t) => t.id === ticket.id);
      assert.equal(updated.status, 'open');
      assert.equal(updated.messages.length, 3);
      assert.equal(updated.messages[2].role, 'client');
      return { ticketId: ticket.id, replies: 2, resolvedRequestReopened: true };
    },
  );
  await check(
    'Demo payment rejects unchecked consent and overpayment; partial and final payment reconcile invoice and contract',
    async (ctx) => {
      await openPayment(ctx);
      assert.equal(ctx.w.document.querySelectorAll('input[autocomplete="cc-number"]').length, 0);
      const original = stateCopy(ctx),
        oldContract = original.contracts.find((c) => c.id === 'contract-1');
      field(ctx, 'amount', 100);
      await submit(ctx, 'record-payment');
      assert.equal(ctx.A.state().invoices.find((i) => i.id === 'invoice-2').paid, 0);
      field(ctx, 'demoPayment', true);
      field(ctx, 'amount', 981);
      await submit(ctx, 'record-payment');
      assert.equal(ctx.A.state().invoices.find((i) => i.id === 'invoice-2').paid, 0);
      // Exercise the action guard as well as the HTML max attribute.
      $(ctx, '[name="amount"]').removeAttribute('max');
      await submit(ctx, 'record-payment');
      assert.equal(ctx.A.state().invoices.find((i) => i.id === 'invoice-2').paid, 0);
      field(ctx, 'amount', 200);
      field(ctx, 'reference', 'دفعة اختبار محلي');
      await submit(ctx, 'record-payment');
      let invoice = ctx.A.state().invoices.find((i) => i.id === 'invoice-2');
      assert.equal(invoice.paid, 200);
      assert.equal(invoice.status, 'partial');
      assert.equal(
        ctx.A.state().contracts.find((c) => c.id === 'contract-1').paid,
        oldContract.paid + 200,
      );
      await click(ctx, '[data-action="payment-modal"]');
      const stale = $(ctx, 'form[data-submit="record-payment"]');
      field(ctx, 'demoPayment', true);
      field(ctx, 'amount', 780);
      await submit(ctx, 'record-payment');
      invoice = saved(ctx).invoices.find((i) => i.id === 'invoice-2');
      const contract = saved(ctx).contracts.find((c) => c.id === 'contract-1');
      assert.equal(invoice.paid, 980);
      assert.equal(invoice.status, 'paid');
      assert.equal(contract.paid, 1960);
      assert.equal(contract.paymentPlan[0].status, 'paid');
      assert.equal(contract.paymentPlan[1].status, 'paid');
      assert.equal(contract.paymentPlan[2].status, 'due');
      await submit(ctx, 'record-payment', stale);
      assert.equal(ctx.A.state().invoices.find((i) => i.id === 'invoice-2').paid, 980);
      assert.equal(ctx.A.state().contracts.find((c) => c.id === 'contract-1').paid, 1960);
      return {
        invoicePaid: invoice.paid,
        invoiceStatus: invoice.status,
        contractPaid: contract.paid,
        repeatedSubmissionRejected: true,
      };
    },
  );
  await check(
    'Attachments reject empty, unsupported and oversized files; persist three local files and enforce cap',
    async (ctx) => {
      await attach(ctx, new ctx.w.File([], 'empty.png', { type: 'image/png' }));
      assert.equal(attachmentItems(ctx).length, 0);
      await attach(ctx, new ctx.w.File(['<svg/>'], 'unsupported.svg', { type: 'image/svg+xml' }));
      assert.equal(attachmentItems(ctx).length, 0);
      await attach(
        ctx,
        new ctx.w.File([new Uint8Array(500 * 1024 + 1)], 'large.png', { type: 'image/png' }),
      );
      assert.equal(attachmentItems(ctx).length, 0);
      for (let i = 1; i <= 3; i++) {
        await attach(
          ctx,
          new ctx.w.File([pngBytes], 'reference-' + i + '.png', { type: 'image/png' }),
        );
        assert.equal(attachmentItems(ctx).length, i);
        assert.equal(modalOpen(ctx), false);
      }
      const items = attachmentItems(ctx);
      assert.ok(
        items.every(
          (d) => d.fileData.startsWith('data:image/png;base64,') && d.uploadedBy === 'client-1',
        ),
      );
      assert.equal(
        saved(ctx)
          .projects.find((p) => p.id === 'project-1')
          .deliverables.filter((d) => d.type === 'client_attachment').length,
        3,
      );
      await click(ctx, '[data-action="attach-project-modal"]');
      assert.equal(modalOpen(ctx), false);
      assert.equal(attachmentItems(ctx).length, 3);
      return {
        acceptedFiles: 3,
        emptyBlocked: true,
        svgBlocked: true,
        above500KBBlocked: true,
        fourthBlocked: true,
      };
    },
  );
  await check(
    'Storage quota failure preserves quote state and review modal without false success',
    async (ctx) => {
      await openAccept(ctx);
      field(ctx, 'acceptTerms', true);
      const before = stateCopy(ctx),
        originalSet = ctx.w.Storage.prototype.setItem;
      ctx.w.Storage.prototype.setItem = function () {
        throw new ctx.w.DOMException('Quota exceeded', 'QuotaExceededError');
      };
      try {
        await submit(ctx, 'accept-quote');
      } finally {
        ctx.w.Storage.prototype.setItem = originalSet;
      }
      assert.deepEqual(stateCopy(ctx), before);
      assert.equal(modalOpen(ctx), true);
      assert.equal(ctx.A.route(), 'quote-detail');
      assert.equal(ctx.w.document.querySelectorAll('.toast-success').length, 0);
      return { stateRolledBack: true, modalPreserved: true, successToastCount: 0 };
    },
  );
  await check(
    'Attachment quota failure rolls back attachment and retains the populated form',
    async (ctx) => {
      await go(ctx, 'project-detail', { id: 'project-1' });
      await click(ctx, '[data-action="attach-project-modal"]');
      chooseFile(ctx, new ctx.w.File([pngBytes], 'quota.png', { type: 'image/png' }));
      const originalSet = ctx.w.Storage.prototype.setItem;
      ctx.w.Storage.prototype.setItem = function () {
        throw new ctx.w.DOMException('Quota exceeded', 'QuotaExceededError');
      };
      try {
        await submit(ctx, 'attach-project');
      } finally {
        ctx.w.Storage.prototype.setItem = originalSet;
      }
      assert.equal(attachmentItems(ctx).length, 0);
      assert.equal(modalOpen(ctx), true);
      assert.equal($(ctx, 'input[name="attachment"]').files.length, 1);
      assert.equal(
        $(ctx, 'form[data-submit="attach-project"] button[type="submit"]').disabled,
        false,
      );
      assert.equal(ctx.w.document.querySelectorAll('.toast-success').length, 0);
      return { noAttachmentPersisted: true, selectedFileRetained: true, retryAvailable: true };
    },
  );
  await check(
    'Profile preferences and messages survive reload in shared client state',
    async (ctx) => {
      await go(ctx, 'preferences');
      field(ctx, 'preferredContact', 'email');
      field(ctx, 'budget', 5800);
      field(ctx, 'bestTime', 'صباح الثلاثاء');
      field(ctx, 'wishes', 'تحديث أسبوعي مختصر');
      field(ctx, 'need_svc-store', true);
      field(ctx, 'doNotContact', true);
      await submit(ctx, 'save-preferences');
      const client = ctx.A.state().clients.find((c) => c.id === 'client-1');
      assert.equal(client.preferredContact, 'البريد الإلكتروني');
      assert.equal(client.budget, 5800);
      assert.equal(client.doNotContact, true);
      assert.ok(client.needs.includes('svc-store'));
      await go(ctx, 'messages');
      field(ctx, 'message', 'هذه رسالة تجريبية لمراجعة خطة المشروع.');
      await submit(ctx, 'send-message');
      const restored = await create(ctx.w.localStorage.getItem(storeKey));
      try {
        assert.equal(restored.A.state().clients.find((c) => c.id === 'client-1').budget, 5800);
        assert.ok(
          restored.A.state().messages.some(
            (m) => m.from === 'client' && m.text.includes('لمراجعة خطة المشروع'),
          ),
        );
        assert.equal(restored.errors.length, 0);
      } finally {
        restored.dom.window.close();
      }
      return { preferencesShared: true, messagePersisted: true, reloadRestored: true };
    },
  );
}

main()
  .catch((error) => {
    results.fatalError = String(error.stack || error);
    process.exitCode = 1;
  })
  .finally(() => {
    results.finishedAt = new Date().toISOString();
    results.summary = {
      passed: results.checks.filter((c) => c.status === 'passed').length,
      failed: results.checks.filter((c) => c.status === 'failed').length,
      runtimeErrors: results.errors.length,
    };
    if (results.summary.failed || results.summary.runtimeErrors) process.exitCode = 1;
    fs.writeFileSync(
      path.join(__dirname, 'client-flows-results.json'),
      JSON.stringify(results, null, 2),
    );
    console.log(JSON.stringify(results.summary));
  });

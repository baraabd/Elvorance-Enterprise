// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/* Migrated v1.1 regression cases: sources are generated from the CURRENT modular workspaces, never the old application code. */
/* Meaningful journeys through the real DOM/runtime. Synthetic storage; no browser/network. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '../../dist/test-adapters'),
  STORE = 'atlas.crm.2027.v1',
  DRAFT = 'atlas.crm.2027.rep-drafts.v2';
const pause = (ms = 15) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [],
  contexts = [],
  errors = [];
async function create(saved = {}, app = 'rep', hash = '') {
  const vc = new VirtualConsole(),
    runtime = [];
  vc.on('jsdomError', (err) => runtime.push(String(err)));
  vc.on('error', (...args) => runtime.push(args.map(String).join(' ')));
  vc.on('warn', (...args) => {
    if (args.join(' ').includes('Unknown Elvorance')) runtime.push(args.join(' '));
  });
  const dom = new JSDOM(
    '<!doctype html><html lang="ar" dir="rtl"><body><div id="app"></div></body></html>',
    {
      url: 'https://elvorance-journey.test/' + app + '/' + hash,
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      virtualConsole: vc,
    },
  );
  const w = dom.window;
  w.scrollTo = () => {};
  Object.entries(saved).forEach(([key, value]) => w.localStorage.setItem(key, value));
  ['icons', 'seed', 'core'].forEach((name) =>
    w.eval(fs.readFileSync(path.join(root, 'src/shared/' + name + '.js'), 'utf8')),
  );
  w.eval(fs.readFileSync(path.join(root, 'src/apps/' + app + '.js'), 'utf8'));
  w.Elvorance.start(app);
  await pause();
  const ctx = { dom, w, A: w.Elvorance, runtime };
  contexts.push(ctx);
  return ctx;
}
const allStorage = (ctx) =>
  Object.fromEntries(
    Array.from({ length: ctx.w.localStorage.length }, (_, i) => {
      const key = ctx.w.localStorage.key(i);
      return [key, ctx.w.localStorage.getItem(key)];
    }),
  );
const state = (ctx) => JSON.parse(ctx.w.localStorage.getItem(STORE));
const text = (ctx) => ctx.w.document.querySelector('#main-content').textContent;
function el(ctx, selector) {
  const item = ctx.w.document.querySelector(selector);
  assert.ok(item, 'Missing control: ' + selector);
  return item;
}
async function go(ctx, route, params = {}) {
  ctx.A.go(route, params);
  await pause();
  assert.ok(!text(ctx).includes('تعذر عرض هذه الصفحة'), route + ' render failed');
}
function fill(ctx, selector, value, event = 'input') {
  const input = el(ctx, selector);
  input.value = value;
  input.dispatchEvent(new ctx.w.Event(event, { bubbles: true }));
  return input;
}
function tick(ctx, selector, checked = true) {
  const input = el(ctx, selector);
  input.checked = checked;
  input.dispatchEvent(new ctx.w.Event('change', { bubbles: true }));
  return input;
}
function fire(ctx, node, kind) {
  node.dispatchEvent(new ctx.w.Event(kind, { bubbles: true, cancelable: true }));
}
async function click(ctx, selector) {
  const node = el(ctx, selector);
  assert.ok(!node.disabled, 'Control disabled: ' + selector);
  node.dispatchEvent(new ctx.w.MouseEvent('click', { bubbles: true, cancelable: true }));
  await pause();
}
async function submit(ctx, selector) {
  fire(ctx, el(ctx, selector), 'submit');
  await pause(30);
}
function latest(ctx, mutate) {
  const s = state(ctx);
  mutate(s);
  s._revision += 1;
  ctx.w.localStorage.setItem(STORE, JSON.stringify(s));
  return s;
}
function deliver(ctx, stored) {
  const before = ctx.w.localStorage.getItem(STORE);
  ctx.w.localStorage.setItem(STORE, stored);
  ctx.w.dispatchEvent(
    new ctx.w.StorageEvent('storage', { key: STORE, oldValue: before, newValue: stored }),
  );
}
async function check(name, work) {
  const start = Date.now();
  try {
    const evidence = await work();
    results.push({ name, status: 'passed', ms: Date.now() - start, evidence });
    console.log('PASS ' + name);
  } catch (error) {
    results.push({ name, status: 'failed', error: error.stack });
    console.log('FAIL ' + name + ': ' + error.message);
    throw error;
  }
}
async function startVisit(ctx, clientId = 'client-1', visitId = 'visit-1') {
  await go(ctx, 'visit-checkin', { id: clientId, visit: visitId });
  fill(
    ctx,
    '[name="manualReason"]',
    'تعذر الحصول على موقع دقيق داخل المبنى، وتم تأكيد الوصول يدويًا.',
  );
  fill(ctx, '[name="notes"]', 'جلسة لفهم الاحتياج ومراجعة الخدمات وشروط التنفيذ.');
  await submit(ctx, '[data-submit="start-visit"]');
  return ctx.A.state().visits.find((v) => v.repId === 'rep-1' && v.status === 'active');
}
async function newQuote(
  ctx,
  title,
  { client = 'client-1', visit = '', discount = 0, send = false } = {},
) {
  if (visit) await go(ctx, 'visit-active', { id: visit });
  else await go(ctx, 'client-detail', { id: client });
  await click(ctx, '[data-action="quote-new"][data-id="' + client + '"]');
  fill(ctx, '[name="title"]', title);
  await click(ctx, '[data-action="quote-add"][data-id="svc-security"]');
  await click(ctx, '[data-action="quote-add"][data-id="svc-social"]');
  fill(ctx, '[name="discount"]', String(discount));
  if (send) await click(ctx, '[data-action="save-send-quote"]');
  else await submit(ctx, '#rep-quote-form');
  return ctx.A.state().quotes.find((q) => q.title === title);
}
async function main() {
  let ctx = await create(),
    visitId,
    quoteId,
    frozen;
  await check(
    'Manual check-in is explicit, requires a reason, and double submission starts only one visit',
    async () => {
      await go(ctx, 'visit-checkin', { id: 'client-1', visit: 'visit-1' });
      await submit(ctx, '[data-submit="start-visit"]');
      assert.equal(ctx.A.state().visits.filter((v) => v.status === 'active').length, 0);
      fill(ctx, '[name="manualReason"]', 'الزيارة داخل المبنى مع تعذر الحصول على موقع دقيق.');
      const form = el(ctx, '[data-submit="start-visit"]');
      fire(ctx, form, 'submit');
      fire(ctx, form, 'submit');
      await pause(35);
      const active = ctx.A.state().visits.filter(
        (v) => v.repId === 'rep-1' && v.status === 'active',
      );
      assert.equal(active.length, 1);
      visitId = active[0].id;
      assert.equal(active[0].locationProof.method, 'manual');
      assert.equal(active[0].locationProof.lat, undefined);
      assert.equal(visitId, 'visit-1');
      return { visitId, method: active[0].locationProof.method, activeVisits: active.length };
    },
  );
  await check(
    'Needs, duration, payment wishes and notes survive navigation and a full runtime reload',
    async () => {
      tick(ctx, '[name="needs"][value="svc-security"]');
      fill(ctx, '[name="painPoints"]', 'تواجه المنشأة صعوبة في حماية بيانات العملاء.');
      fill(ctx, '[name="wishes"]', 'الحماية مع خطة تواصل رقمية واضحة.');
      fill(ctx, '[name="proposedDuration"]', '4 أسابيع بعد استلام بيانات الدخول');
      fill(ctx, '[name="paymentWishes"]', '50% عند البدء و50% عند التسليم');
      fill(ctx, '[name="notes"]', 'تمت مناقشة النطاق مع المدير؛ لا قبول نهائي بعد.');
      await click(ctx, '[data-go="catalog"]');
      assert.ok(ctx.w.localStorage.getItem(DRAFT));
      const saved = allStorage(ctx);
      ctx.dom.window.close();
      ctx = await create(saved);
      await go(ctx, 'visit-active', { id: visitId });
      assert.equal(el(ctx, '[name="proposedDuration"]').value, '4 أسابيع بعد استلام بيانات الدخول');
      assert.ok(el(ctx, '[name="needs"][value="svc-security"]').checked);
      assert.equal(el(ctx, '[name="paymentWishes"]').value, '50% عند البدء و50% عند التسليم');
      await submit(ctx, '[data-submit="save-visit-draft"]');
      assert.equal(
        state(ctx).visits.find((v) => v.id === visitId).workingDraft.wishes,
        'الحماية مع خطة تواصل رقمية واضحة.',
      );
    },
  );
  await check(
    'Quote selection and arithmetic survive leaving the builder and reloading, with a return-to-visit link',
    async () => {
      await click(ctx, '[data-action="quote-new"]');
      fill(ctx, '[name="title"]', 'اتفاق الأمن والتواصل خلال الزيارة');
      await click(ctx, '[data-action="quote-add"][data-id="svc-security"]');
      await click(ctx, '[data-action="quote-add"][data-id="svc-social"]');
      fill(ctx, '[data-input="quote-qty"][data-index="0"]', '2');
      fill(ctx, '[name="discount"]', '150');
      assert.equal(el(ctx, '[name="proposedDuration"]').value, '4 أسابيع بعد استلام بيانات الدخول');
      await click(ctx, '[data-go="visit-active"]');
      assert.ok(text(ctx).includes('مسودة عرض غير مكتملة'));
      const saved = allStorage(ctx);
      ctx.dom.window.close();
      ctx = await create(saved);
      await go(ctx, 'visit-active', { id: visitId });
      await click(ctx, '[data-action="quote-new"]');
      assert.equal(el(ctx, '[name="title"]').value, 'اتفاق الأمن والتواصل خلال الزيارة');
      assert.equal(el(ctx, '[data-input="quote-qty"][data-index="0"]').value, '2');
      assert.equal(el(ctx, '[name="discount"]').value, '150');
      assert.equal(el(ctx, '[name="clientId"]').disabled, true);
      return {
        servicePrices: [900, 350],
        quantities: [2, 1],
        subtotal: 2150,
        discount: 150,
        total: 2000,
      };
    },
  );
  await check(
    'Sending saves exact scope, visit and opportunity links and targeted client visibility',
    async () => {
      const before = ctx.A.state().opportunities.length;
      await click(ctx, '[data-action="save-send-quote"]');
      const q = ctx.A.state().quotes.find((q) => q.title === 'اتفاق الأمن والتواصل خلال الزيارة');
      assert.ok(q);
      quoteId = q.id;
      assert.equal(q.status, 'sent');
      assert.equal(q.total, 2000);
      assert.equal(q.visitId, visitId);
      assert.equal(q.items[0].qty, 2);
      assert.ok(q.items[0].deliverables.length);
      assert.ok(q.scopeSnapshot.items[0].deliverables.length);
      assert.ok(q.terms.includes('4 أسابيع'));
      assert.ok(q.terms.includes('50%'));
      assert.ok(
        ctx.A.state()
          .visits.find((v) => v.id === visitId)
          .quoteIds.includes(q.id),
      );
      assert.equal(
        ctx.A.state().opportunities.find((o) => o.id === q.opportunityId).visitId,
        visitId,
      );
      assert.equal(ctx.A.state().opportunities.length, before + 1);
      const portal = await create(allStorage(ctx), 'client');
      await go(portal, 'quote-detail', { id: quoteId });
      assert.ok(el(portal, '[data-action="accept-quote-modal"]'));
      return { quoteId, visitId, opportunityId: q.opportunityId, status: q.status };
    },
  );
  await check(
    'Ending a sent quote visit shows a comprehensive inferred review without selecting interest or services again',
    async () => {
      await click(ctx, '[data-go="visit-active"]');
      await click(ctx, '[data-go="visit-outcome"]');
      assert.equal(ctx.w.document.querySelector('[data-action="choose-outcome"]'), null);
      assert.ok(el(ctx, '[data-submit="finish-review"]'));
      assert.ok(text(ctx).includes('لم يسجّل العميل قبوله'));
      assert.ok(text(ctx).includes('4 أسابيع'));
      assert.ok(text(ctx).includes('50%'));
      assert.ok(text(ctx).includes('الحماية مع خطة تواصل'));
      const before = { opp: ctx.A.state().opportunities.length, tasks: ctx.A.state().tasks.length };
      tick(ctx, '[name="reviewed"]');
      await submit(ctx, '[data-submit="finish-review"]');
      const v = ctx.A.state().visits.find((v) => v.id === visitId);
      assert.equal(v.status, 'completed');
      assert.equal(v.agreementSnapshot.reviewResult, 'sent');
      assert.equal(v.agreementSnapshot.clientAcceptance.status, 'not_accepted');
      assert.equal(v.agreementSnapshot.primaryQuoteId, quoteId);
      assert.equal(v.agreementSnapshot.quotes[0].total, 2000);
      assert.equal(ctx.A.state().opportunities.length, before.opp);
      assert.equal(ctx.A.state().tasks.length, before.tasks);
      assert.equal(ctx.A.route(), 'visit-detail');
      frozen = JSON.stringify(v.agreementSnapshot);
    },
  );
  await check(
    'Completed agreement is immutable when catalog, quote content or later client acceptance changes',
    async () => {
      ctx.A.update((s) => {
        s.catalog.find((x) => x.id === 'svc-security').title = 'كتالوج لاحق';
        const q = s.quotes.find((x) => x.id === quoteId);
        q.title = 'عنوان لاحق';
        q.items[0].price = 9999;
        q.status = 'accepted';
      });
      assert.equal(
        JSON.stringify(ctx.A.state().visits.find((v) => v.id === visitId).agreementSnapshot),
        frozen,
      );
      await go(ctx, 'visit-outcome', { id: visitId });
      assert.ok(text(ctx).includes('ملخص محفوظ وقت إنهاء الزيارة'));
      assert.ok(!text(ctx).includes('عنوان لاحق'));
      const before = ctx.A.state().tasks.length;
      await go(ctx, 'visit-outcome', { id: visitId });
      assert.equal(ctx.w.document.querySelector('[data-submit="finish-review"]'), null);
      assert.equal(ctx.A.state().tasks.length, before);
    },
  );
  await check(
    'A real client acceptance returns to an accepted review and links the contract without manufacturing a signature',
    async () => {
      const c = await create();
      const v = await startVisit(c);
      const q = await newQuote(c, 'عرض يراجعه العميل بنفسه', { visit: v.id, send: true });
      const portal = await create(allStorage(c), 'client');
      await go(portal, 'quote-detail', { id: q.id });
      await click(portal, '[data-action="accept-quote-modal"]');
      tick(portal, '[name="acceptTerms"]');
      await submit(portal, '[data-submit="accept-quote"]');
      assert.equal(portal.A.state().quotes.find((x) => x.id === q.id).status, 'accepted');
      deliver(c, portal.w.localStorage.getItem(STORE));
      await go(c, 'visit-outcome', { id: v.id });
      assert.ok(text(c).includes('عرض قبله العميل'));
      tick(c, '[name="reviewed"]');
      await submit(c, '[data-submit="finish-review"]');
      const snapshot = c.A.state().visits.find((x) => x.id === v.id).agreementSnapshot;
      assert.equal(snapshot.clientAcceptance.status, 'accepted');
      assert.ok(snapshot.clientAcceptance.recordedAt);
      assert.equal(snapshot.clientAcceptance.contractSigned, null);
      assert.equal(c.A.state().contracts.find((x) => x.quoteId === q.id).status, 'pending');
    },
  );
  await check(
    'Uncommitted quote draft can be saved directly from end-of-visit review without losing service selection',
    async () => {
      const c = await create();
      const v = await startVisit(c);
      await click(c, '[data-action="quote-new"]');
      fill(c, '[name="title"]', 'مسودة اختيارات الزيارة');
      await click(c, '[data-action="quote-add"][data-id="svc-security"]');
      await click(c, '[data-go="visit-active"]');
      await click(c, '[data-go="visit-outcome"]');
      assert.ok(text(c).includes('مسودة العرض جزء'));
      await click(c, '[data-action="commit-visit-quote"]');
      assert.ok(el(c, '[data-submit="finish-review"]'));
      assert.equal(
        c.A.state().quotes.find((q) => q.title === 'مسودة اختيارات الزيارة').status,
        'draft',
      );
      assert.ok(text(c).includes('مقترح محفوظ لم يُرسل بعد'));
    },
  );
  await check(
    'Exception reschedule persists review through reload and creates one linked task and next visit',
    async () => {
      let c = await create();
      const v = await startVisit(c);
      await go(c, 'visit-outcome', { id: v.id });
      await click(c, '[data-action="choose-outcome"][data-value="reschedule"]');
      fill(c, '[name="notes"]', 'طلب المدير تأجيل المراجعة إلى حضور الشريك وصاحب القرار.');
      fill(c, '[name="nextAction"]', 'مراجعة الاتفاق مع الشريك وصاحب القرار');
      fill(c, '[name="followUpAt"]', c.A.addDays(2) + 'T12:30');
      await submit(c, '[data-submit="prepare-outcome"]');
      const saved = allStorage(c);
      c.dom.window.close();
      c = await create(saved);
      await go(c, 'visit-outcome', { id: v.id });
      const beforeTasks = c.A.state().tasks.length,
        beforeVisits = c.A.state().visits.length;
      const button = el(c, '[data-action="complete-visit"]');
      button.click();
      button.click();
      await pause(30);
      const done = c.A.state().visits.find((x) => x.id === v.id);
      assert.equal(done.status, 'completed');
      assert.equal(done.outcome, 'reschedule');
      assert.equal(c.A.state().tasks.length, beforeTasks + 1);
      assert.equal(c.A.state().visits.length, beforeVisits + 1);
      assert.ok(c.A.state().tasks.find((t) => t.visitId === v.id));
      assert.ok(c.A.state().visits.find((t) => t.sourceVisitId === v.id));
    },
  );
  await check(
    'Latest changed client decision blocks closure of a stale summary and requires review again',
    async () => {
      const c = await create();
      const v = await startVisit(c);
      const q = await newQuote(c, 'عرض يتغير أثناء المراجعة', { visit: v.id, send: true });
      await go(c, 'visit-outcome', { id: v.id });
      tick(c, '[name="reviewed"]');
      latest(c, (s) => {
        const row = s.quotes.find((x) => x.id === q.id);
        row.status = 'revision_requested';
        row.revisionRequest = 'تغيير نطاق العمل قبل القبول';
      });
      await submit(c, '[data-submit="finish-review"]');
      assert.equal(state(c).visits.find((x) => x.id === v.id).status, 'active');
      assert.equal(state(c).visits.find((x) => x.id === v.id).agreementSnapshot, undefined);
      assert.ok(text(c).includes('تغيير نطاق العمل قبل القبول'));
      tick(c, '[name="reviewed"]');
      await submit(c, '[data-submit="finish-review"]');
      assert.equal(
        state(c).visits.find((x) => x.id === v.id).agreementSnapshot.reviewResult,
        'revision_requested',
      );
    },
  );
  await check(
    'Discount approval binds exact scope and customer, can be requested after rejection, and is rechecked inside the commit',
    async () => {
      const c = await create();
      const q = await newQuote(c, 'خصم مضبوط على نسخة العرض', { discount: 250, send: true });
      assert.equal(q.status, 'draft');
      let approval = c.A.state().approvals.find(
        (a) => a.quoteId === q.id && a.status === 'pending',
      );
      assert.equal(approval.quoteFingerprint, c.A.quoteFingerprint(q));
      c.A.update((s) => {
        s.approvals.find((a) => a.id === approval.id).status = 'rejected';
      });
      await click(c, '[data-action="send-quote"]');
      approval = c.A.state().approvals.find((a) => a.quoteId === q.id && a.status === 'pending');
      assert.ok(approval);
      c.A.update((s) => {
        s.approvals.find((a) => a.id === approval.id).status = 'approved';
      });
      await go(c, 'quote-builder', { id: q.id });
      fill(c, '[name="terms"]', 'شروط مختلفة للعرض مع نفس الخدمات والخصم والإجمالي.');
      await click(c, '[data-action="save-send-quote"]');
      assert.equal(c.A.state().quotes.find((x) => x.id === q.id).status, 'draft');
      const newer = c.A.state().approvals.find((a) => a.quoteId === q.id && a.status === 'pending');
      assert.ok(newer);
      assert.notEqual(newer.quoteFingerprint, approval.quoteFingerprint);
      c.A.update((s) => {
        s.approvals.find((a) => a.id === newer.id).status = 'approved';
      });
      await go(c, 'quote-builder', { id: q.id });
      latest(c, (s) => {
        s.approvals.find((a) => a.id === newer.id).status = 'rejected';
      });
      await click(c, '[data-action="save-send-quote"]');
      assert.equal(state(c).quotes.find((x) => x.id === q.id).status, 'draft');
      const finalApproval = c.A.state().approvals.find(
        (a) => a.quoteId === q.id && a.status === 'pending',
      );
      assert.ok(finalApproval);
      c.A.update((s) => {
        s.approvals.find((a) => a.id === finalApproval.id).status = 'approved';
      });
      await click(c, '[data-action="send-quote"]');
      assert.equal(c.A.state().quotes.find((x) => x.id === q.id).status, 'sent');
    },
  );
  await check('Draft quote forms cannot overwrite a quote accepted in newer storage', async () => {
    const c = await create();
    const q = await newQuote(c, 'عرض تزامن الحالة');
    await go(c, 'quote-builder', { id: q.id });
    fill(c, '[name="title"]', 'عنوان مسودة قديم');
    latest(c, (s) => {
      s.quotes.find((x) => x.id === q.id).status = 'accepted';
    });
    await submit(c, '#rep-quote-form');
    assert.equal(state(c).quotes.find((x) => x.id === q.id).title, 'عرض تزامن الحالة');
    assert.equal(state(c).quotes.find((x) => x.id === q.id).status, 'accepted');
    assert.equal(el(c, '[name="title"]').value, 'عنوان مسودة قديم');
  });
  await check(
    'A quote draft conflict preserves typed scope after reload and requires an explicit reviewed rebase',
    async () => {
      let c = await create();
      const q = await newQuote(c, 'مسودة مع تعارض قابل للمراجعة');
      await go(c, 'quote-builder', { id: q.id });
      fill(c, '[name="notes"]', 'تفاصيل محلية يجب الحفاظ عليها عند تعارض النسخ');
      latest(c, (s) => {
        const row = s.quotes.find((x) => x.id === q.id);
        row.notes = 'تحديث من نافذة أخرى';
        row.version = (row.version || 1) + 1;
      });
      const saved = allStorage(c);
      c.dom.window.close();
      c = await create(saved);
      await go(c, 'quote-builder', { id: q.id });
      assert.ok(text(c).includes('تغيّرت النسخة المحفوظة'));
      assert.equal(el(c, '[name="notes"]').value, 'تفاصيل محلية يجب الحفاظ عليها عند تعارض النسخ');
      await submit(c, '#rep-quote-form');
      assert.equal(state(c).quotes.find((x) => x.id === q.id).notes, 'تحديث من نافذة أخرى');
      await click(c, '[data-action="quote-rebase"]');
      await submit(c, '#rep-quote-form');
      assert.equal(
        state(c).quotes.find((x) => x.id === q.id).notes,
        'تفاصيل محلية يجب الحفاظ عليها عند تعارض النسخ',
      );
    },
  );
  await check(
    'Client revision creates a private draft pending a fresh discount approval before resend',
    async () => {
      const c = await create();
      const q = await newQuote(c, 'دورة تعديل وخصم وإعادة إرسال', { discount: 250, send: true });
      c.A.update((s) => {
        s.approvals.find((a) => a.quoteId === q.id && a.status === 'pending').status = 'approved';
      });
      await click(c, '[data-action="send-quote"]');
      const portal = await create(allStorage(c), 'client');
      await go(portal, 'quote-detail', { id: q.id });
      await click(portal, '[data-action="revise-quote-modal"]');
      const form = el(portal, '#app-modal form');
      const textarea = form.querySelector('textarea');
      assert.ok(textarea);
      fill(
        portal,
        '#app-modal textarea',
        'نرجو تغيير عدد الوحدات ومراجعة نطاق الحماية قبل الموافقة.',
      );
      await submit(portal, '#app-modal form');
      assert.equal(
        portal.A.state().quotes.find((row) => row.id === q.id).status,
        'revision_requested',
      );
      deliver(c, portal.w.localStorage.getItem(STORE));
      await go(c, 'quote-builder', { id: q.id });
      fill(c, '[data-input="quote-qty"][data-index="0"]', '2');
      fill(c, '[name="discount"]', '500');
      await click(c, '[data-action="save-send-quote"]');
      const revised = c.A.state().quotes.find((row) => row.id === q.id);
      assert.equal(revised.status, 'draft');
      assert.ok(revised.revisionRequest);
      const approval = c.A.state().approvals.find(
        (a) => a.quoteId === q.id && a.status === 'pending',
      );
      assert.equal(approval.quoteFingerprint, c.A.quoteFingerprint(revised));
      const hidden = await create(allStorage(c), 'client');
      await go(hidden, 'quote-detail', { id: q.id });
      assert.equal(hidden.w.document.querySelector('[data-action="accept-quote-modal"]'), null);
      c.A.update((s) => {
        s.approvals.find((a) => a.id === approval.id).status = 'approved';
      });
      await click(c, '[data-action="send-quote"]');
      assert.equal(c.A.state().quotes.find((row) => row.id === q.id).status, 'sent');
    },
  );
  await check(
    'Save failure retains visit review and quote input without a false completion or duplicate retry',
    async () => {
      const c = await create();
      const v = await startVisit(c);
      const q = await newQuote(c, 'حفظ يتعذر مرة واحدة', { visit: v.id, send: true });
      await go(c, 'visit-outcome', { id: v.id });
      fill(c, '[name="notes"]', 'ملاحظات ختام لا يجوز فقدانها عند امتلاء التخزين.');
      tick(c, '[name="reviewed"]');
      const original = c.w.Storage.prototype.setItem;
      c.w.Storage.prototype.setItem = function (key, value) {
        if (key === STORE) throw new c.w.DOMException('Quota exceeded', 'QuotaExceededError');
        return original.call(this, key, value);
      };
      await submit(c, '[data-submit="finish-review"]');
      assert.equal(c.A.state().visits.find((x) => x.id === v.id).status, 'active');
      assert.equal(
        el(c, '[name="notes"]').value,
        'ملاحظات ختام لا يجوز فقدانها عند امتلاء التخزين.',
      );
      c.w.Storage.prototype.setItem = original;
      await submit(c, '[data-submit="finish-review"]');
      assert.equal(c.A.state().visits.find((x) => x.id === v.id).status, 'completed');
      assert.equal(
        c.A.state().visits.find((x) => x.id === v.id).agreementSnapshot.quotes[0].id,
        q.id,
      );
    },
  );
  await check(
    'No-contact cancels follow-ups, prevents new quotes/tasks/messages in latest state, and allows internal correction',
    async () => {
      const c = await create();
      await go(c, 'client-detail', { id: 'client-1' });
      await click(c, '[data-action="contact-preference"]');
      fill(
        c,
        '#app-modal [name="reason"]',
        'طلب العميل صراحة عدم الزيارات والرسائل حتى يراجعنا من تلقاء نفسه.',
      );
      await submit(c, '#app-modal form');
      const blocked = c.A.state();
      assert.equal(blocked.clients.find((x) => x.id === 'client-1').doNotContact, true);
      assert.ok(!blocked.visits.some((v) => v.clientId === 'client-1' && v.status === 'scheduled'));
      assert.ok(
        !blocked.tasks.some(
          (t) => t.clientId === 'client-1' && t.type === 'follow_up' && t.status === 'open',
        ),
      );
      await click(c, '[data-action="quote-new"]');
      assert.equal(c.A.route(), 'client-detail');
      await go(c, 'tasks');
      await click(c, '[data-action="task-new"]');
      fill(c, '#app-modal [name="title"]', 'متابعة ممنوعة بطلب العميل');
      fill(c, '#app-modal [name="clientId"]', 'client-1', 'change');
      const before = c.A.state().tasks.length;
      await submit(c, '#app-modal form');
      assert.equal(c.A.state().tasks.length, before);
      fill(c, '#app-modal [name="type"]', 'data_correction', 'change');
      await submit(c, '#app-modal form');
      assert.equal(c.A.state().tasks.length, before + 1);
      assert.equal(c.A.state().tasks[0].type, 'data_correction');
      const stale = await create();
      await go(stale, 'messages', { id: 'client-1' });
      fill(stale, '[name="text"]', 'رسالة يجب منعها إذا تغيّر إذن العميل');
      const count = stale.A.state().messages.length;
      latest(stale, (s) => {
        s.clients.find((x) => x.id === 'client-1').doNotContact = true;
      });
      await submit(stale, '[data-submit="send-message"]');
      assert.equal(state(stale).messages.length, count);
    },
  );
  await check(
    'A task reassigned in newer storage cannot be completed from the old representative view',
    async () => {
      const c = await create();
      await go(c, 'tasks');
      const button = el(c, '[data-action="task-toggle"]'),
        id = button.dataset.id;
      const previous = c.A.state().tasks.find((t) => t.id === id).status;
      latest(c, (s) => {
        s.tasks.find((t) => t.id === id).repId = 'rep-2';
      });
      await click(c, '[data-action="task-toggle"][data-id="' + id + '"]');
      assert.equal(state(c).tasks.find((t) => t.id === id).status, previous);
      assert.equal(state(c).tasks.find((t) => t.id === id).repId, 'rep-2');
    },
  );
}
main()
  .catch((error) => {
    console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(() => {
    contexts.forEach((ctx) => {
      errors.push(...ctx.runtime);
      ctx.dom.window.close();
    });
    if (errors.length) process.exitCode = 1;
    console.log(
      JSON.stringify(
        {
          method: 'JSDOM real DOM forms/events plus shared core latest-state commits',
          passed: results.filter((r) => r.status === 'passed').length,
          failed: results.filter((r) => r.status === 'failed').length,
          runtimeErrors: errors,
          results,
        },
        null,
        2,
      ),
    );
  });

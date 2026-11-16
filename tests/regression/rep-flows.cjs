/* Migrated v1.1 regression cases: sources are generated from the CURRENT modular workspaces, never the old application code. */
/* Behavioral checks of the real Atlas rep app in JSDOM. No browser/network. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '../../dist/test-adapters');
const storeKey = 'atlas.crm.2027.v1';
const results = {
  method: 'JSDOM DOM forms/events against real shared icons, seed, core and rep module',
  scope: 'Synthetic local state only; no native GPS, browser layout or network proof',
  checks: [],
  errors: [],
  startedAt: new Date().toISOString(),
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function create(saved) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (err) => errors.push(String(err)));
  vc.on('error', (...args) => errors.push(args.map(String).join(' ')));
  const dom = new JSDOM(
    '<!doctype html><html dir="rtl" lang="ar"><body><div id="app"></div></body></html>',
    {
      url: 'https://atlas-flow.example.test/rep/',
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
    'src/apps/rep.js',
  ])
    w.eval(fs.readFileSync(path.join(root, file), 'utf8') + '\n//# sourceURL=' + file);
  w.Atlas.start('rep');
  await sleep(15);
  return { dom, w, A: w.Atlas, errors };
}
async function go(ctx, route, params = {}) {
  ctx.A.go(route, params);
  await sleep(20);
  assert.ok(
    !ctx.w.document.querySelector('#main-content').textContent.includes('تعذر عرض هذه الصفحة'),
    route + ' render failed',
  );
}
function field(ctx, selector, value, event = 'input') {
  const el = ctx.w.document.querySelector(selector);
  assert.ok(el, 'Missing field ' + selector);
  el.value = value;
  el.dispatchEvent(new ctx.w.Event(event, { bubbles: true }));
  return el;
}
async function click(ctx, selector) {
  const el = ctx.w.document.querySelector(selector);
  assert.ok(el, 'Missing control ' + selector);
  assert.ok(!el.disabled, 'Disabled control ' + selector);
  el.dispatchEvent(new ctx.w.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(20);
}
async function submit(ctx, selector) {
  const el = ctx.w.document.querySelector(selector);
  assert.ok(el, 'Missing form ' + selector);
  el.dispatchEvent(new ctx.w.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(40);
}
const snapshot = (ctx) => JSON.parse(ctx.w.localStorage.getItem(storeKey));
async function check(name, fn) {
  try {
    const evidence = await fn();
    results.checks.push({ name, status: 'passed', ...(evidence ? { evidence } : {}) });
    console.log('PASS ' + name);
  } catch (error) {
    results.checks.push({
      name,
      status: 'failed',
      message: String(error.message),
      stack: error.stack,
    });
    console.log('FAIL ' + name + ': ' + error.message);
    throw error;
  }
}
async function addQuote(ctx, clientId, title, discount, send) {
  await go(ctx, 'client-detail', { id: clientId });
  await click(ctx, '[data-action="quote-new"][data-id="' + clientId + '"]');
  field(ctx, 'input[name="title"]', title);
  await click(ctx, '[data-action="quote-add"][data-id="svc-security"]');
  await click(ctx, '[data-action="quote-add"][data-id="svc-social"]');
  field(ctx, 'input[name="discount"]', String(discount));
  if (send) await click(ctx, '[data-action="save-send-quote"]');
  else await submit(ctx, '#rep-quote-form');
  return ctx.A.state().quotes.find((q) => q.title === title);
}
async function main() {
  const ctx = await create();
  let liveId, quoteId, discountQuoteId;
  try {
    await check('Manual check-in blocks empty and short reasons', async () => {
      await go(ctx, 'visit-checkin', { id: 'client-1', visit: 'visit-1' });
      await submit(ctx, 'form[data-submit="start-visit"]');
      assert.equal(
        ctx.A.state().visits.filter((v) => v.repId === 'rep-1' && v.status === 'active').length,
        0,
      );
      field(ctx, '[name="manualReason"]', 'قصير');
      await submit(ctx, 'form[data-submit="start-visit"]');
      assert.equal(
        ctx.A.state().visits.filter((v) => v.repId === 'rep-1' && v.status === 'active').length,
        0,
      );
      return { emptyRejected: true, shortRejected: true };
    });
    await check('Manual check-in starts and persists a real visit record', async () => {
      field(
        ctx,
        '[name="manualReason"]',
        'تم تأكيد الوصول داخل المبنى وتعذر الحصول على موقع دقيق.',
      );
      field(ctx, '[name="notes"]', 'مراجعة احتياج العميل للموقع وخطة المتابعة.');
      await submit(ctx, 'form[data-submit="start-visit"]');
      const active = ctx.A.state().visits.find((v) => v.repId === 'rep-1' && v.status === 'active');
      assert.ok(active);
      liveId = active.id;
      assert.equal(liveId, 'visit-1');
      assert.equal(active.locationProof.method, 'manual');
      assert.ok(active.locationProof.reason.length >= 10);
      assert.ok(Number.isFinite(Date.parse(active.startedAt)));
      assert.equal(ctx.A.route(), 'visit-active');
      assert.equal(snapshot(ctx).visits.find((v) => v.id === liveId).status, 'active');
      return { visitId: liveId, proof: active.locationProof.method, route: ctx.A.route() };
    });
    await check('A second active visit is unavailable and not created', async () => {
      await go(ctx, 'visit-checkin', { id: 'client-2', visit: 'visit-2' });
      assert.ok(
        ctx.w.document.querySelector('#main-content').textContent.includes('هناك زيارة جارية'),
      );
      assert.equal(ctx.w.document.querySelectorAll('form[data-submit="start-visit"]').length, 0);
      assert.equal(
        ctx.A.state().visits.filter((v) => v.repId === 'rep-1' && v.status === 'active').length,
        1,
      );
      assert.equal(ctx.A.state().visits.find((v) => v.id === 'visit-2').status, 'scheduled');
    });
    await check('Visit outcome validates notes and future follow-up', async () => {
      await go(ctx, 'visit-outcome', { id: liveId });
      await click(ctx, '[data-action="choose-outcome"][data-value="reschedule"]');
      field(ctx, '[name="notes"]', 'قصير');
      field(ctx, '[name="nextAction"]', 'قصير');
      field(ctx, '[name="followUpAt"]', '2000-01-01T12:00');
      await submit(ctx, '[data-submit="prepare-outcome"]');
      assert.equal(ctx.w.document.querySelectorAll('[data-action="complete-visit"]').length, 0);
      assert.equal(ctx.A.state().visits.find((v) => v.id === liveId).status, 'active');
    });
    await check(
      'Finishing reschedule creates completed visit, follow-up task and scheduled visit',
      async () => {
        const beforeVisits = ctx.A.state().visits.length,
          beforeTasks = ctx.A.state().tasks.length;
        field(
          ctx,
          '[name="notes"]',
          'طلب صاحب القرار نقل الاجتماع إلى الموعد التالي لمراجعة النطاق مع الشريك.',
        );
        field(ctx, '[name="nextAction"]', 'اجتماع مراجعة النطاق مع صاحب القرار والشريك');
        const follow = ctx.A.addDays(2) + 'T14:30';
        field(ctx, '[name="followUpAt"]', follow);
        await submit(ctx, '[data-submit="prepare-outcome"]');
        await click(ctx, '[data-action="complete-visit"]');
        const state = ctx.A.state(),
          done = state.visits.find((v) => v.id === liveId);
        assert.equal(done.status, 'completed');
        assert.equal(done.outcome, 'reschedule');
        assert.ok(done.endedAt);
        assert.ok(done.followUpAt);
        assert.equal(
          state.visits.filter((v) => v.repId === 'rep-1' && v.status === 'active').length,
          0,
        );
        assert.equal(state.visits.length, beforeVisits + 1);
        assert.equal(state.tasks.length, beforeTasks + 1);
        assert.ok(
          state.tasks.some(
            (t) =>
              t.clientId === 'client-1' &&
              t.title.includes('صاحب القرار والشريك') &&
              t.status === 'open',
          ),
        );
        assert.ok(
          state.visits.some(
            (v) =>
              v.id !== liveId &&
              v.clientId === 'client-1' &&
              v.scheduledAt === done.followUpAt &&
              v.status === 'scheduled',
          ),
        );
        return { visitsCreated: 1, tasksCreated: 1, outcome: done.outcome };
      },
    );
    await check(
      'Documented do-not-contact blocks visits and message sending and cancels future stop',
      async () => {
        await go(ctx, 'client-detail', { id: 'client-4' });
        await click(ctx, '[data-action="contact-preference"]');
        field(
          ctx,
          '#app-modal [name="reason"]',
          'طلب العميل بوضوح إيقاف جميع الزيارات والرسائل حتى يتواصل معنا بنفسه.',
        );
        await submit(ctx, '#app-modal form');
        assert.equal(ctx.A.state().clients.find((c) => c.id === 'client-4').doNotContact, true);
        assert.equal(ctx.A.state().visits.find((v) => v.id === 'visit-4').status, 'cancelled');
        await go(ctx, 'visit-checkin', { id: 'client-4' });
        assert.equal(ctx.w.document.querySelectorAll('form[data-submit="start-visit"]').length, 0);
        assert.ok(
          ctx.w.document.querySelector('#main-content').textContent.includes('التواصل موقوف'),
        );
        await go(ctx, 'messages', { id: 'client-4' });
        assert.equal(ctx.w.document.querySelectorAll('form[data-submit="send-message"]').length, 0);
        return {
          clientId: 'client-4',
          futureVisit: 'cancelled',
          visitFormBlocked: true,
          messageFormBlocked: true,
        };
      },
    );
    await check('Quote catalog arithmetic stores numeric prices and 900 + 350 = 1250', async () => {
      const q = await addQuote(ctx, 'client-1', 'اختبار الحساب الرقمي', 0, false);
      assert.ok(q);
      quoteId = q.id;
      assert.equal(q.status, 'draft');
      assert.equal(q.items.length, 2);
      assert.equal(q.total, 1250);
      assert.equal(q.discount, 0);
      assert.equal(typeof q.total, 'number');
      q.items.forEach((it) => {
        assert.equal(typeof it.price, 'number');
        assert.equal(typeof it.qty, 'number');
      });
      assert.equal(snapshot(ctx).quotes.find((x) => x.id === quoteId).total, 1250);
      return { unitPrices: q.items.map((x) => x.price), total: q.total };
    });
    await check(
      'Sending valid quote changes shared state and creates targeted client notification',
      async () => {
        await click(ctx, '[data-action="send-quote"][data-id="' + quoteId + '"]');
        assert.equal(ctx.A.state().quotes.find((x) => x.id === quoteId).status, 'sent');
        assert.ok(
          ctx.A.state().notifications.some(
            (n) =>
              n.audience === 'client' &&
              n.clientId === 'client-1' &&
              n.body.includes('اختبار الحساب الرقمي'),
          ),
        );
        assert.ok(
          snapshot(ctx).quotes.some(
            (q) => q.id === quoteId && q.clientId === 'client-1' && q.status === 'sent',
          ),
        );
      },
    );
    await check(
      'Discount above 15% saves draft and approval snapshot instead of sending',
      async () => {
        const q = await addQuote(ctx, 'client-2', 'عرض خصم يحتاج موافقة', 300, true);
        assert.ok(q);
        discountQuoteId = q.id;
        assert.equal(q.status, 'draft');
        assert.equal(q.total, 950);
        const a = ctx.A.state().approvals.find((x) => x.quoteId === q.id && x.status === 'pending');
        assert.ok(a);
        assert.equal(a.amount, 300);
        assert.equal(a.subtotal, 1250);
        assert.ok(
          !ctx.A.state().notifications.some((n) => n.audience === 'client' && n.body === q.title),
        );
        return { subtotal: a.subtotal, discount: a.amount, net: q.total, status: q.status };
      },
    );
    await check('Rejected discount approval cannot send the quote', async () => {
      ctx.A.update((s) => {
        s.approvals
          .filter((a) => a.quoteId === discountQuoteId && a.status === 'pending')
          .forEach((a) => {
            a.status = 'rejected';
            a.decisionNote = 'Fixture admin rejection';
          });
      });
      await click(ctx, '[data-action="send-quote"][data-id="' + discountQuoteId + '"]');
      assert.equal(ctx.A.state().quotes.find((q) => q.id === discountQuoteId).status, 'draft');
      assert.ok(
        ctx.A.state().approvals.some(
          (a) => a.quoteId === discountQuoteId && a.status === 'pending',
        ),
      );
    });
    await check('Changing discount invalidates an earlier approved amount', async () => {
      ctx.A.update((s) => {
        s.approvals
          .filter((a) => a.quoteId === discountQuoteId && a.status === 'pending')
          .forEach((a) => {
            a.status = 'approved';
            a.decisionNote = 'Fixture approval for amount 300 only';
          });
      });
      await go(ctx, 'quote-builder', { id: discountQuoteId });
      field(ctx, '[name="discount"]', '350');
      await submit(ctx, '#rep-quote-form');
      await click(ctx, '[data-action="send-quote"][data-id="' + discountQuoteId + '"]');
      assert.equal(ctx.A.state().quotes.find((q) => q.id === discountQuoteId).status, 'draft');
      const latest = ctx.A.state().approvals.find(
        (a) => a.quoteId === discountQuoteId && a.status === 'pending' && a.amount === 350,
      );
      assert.ok(latest);
      assert.equal(latest.subtotal, 1250);
    });
    await check('Changing subtotal invalidates an earlier approved quote snapshot', async () => {
      ctx.A.update((s) => {
        s.approvals
          .filter((a) => a.quoteId === discountQuoteId && a.status === 'pending')
          .forEach((a) => {
            a.status = 'approved';
            a.decisionNote = 'Fixture approval for subtotal 1250 only';
          });
      });
      await go(ctx, 'quote-builder', { id: discountQuoteId });
      const q = ctx.A.state().quotes.find((x) => x.id === discountQuoteId),
        index = q.items.findIndex((x) => x.serviceId === 'svc-social');
      field(ctx, '[data-input="quote-qty"][data-index="' + index + '"]', '2');
      await submit(ctx, '#rep-quote-form');
      await click(ctx, '[data-action="send-quote"][data-id="' + discountQuoteId + '"]');
      const state = ctx.A.state();
      assert.equal(state.quotes.find((x) => x.id === discountQuoteId).status, 'draft');
      const pending = state.approvals.find(
        (a) => a.quoteId === discountQuoteId && a.status === 'pending',
      );
      assert.ok(pending);
      assert.equal(pending.subtotal, 1600);
      assert.equal(pending.amount, 350);
      return { reviewedOldSubtotal: 1250, currentSubtotal: pending.subtotal, status: 'draft' };
    });
    await check('Correct current admin approval allows quote sending', async () => {
      ctx.A.update((s) => {
        s.approvals
          .filter(
            (a) =>
              a.quoteId === discountQuoteId &&
              a.status === 'pending' &&
              a.subtotal === 1600 &&
              a.amount === 350,
          )
          .forEach((a) => {
            a.status = 'approved';
            a.decisionNote = 'Fixture current admin approval';
          });
      });
      await click(ctx, '[data-action="send-quote"][data-id="' + discountQuoteId + '"]');
      const q = ctx.A.state().quotes.find((x) => x.id === discountQuoteId);
      assert.equal(q.status, 'sent');
      assert.equal(q.total, 1250);
      assert.ok(
        ctx.A.state().notifications.some(
          (n) => n.audience === 'client' && n.clientId === 'client-2' && n.body === q.title,
        ),
      );
      return { status: q.status, net: q.total, subtotal: 1600, approvedDiscount: 350 };
    });
    await check(
      'No-contact preference blocks new commercial drafts as well as sending',
      async () => {
        // The corrected policy stops proactive commercial work, including draft creation.
        // A disabled/missing create control is acceptable only when the deep link is guarded too.
        const before = ctx.A.state().quotes.length;
        await go(ctx, 'client-detail', { id: 'client-4' });
        const create = ctx.w.document.querySelector(
          '[data-action="quote-new"][data-id="client-4"]',
        );
        if (create && !create.disabled)
          await click(ctx, '[data-action="quote-new"][data-id="client-4"]');
        await go(ctx, 'quote-builder', { client: 'client-4' });
        // A directly opened editor may render, but neither persistence nor sending may succeed.
        if (ctx.w.document.querySelector('#rep-quote-form')) {
          field(ctx, 'input[name="title"]', 'طلب عرض محظور بعد وقف التواصل');
          await click(ctx, '[data-action="quote-add"][data-id="svc-security"]');
          await submit(ctx, '#rep-quote-form');
          await click(ctx, '[data-action="save-send-quote"]');
        }
        assert.equal(ctx.A.state().quotes.length, before);
        assert.ok(ctx.w.document.body.textContent.includes('التواصل'));
        return { newDraftBlocked: true, directEditorCannotPersist: true };
      },
    );
    await check(
      'Offline attempted quote send remains draft and can be sent after reconnect',
      async () => {
        ctx.A.update((s) => {
          s.session.offline = true;
        });
        const q = await addQuote(ctx, 'client-1', 'عرض محفوظ دون اتصال', 0, true);
        assert.ok(q);
        assert.equal(q.status, 'draft');
        ctx.A.update((s) => {
          s.session.offline = false;
        });
        await click(ctx, '[data-action="send-quote"][data-id="' + q.id + '"]');
        assert.equal(ctx.A.state().quotes.find((x) => x.id === q.id).status, 'sent');
      },
    );
    await check(
      'Reload restores visits, no-contact preference, quotes and approval decisions',
      async () => {
        const saved = ctx.w.localStorage.getItem(storeKey),
          reloaded = await create(saved);
        try {
          const state = reloaded.A.state();
          assert.equal(state.visits.find((v) => v.id === liveId).status, 'completed');
          assert.equal(state.clients.find((c) => c.id === 'client-4').doNotContact, true);
          assert.equal(state.quotes.find((q) => q.id === quoteId).status, 'sent');
          assert.equal(state.quotes.find((q) => q.id === discountQuoteId).status, 'sent');
          assert.ok(
            state.approvals.some(
              (a) =>
                a.quoteId === discountQuoteId && a.status === 'approved' && a.subtotal === 1600,
            ),
          );
          assert.equal(state._revision, snapshot(ctx)._revision);
          results.errors.push(...reloaded.errors);
          return { revision: state._revision, quoteId, discountQuoteId };
        } finally {
          reloaded.dom.window.close();
        }
      },
    );
    results.errors.push(...ctx.errors);
  } finally {
    ctx.dom.window.close();
  }
}
main()
  .catch((error) => {
    results.fatalError = String(error.stack || error);
    process.exitCode = 1;
  })
  .finally(() => {
    results.finishedAt = new Date().toISOString();
    results.summary = {
      passed: results.checks.filter((x) => x.status === 'passed').length,
      failed: results.checks.filter((x) => x.status === 'failed').length,
      runtimeErrors: results.errors.length,
    };
    fs.writeFileSync(
      path.join(__dirname, 'rep-flows-results.json'),
      JSON.stringify(results, null, 2),
    );
    console.log(JSON.stringify(results.summary));
  });

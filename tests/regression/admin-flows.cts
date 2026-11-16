// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/* Migrated v1.1 regression cases: sources are generated from the CURRENT modular workspaces, never the old application code. */
/* Actual Elvorance shared runtime + admin module, exercised in JSDOM, without a browser. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '../../dist/test-adapters');
const results = [];
const cases = [];
const load = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function environment(role = 'admin', stored) {
  const errors = [],
    downloads = [],
    definitions = {};
  const console = new VirtualConsole();
  console.on('error', (...parts) => errors.push(parts.map(String).join(' ')));
  console.on('jsdomError', (error) => errors.push(error.message));
  const dom = new JSDOM(
    '<!doctype html><html lang="ar" dir="rtl"><body><div id="app"></div></body></html>',
    {
      url: `https://elvorance.example.test/${role}/`,
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      virtualConsole: console,
    },
  );
  const w = dom.window;
  w.scrollTo = () => {};
  w.print = () => {};
  w.structuredClone = (value) => JSON.parse(JSON.stringify(value));
  w.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  w.HTMLAnchorElement.prototype.click = function () {
    downloads.push({ filename: this.download, href: this.href });
  };
  w.Blob = class {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options.type;
    }
  };
  w.URL.createObjectURL = (blob) => {
    downloads.push({ text: blob.parts.join(''), type: blob.type });
    return 'blob:elvorance-demo-test';
  };
  w.URL.revokeObjectURL = () => {};
  if (stored) Object.entries(stored).forEach(([key, value]) => w.localStorage.setItem(key, value));
  ['src/shared/icons.js', 'src/shared/seed.js', 'src/shared/core.js'].forEach((file) =>
    w.eval(load(file)),
  );
  const register = w.Elvorance.register;
  w.Elvorance.register = (definition) => {
    definitions[definition.id] = definition;
    register(definition);
  };
  w.eval(load(`src/apps/${role}.js`));
  w.Elvorance.start(role);
  function navigate(route, params = {}) {
    w.location.hash =
      '#' + route + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '');
    w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  }
  function query(selector, parent = w.document) {
    const node = parent.querySelector(selector);
    assert.ok(node, `Missing element: ${selector}`);
    return node;
  }
  function click(selector) {
    query(selector).click();
  }
  function fill(name, value) {
    query(`#app-modal [name="${name}"]`).value = String(value);
  }
  function checks(name, ids) {
    w.document.querySelectorAll(`#app-modal input[name="${name}"]`).forEach((node) => {
      node.checked = ids.includes(node.value);
    });
  }
  function submit(selector) {
    const node = query(selector || '#app-modal form');
    assert.equal(node.checkValidity(), true, 'Test data must satisfy HTML form validation');
    node.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  }
  function serialized() {
    return Object.fromEntries(
      Array.from({ length: w.localStorage.length }, (_, i) => {
        const key = w.localStorage.key(i);
        return [key, w.localStorage.getItem(key)];
      }),
    );
  }
  return {
    dom,
    w,
    errors,
    downloads,
    definitions,
    navigate,
    query,
    click,
    fill,
    checks,
    submit,
    serialized,
    state: () => w.Elvorance.state(),
    close: () => dom.window.close(),
  };
}

function test(name, fn) {
  cases.push({ name, fn });
}

test('All 23 admin routes render with valid navigation, actions and child navigation parents', (env) => {
  const def = env.definitions.admin;
  // Includes the new tracking configuration/status screen, without claiming GPS/network tests.
  assert.equal(Object.keys(def.routes).length, 23);
  assert.equal(def.nav.length, 5);
  const ids = {
    'team-member': 'rep-1',
    'zone-detail': 'zone-1',
    'client-detail': 'client-1',
    opportunity: 'opp-1',
    'project-detail': 'project-1',
    'invoice-detail': 'invoice-1',
    'ticket-detail': 'ticket-1',
    conversation: 'client-1',
  };
  const shared = new Set([
    'notifications',
    'close-modal',
    'toggle-offline',
    'reset-demo',
    'download-data',
    'print-document',
  ]);
  for (const [name, route] of Object.entries(def.routes)) {
    env.navigate(name, ids[name] ? { id: ids[name] } : {});
    const main = env.query('#main-content');
    assert.ok(!main.textContent.includes('تعذر عرض هذه الصفحة'), name);
    assert.ok(!main.innerHTML.includes('NaN'), name + ' must not render NaN');
    assert.ok(main.querySelector('h1'), name + ' must have a heading');
    main
      .querySelectorAll('[data-go]')
      .forEach((el) =>
        assert.ok(def.routes[el.dataset.go], `Unknown route ${el.dataset.go} on ${name}`),
      );
    main
      .querySelectorAll('[data-action],[data-submit],[data-change],[data-input]')
      .forEach((el) => {
        const action =
          el.dataset.action || el.dataset.submit || el.dataset.change || el.dataset.input;
        assert.ok(def.actions[action] || shared.has(action), `Unknown action ${action} on ${name}`);
      });
    if (route.nav) assert.ok(env.query(`[data-nav="${route.nav}"]`).classList.contains('active'));
  }
});

test('Territory assignment synchronizes zone.repIds and rep.zoneIds including removals', (env) => {
  env.navigate('zone-detail', { id: 'zone-1' });
  env.click('[data-action="assign-zone"][data-id="zone-1"]');
  env.checks('repIds', ['rep-2', 'rep-3']);
  env.submit();
  const s = env.state();
  assert.deepEqual(Array.from(s.zones.find((z) => z.id === 'zone-1').repIds).sort(), [
    'rep-2',
    'rep-3',
  ]);
  assert.ok(s.reps.find((r) => r.id === 'rep-2').zoneIds.includes('zone-1'));
  assert.ok(s.reps.find((r) => r.id === 'rep-2').zoneIds.includes('zone-2'));
  assert.ok(s.reps.find((r) => r.id === 'rep-3').zoneIds.includes('zone-1'));
  assert.ok(!s.reps.find((r) => r.id === 'rep-1').zoneIds.includes('zone-1'));
  const reopened = environment('admin', env.serialized());
  try {
    assert.ok(
      reopened
        .state()
        .reps.find((r) => r.id === 'rep-2')
        .zoneIds.includes('zone-1'),
    );
  } finally {
    reopened.close();
  }
});

test('Adding a team member stores skills, target and synchronized multiple zones', (env) => {
  env.navigate('team');
  env.click('[data-action="new-member"]');
  env.fill('name', 'مندوب التحقق');
  env.fill('phone', '+963900001111');
  env.fill('target', 9000);
  env.fill('skills', 'المواقع، التدريب');
  env.checks('zoneIds', ['zone-1', 'zone-3']);
  env.submit();
  const s = env.state(),
    rep = s.reps.find((r) => r.name === 'مندوب التحقق');
  assert.ok(rep);
  assert.equal(rep.target, 9000);
  assert.equal(rep.skills.length, 2);
  assert.ok(s.zones.find((z) => z.id === 'zone-1').repIds.includes(rep.id));
  assert.ok(s.zones.find((z) => z.id === 'zone-3').repIds.includes(rep.id));
});

test('Assigned task persists with target representative and scoped notification', (env) => {
  env.navigate('tasks');
  env.click('[data-action="new-task"]');
  env.fill('title', 'إعداد خطة متابعة للاختبار');
  env.fill('repId', 'rep-1');
  env.fill('clientId', 'client-1');
  env.fill('dueDate', env.w.Elvorance.addDays(2));
  env.fill('priority', 'high');
  env.submit();
  const task = env.state().tasks.find((t) => t.title === 'إعداد خطة متابعة للاختبار');
  assert.ok(task);
  assert.equal(task.repId, 'rep-1');
  assert.equal(task.status, 'open');
  assert.equal(task.priority, 'high');
  assert.ok(
    env.state().notifications.some((n) => n.repId === 'rep-1' && n.title === 'تحديث مهمة للفريق'),
  );
  const reopened = environment('admin', env.serialized());
  try {
    assert.ok(reopened.state().tasks.find((t) => t.id === task.id && t.repId === 'rep-1'));
  } finally {
    reopened.close();
  }
});

function addApprovalFixture(env, id) {
  env.w.Elvorance.update((s) => {
    // Approval fixtures must match the real quote; stale/mismatched approvals are now rejected.
    const quote = s.quotes.find((q) => q.id === 'quote-3');
    quote.items = [{ serviceId: 'svc-store', title: 'متجر اختبار الاعتماد', qty: 1, price: 3200 }];
    quote.discount = 700;
    quote.total = 2500;
    s.approvals.push({
      id,
      type: 'discount',
      repId: quote.repId,
      clientId: quote.clientId,
      quoteId: quote.id,
      quoteFingerprint: env.w.Elvorance.quoteFingerprint(quote),
      subtotal: 3200,
      title: 'مراجعة خصم تحقق',
      details: 'طلب اختبار يحافظ على عقد العرض.',
      amount: 700,
      status: 'pending',
      createdAt: new Date().toISOString(),
      decisionNote: '',
    });
  });
}
test('Discount approval preserves quoteId and subtotal and does not send the draft quote', (env) => {
  addApprovalFixture(env, 'approval-check');
  const before = env.state().quotes.find((q) => q.id === 'quote-3').status;
  env.navigate('approvals');
  env.click('[data-action="review-approval"][data-id="approval-check"]');
  env.fill('decision', 'approved');
  env.fill('note', 'موافقة تجريبية بعد مراجعة هامش المشروع');
  env.submit();
  const record = env.state().approvals.find((a) => a.id === 'approval-check');
  assert.equal(record.status, 'approved');
  assert.equal(record.quoteId, 'quote-3');
  assert.equal(record.subtotal, 3200);
  assert.equal(env.state().quotes.find((q) => q.id === 'quote-3').status, before);
  assert.ok(record.decisionNote.length > 6);
});

test('Approval rejection records reason and retains quote linkage', (env) => {
  addApprovalFixture(env, 'approval-reject');
  env.navigate('approvals');
  env.click('[data-action="review-approval"][data-id="approval-reject"]');
  env.fill('decision', 'rejected');
  env.fill('note', 'الخصم المطلوب يتجاوز النطاق المتفق عليه');
  env.submit();
  const record = env.state().approvals.find((a) => a.id === 'approval-reject');
  assert.equal(record.status, 'rejected');
  assert.equal(record.quoteId, 'quote-3');
  assert.equal(record.subtotal, 3200);
});

test('Project completion requires finished milestones and approved actual content', (env) => {
  // Changing status must never manufacture work or client approvals.
  const oldMilestones = JSON.parse(
    JSON.stringify(env.state().projects.find((p) => p.id === 'project-1').milestones),
  );
  env.navigate('project-detail', { id: 'project-1' });
  env.click('[data-action="edit-project"]');
  env.fill('status', 'completed');
  env.fill('progress', '100');
  env.fill('stage', 'launch');
  env.submit();
  assert.notEqual(env.state().projects.find((p) => p.id === 'project-1').status, 'completed');
  assert.deepEqual(
    JSON.parse(JSON.stringify(env.state().projects.find((p) => p.id === 'project-1').milestones)),
    oldMilestones,
  );
  env.w.Elvorance.closeModal();
  env.w.Elvorance.update((s) => {
    const p = s.projects.find((p) => p.id === 'project-1');
    p.milestones.forEach((m) => {
      m.status = 'done';
    });
    p.deliverables.forEach((d) => {
      d.status = 'approved';
      d.content = 'مستند تسليم فعلي للاختبار يتضمن النطاق المنجز وملاحظات المراجعة واعتماد العميل.';
    });
  });
  env.click('[data-action="edit-project"]');
  env.fill('status', 'completed');
  env.fill('progress', '100');
  env.fill('stage', 'launch');
  env.submit();
  const project = env.state().projects.find((p) => p.id === 'project-1');
  assert.equal(project.status, 'completed');
  assert.equal(project.progress, 100);
  assert.equal(project.stage, 'launch');
  assert.ok(project.milestones.every((m) => m.status === 'done'));
  assert.ok(
    env
      .state()
      .notifications.some((n) => n.clientId === project.clientId && n.title === 'تحديث مشروعك'),
  );
});

test('Milestone updates recalculate project progress and reopen an incomplete project', (env) => {
  env.w.Elvorance.update((s) => {
    const p = s.projects.find((p) => p.id === 'project-1');
    p.status = 'completed';
    p.progress = 100;
    p.milestones.forEach((m) => {
      m.status = 'done';
    });
  });
  env.navigate('project-detail', { id: 'project-1' });
  const first = env.state().projects.find((p) => p.id === 'project-1').milestones[0];
  env.click(`[data-action="edit-milestone"][data-milestone="${first.id}"]`);
  env.fill('status', 'pending');
  env.submit();
  const p = env.state().projects.find((p) => p.id === 'project-1');
  assert.equal(p.status, 'active');
  assert.equal(p.progress, Math.round(((p.milestones.length - 1) / p.milestones.length) * 100));
});

test('Deliverable resubmission requires changed content and becomes pending client review', async (env) => {
  env.navigate('project-detail', { id: 'project-1' });
  env.click('[data-action="respond-deliverable"]');
  // Async file/content validation must finish before asserting the persisted transition.
  env.fill('response', 'تمت مراجعة الملاحظات وأعيد الطرح للمراجعة التجريبية');
  env.fill('resolution', 'resubmit');
  env.fill(
    'content',
    'محتوى نسخة جديدة فعلية للاختبار: تعديل العنوان وقائمة الخدمات وتفاصيل نموذج التواصل بناءً على المراجعة.',
  );
  env.submit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const project = env.state().projects.find((p) => p.id === 'project-1'),
    item = project.deliverables[0];
  assert.equal(item.status, 'pending');
  assert.ok(item.adminResponse.includes('الملاحظات'));
  assert.equal(project.status, 'waiting_client');
  assert.ok(item.content.includes('محتوى نسخة جديدة'));
  assert.ok(item.history.length > 0);
});

test('Support reply persists and is visible in the real client module after reload', (env) => {
  env.navigate('ticket-detail', { id: 'ticket-1' });
  const node = env.query('form[data-submit="reply-ticket"]');
  env.query('[name="text"]', node).value = 'رد الإدارة للاختبار: تم تحديد موعد المراجعة';
  env.query('[name="status"]', node).value = 'in_progress';
  env.submit('form[data-submit="reply-ticket"]');
  const ticket = env.state().tickets.find((t) => t.id === 'ticket-1');
  assert.equal(ticket.status, 'in_progress');
  assert.equal(ticket.messages.at(-1).role, 'admin');
  const client = environment('client', env.serialized());
  try {
    client.navigate('ticket-detail', { id: 'ticket-1' });
    assert.ok(client.query('#main-content').textContent.includes('رد الإدارة للاختبار'));
    assert.deepEqual(client.errors, []);
  } finally {
    client.close();
  }
});

test('Analytics filters and actual core CSV export preserve rows and neutralize formulas', (env) => {
  env.w.Elvorance.update((s) => {
    s.reps.find((r) => r.id === 'rep-1').name = '=1+1';
  });
  env.navigate('analytics');
  const rep = env.query('[data-key="analyticsRep"]');
  rep.value = 'rep-1';
  rep.dispatchEvent(new env.w.Event('change', { bubbles: true }));
  assert.equal(env.w.document.querySelectorAll('.data-table tbody tr').length, 1);
  env.click('[data-action="export-analytics"]');
  const csv = env.downloads.find((item) => item.text)?.text;
  assert.ok(csv);
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(!csv.includes('سارة الحسن'));
});

test('Search retains focus and hides nonmatching client rows without state mutation', (env) => {
  env.navigate('clients');
  const revision = env.state()._revision;
  const search = env.query('input[data-input="search-records"]');
  search.focus();
  search.value = 'مدار';
  search.dispatchEvent(new env.w.Event('input', { bubbles: true }));
  const visible = Array.from(
    env.w.document.querySelectorAll('[data-collection="clients"] [data-search]'),
  ).filter((node) => !node.hidden);
  assert.equal(visible.length, 1);
  assert.ok(visible[0].textContent.includes('مقهى مدار'));
  assert.equal(env.w.document.activeElement, search);
  assert.equal(env.state()._revision, revision);
});

test('Pipeline loss transition requires reason and preserves it in the record', (env) => {
  env.navigate('opportunity', { id: 'opp-1' });
  env.click('[data-action="change-stage"][data-stage="lost"]');
  env.fill('reason', 'أوقف العميل المشروع بسبب تغيير أولوياته');
  env.submit();
  const item = env.state().opportunities.find((o) => o.id === 'opp-1');
  assert.equal(item.stage, 'lost');
  assert.equal(item.probability, 0);
  assert.ok(item.lossReason.includes('أولوياته'));
  assert.ok(item.closedAt);
});

test('Payment recording cannot exceed balance and valid demo entry updates the invoice', (env) => {
  env.navigate('invoice-detail', { id: 'invoice-2' });
  env.click('[data-action="record-payment"]');
  env.fill('amount', '200');
  env.fill('note', 'قيد تحقق تجريبي فقط');
  env.submit();
  const invoice = env.state().invoices.find((i) => i.id === 'invoice-2');
  assert.equal(invoice.paid, 200);
  assert.equal(invoice.status, 'partial');
  assert.ok(invoice.notes.includes('تجريبي'));
  env.click('[data-action="record-payment"]');
  env.fill('amount', '999999');
  env.fill('note', 'اختبار تجاوز');
  assert.equal(env.query('#app-modal form').checkValidity(), false);
  assert.equal(env.state().invoices.find((i) => i.id === 'invoice-2').paid, 200);
});

test('Client detail uses service labels rather than raw service identifiers', (env) => {
  env.navigate('client-detail', { id: 'client-1' });
  const main = env.query('#main-content');
  assert.ok(main.textContent.includes('موقع يليق بعلامتك'));
  assert.ok(!main.textContent.includes('svc-web'));
});

test('Storage failure leaves previous state intact and does not close edit modal', (env) => {
  env.navigate('team-member', { id: 'rep-1' });
  env.click('[data-action="edit-member"]');
  const original = env.state().reps.find((r) => r.id === 'rep-1').target;
  env.fill('target', original + 1000);
  const nativeSet = env.w.Storage.prototype.setItem;
  env.w.Storage.prototype.setItem = () => {
    throw new Error('test quota');
  };
  env.submit();
  env.w.Storage.prototype.setItem = nativeSet;
  assert.equal(env.state().reps.find((r) => r.id === 'rep-1').target, original);
  assert.equal(env.query('#app-modal').open, true);
  assert.ok(env.query('#toasts').textContent.includes('تعذر حفظ التغيير'));
});

async function main() {
  for (const entry of cases) {
    let env;
    try {
      env = environment();
      await entry.fn(env);
      assert.deepEqual(env.errors, [], 'No runtime or render errors');
      results.push({ name: entry.name, status: 'passed' });
    } catch (error) {
      results.push({ name: entry.name, status: 'failed', error: error.stack });
    } finally {
      env?.close();
    }
  }
  const summary = {
    suite: 'Elvorance 2027 admin JSDOM flows',
    date: new Date().toISOString(),
    platform: 'JSDOM; no native browser execution',
    passed: results.filter((r) => r.status === 'passed').length,
    failed: results.filter((r) => r.status === 'failed').length,
    total: results.length,
    results,
  };
  const output = process.env.ELVORANCE_ADMIN_RESULTS || path.join(__dirname, 'admin-results.json');
  fs.writeFileSync(output, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.failed ? 1 : 0;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

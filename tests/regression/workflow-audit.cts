// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/* Migrated v1.1 regression cases: sources are generated from the CURRENT modular workspaces, never the old application code. */
/* Focused business-transition audit. Uses actual Elvorance scripts, not reimplemented handlers.
 * Run: ELVORANCE_JSDOM_PATH=/path/to/jsdom node tests/workflow-audit.cjs
 * Writes only docs/WORKFLOW-AUDIT.txt; structured results are printed to stdout.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '../../dist/test-adapters');
const key = 'atlas.crm.2027.v1';
const files = [
  'src/shared/icons.js',
  'src/shared/seed.js',
  'src/shared/core.js',
  'src/apps/rep.js',
  'src/apps/client.js',
  'src/apps/admin.js',
];
const sources = Object.fromEntries(
  files.map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]),
);
const clone = (value) => JSON.parse(JSON.stringify(value));
const tests = [],
  results = [],
  inventories = {},
  coverage = {};
let currentTest = '';

function environment(role, serialized) {
  const errors = [],
    definitions = {},
    downloads = [];
  const vc = new VirtualConsole();
  vc.on('error', (...values) => errors.push(values.map(String).join(' ')));
  vc.on('jsdomError', (error) => errors.push(error.message));
  const dom = new JSDOM(
    '<!doctype html><html lang="ar" dir="rtl"><body><div id="app"></div></body></html>',
    {
      url: `https://elvorance-workflow.example.test/${role}/`,
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      virtualConsole: vc,
    },
  );
  // JSDOM does not expose structuredClone even when Node.js does.
  // Provide the standard API in this isolated test window before app startup.
  dom.window.structuredClone = structuredClone;
  const w = dom.window;
  w.scrollTo = () => {};
  w.print = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  w.HTMLAnchorElement.prototype.click = function () {
    downloads.push({ name: this.download, href: this.href });
  };
  w.Blob = class {
    constructor(parts, options = {}) {
      this.parts = parts;
      this.type = options.type;
    }
  };
  w.URL.createObjectURL = (blob) => {
    downloads.push({ text: blob.parts.join(''), type: blob.type });
    return 'blob:elvorance-workflow';
  };
  w.URL.revokeObjectURL = () => {};
  if (serialized)
    w.localStorage.setItem(
      key,
      typeof serialized === 'string' ? serialized : JSON.stringify(serialized),
    );
  ['src/shared/icons.js', 'src/shared/seed.js', 'src/shared/core.js'].forEach((file) =>
    w.eval(sources[file]),
  );
  const register = w.Elvorance.register;
  w.Elvorance.register = (definition) => {
    definitions[definition.id] = definition;
    inventories[definition.id] = Object.fromEntries(
      Object.entries(definition.actions).map(([name, handler]) => [name, handler.toString()]),
    );
    Object.entries(definition.actions).forEach(([name, handler]) => {
      definition.actions[name] = function (...args) {
        (coverage[`${role}:${name}`] ||= new Set()).add(currentTest);
        return handler.apply(this, args);
      };
    });
    register(definition);
  };
  w.eval(sources[`src/apps/${role}.js`]);
  w.Elvorance.start(role);
  const q = (selector, parent = w.document) => {
    const node = parent.querySelector(selector);
    assert.ok(node, `Missing UI element: ${selector}`);
    return node;
  };
  const env = {
    role,
    dom,
    w,
    errors,
    downloads,
    definitions,
    state: () => w.Elvorance.state(),
    serialize: () => w.localStorage.getItem(key) || JSON.stringify(w.Elvorance.state()),
    stored: () => JSON.parse(w.localStorage.getItem(key) || JSON.stringify(w.Elvorance.state())),
    q,
    navigate(route, params = {}) {
      w.location.hash =
        '#' +
        route +
        (Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '');
      w.dispatchEvent(new w.HashChangeEvent('hashchange'));
    },
    flush() {
      w.dispatchEvent(new w.HashChangeEvent('hashchange'));
    },
    click(selector) {
      const el = q(selector);
      if (el.dataset.action && !definitions[role].actions[el.dataset.action])
        (coverage[`core:${el.dataset.action}`] ||= new Set()).add(currentTest);
      el.click();
    },
    fill(name, value, selector = '#app-modal form') {
      const el = q(`[name="${name}"]`, q(selector));
      if (el.type === 'checkbox') el.checked = Boolean(value);
      else el.value = String(value);
      return el;
    },
    input(selector, value, type = 'input') {
      const el = q(selector);
      el.value = String(value);
      el.dispatchEvent(new w.Event(type, { bubbles: true }));
      return el;
    },
    submit(selector = '#app-modal form', { validate = true } = {}) {
      const form = typeof selector === 'string' ? q(selector) : selector;
      if (validate) assert.ok(form.checkValidity(), `Invalid fixture form ${form.dataset.submit}`);
      form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
      return form;
    },
    invoke(name, { data = {}, id = '', dataset = {}, form, el, state } = {}) {
      const node = form || w.document.createElement('form');
      if (id) node.dataset.id = id;
      const target = el || node;
      Object.assign(target.dataset, dataset);
      return definitions[role].actions[name]({
        event: new w.Event('click'),
        el: target,
        form: node,
        data,
        state: state || w.Elvorance.state(),
        params: w.Elvorance.params(),
      });
    },
    fixture(mutator) {
      assert.equal(w.Elvorance.update(mutator), true, 'Fixture must persist');
    },
    external(mutator, notify = false) {
      const next = clone(env.stored());
      mutator(next);
      next._revision = (next._revision || 0) + 1;
      next._updatedAt = new Date().toISOString();
      const oldValue = w.localStorage.getItem(key);
      const newValue = JSON.stringify(next);
      w.localStorage.setItem(key, newValue);
      if (notify)
        w.dispatchEvent(
          new w.StorageEvent('storage', { key, oldValue, newValue, storageArea: w.localStorage }),
        );
      return next;
    },
    close() {
      dom.window.close();
    },
  };
  return env;
}

function test(id, title, fn) {
  tests.push({ id, title, fn });
}
const find = (env, collection, id) => env.state()[collection].find((item) => item.id === id);
const persisted = (env, collection, id) => env.stored()[collection].find((item) => item.id === id);
function approvalFixture(env) {
  env.fixture((s) =>
    s.approvals.push({
      id: 'audit-approval',
      type: 'scope_change',
      repId: 'rep-1',
      clientId: 'client-1',
      title: 'قرار اختبار مستقل',
      details: 'نطاق اختبار التعارض',
      amount: 0,
      status: 'pending',
      createdAt: new Date().toISOString(),
      decisionNote: '',
    }),
  );
}
function openPayment(env, invoiceId, amount) {
  env.navigate('invoice-detail', { id: invoiceId });
  env.click('[data-action="record-payment"]');
  env.fill('amount', amount);
  env.fill('note', 'مرجع اختبار قيد مستقل');
  return env.q('#app-modal form');
}
function acceptFixture(env, quoteId = 'quote-1') {
  env.navigate('quote-detail', { id: quoteId });
  env.click('[data-action="accept-quote-modal"]');
  env.fill('acceptTerms', true);
  env.submit();
  const contract = env.state().contracts.find((c) => c.quoteId === quoteId);
  assert.ok(contract, 'Acceptance must create linked contract');
  return contract.id;
}

test('WF01', 'لا تُنقل فرصة إلى ناجحة دون عرض مقبول مرتبط', ({ env }) => {
  const a = env('admin'),
    before = find(a, 'opportunities', 'opp-1').stage;
  a.navigate('opportunity', { id: 'opp-1' });
  a.click('[data-action="change-stage"][data-stage="won"]');
  if (a.w.document.querySelector('#app-modal[open] [data-action="confirm-action"]'))
    a.click('[data-action="confirm-action"]');
  assert.equal(
    find(a, 'opportunities', 'opp-1').stage,
    before,
    'Unaccepted opportunity was marked won',
  );
});
test('WF02', 'تحرير الفرصة لا يتجاوز شرط قبول عرض العميل', ({ env }) => {
  const a = env('admin'),
    before = find(a, 'opportunities', 'opp-1').stage;
  a.navigate('opportunity', { id: 'opp-1' });
  a.click('[data-action="edit-opportunity"]');
  a.fill('stage', 'won');
  a.submit();
  assert.equal(
    find(a, 'opportunities', 'opp-1').stage,
    before,
    'Edit form bypassed accepted-quote restriction',
  );
});
test('WF03', 'الفرصة المقبولة لا تُعاد إلى تفاوض بمسار تغيير عام', ({ env }) => {
  const a = env('admin');
  a.fixture((s) => {
    s.quotes.find((q) => q.id === 'quote-1').status = 'accepted';
    s.opportunities.find((o) => o.id === 'opp-1').stage = 'won';
  });
  a.navigate('opportunity', { id: 'opp-1' });
  a.click('[data-action="change-stage"][data-stage="negotiation"]');
  if (a.w.document.querySelector('#app-modal[open] [data-action="confirm-action"]'))
    a.click('[data-action="confirm-action"]');
  assert.equal(
    find(a, 'opportunities', 'opp-1').stage,
    'won',
    'Accepted business was reopened without explicit cancellation flow',
  );
});
test('WF04', 'اكتمال المشروع لا يختلق إنجاز مراحل أو اعتماد تسليم', ({ env }) => {
  const a = env('admin'),
    before = clone(find(a, 'projects', 'project-1').milestones);
  a.navigate('project-detail', { id: 'project-1' });
  a.click('[data-action="edit-project"]');
  a.fill('status', 'completed');
  a.fill('progress', 100);
  a.fill('stage', 'launch');
  a.submit();
  const p = find(a, 'projects', 'project-1');
  assert.notEqual(p.status, 'completed', 'Pending deliverables were ignored');
  assert.deepEqual(clone(p.milestones), before, 'Completion synthesized finished milestones');
});
test('WF05', 'التقدم 100 لا يتجاوز شروط الإنجاز عبر نموذج المشروع', ({ env }) => {
  const a = env('admin');
  a.navigate('project-detail', { id: 'project-1' });
  a.click('[data-action="edit-project"]');
  a.fill('status', 'active');
  a.fill('progress', 100);
  a.submit();
  assert.ok(
    find(a, 'projects', 'project-1').progress < 100,
    'Inconsistent active/100 project persisted',
  );
});
test('WF06', 'اكتمال المراحل لا يغلق المشروع مع مراجعة عميل معلقة', ({ env }) => {
  const a = env('admin');
  a.fixture((s) => {
    const p = s.projects.find((x) => x.id === 'project-1');
    p.milestones.forEach((m) => {
      m.status = 'done';
    });
    p.milestones.at(-1).status = 'active';
    p.deliverables[0].status = 'changes_requested';
  });
  const milestone = find(a, 'projects', 'project-1').milestones.at(-1);
  a.navigate('project-detail', { id: 'project-1' });
  a.click(`[data-action="edit-milestone"][data-milestone="${milestone.id}"]`);
  a.fill('status', 'done');
  a.submit();
  const p = find(a, 'projects', 'project-1');
  assert.notEqual(p.status, 'completed');
  assert.ok(p.progress < 100, '100% published despite unresolved deliverable review');
});
test('WF07', 'لا إغلاق لمشروع خالٍ من التسليمات الفعلية', ({ env }) => {
  const a = env('admin');
  a.fixture((s) => {
    const p = s.projects.find((x) => x.id === 'project-1');
    p.milestones.forEach((m) => {
      m.status = 'done';
    });
    p.deliverables = [];
  });
  a.navigate('project-detail', { id: 'project-1' });
  a.click('[data-action="edit-project"]');
  a.fill('status', 'completed');
  a.fill('progress', 100);
  a.fill('stage', 'launch');
  a.submit();
  assert.notEqual(find(a, 'projects', 'project-1').status, 'completed');
});
test('WF08', 'إنجاز موثق بمراحل وتسليم معتمد يمكن إغلاقه', ({ env }) => {
  const a = env('admin');
  a.fixture((s) => {
    const p = s.projects.find((x) => x.id === 'project-1');
    p.milestones.forEach((m) => {
      m.status = 'done';
    });
    p.deliverables = [
      {
        id: 'audit-real-delivery',
        title: 'مستند تسليم اختبار',
        type: 'document',
        status: 'approved',
        version: 1,
        content:
          'مستند اختبار فعلي: مراجعة عنوان الصفحة وقائمة الخدمات ونموذج التواصل، مع شروط التسليم المكتوبة وحالة الاعتماد المسجلة.',
        notes: 'محتوى مستند اختبار صريح داخل الحالة',
      },
    ];
  });
  a.navigate('project-detail', { id: 'project-1' });
  a.click('[data-action="edit-project"]');
  a.fill('status', 'completed');
  a.fill('progress', 100);
  a.fill('stage', 'launch');
  a.submit();
  const p = find(a, 'projects', 'project-1');
  assert.equal(p.status, 'completed');
  assert.equal(p.progress, 100);
  assert.equal(p.stage, 'launch');
});
test('WF09', 'تكرار إرسال نموذج التحصيل الجزئي لا يضاعف القيد نفسه', ({ env }) => {
  const a = env('admin'),
    form = openPayment(a, 'invoice-2', 200);
  a.submit(form);
  a.submit(form);
  assert.equal(
    find(a, 'invoices', 'invoice-2').paid,
    200,
    'Same form submission recorded two payments',
  );
});
test('WF10', 'إضافة تحصيل لا تُنقص رصيد عقد تاريخي', ({ env }) => {
  const a = env('admin'),
    before = find(a, 'contracts', 'contract-3').paid;
  a.submit(openPayment(a, 'invoice-3', 200));
  assert.equal(
    find(a, 'contracts', 'contract-3').paid,
    before + 200,
    'Historic paid amount was lost by recomputing only currently present invoices',
  );
});
test('WF11', 'تحصيل جزئي وكامل يزامن الفاتورة والعقد وخطة الدفع', ({ env }) => {
  const a = env('admin');
  a.fixture((s) => {
    s.contracts.push({
      id: 'audit-contract',
      clientId: 'client-1',
      title: 'عقد تحصيل الاختبار',
      total: 500,
      paid: 0,
      status: 'signed',
      paymentPlan: [
        {
          id: 'audit-plan',
          label: 'الدفعة',
          amount: 500,
          paid: 0,
          status: 'due',
          due: a.w.Elvorance.addDays(3),
        },
      ],
    });
    s.invoices.push({
      id: 'audit-invoice',
      clientId: 'client-1',
      contractId: 'audit-contract',
      paymentPlanId: 'audit-plan',
      title: 'فاتورة الاختبار',
      total: 500,
      paid: 0,
      status: 'due',
      dueDate: a.w.Elvorance.addDays(3),
      notes: '',
    });
  });
  a.submit(openPayment(a, 'audit-invoice', 125));
  let c = find(a, 'contracts', 'audit-contract');
  assert.equal(c.paid, 125);
  assert.equal(c.paymentPlan[0].paid, 125);
  assert.equal(c.paymentPlan[0].status, 'partial');
  a.submit(openPayment(a, 'audit-invoice', 375));
  c = find(a, 'contracts', 'audit-contract');
  assert.equal(find(a, 'invoices', 'audit-invoice').status, 'paid');
  assert.equal(c.paid, 500);
  assert.equal(c.paymentPlan[0].paid, 500);
  assert.equal(c.paymentPlan[0].status, 'paid');
});
test('WF12', 'التحصيل يعيد فحص الرصيد الأحدث داخل المعاملة', ({ env }) => {
  const a = env('admin'),
    form = openPayment(a, 'invoice-2', 200);
  a.external((s) => {
    s.invoices.find((i) => i.id === 'invoice-2').paid = 900;
  });
  a.submit(form);
  assert.equal(
    persisted(a, 'invoices', 'invoice-2').paid,
    900,
    'Stale payment was silently clamped and recorded against a smaller current balance',
  );
});
test('WF13', 'قرار الموافقة القديم لا يستبدل قرارًا أحدث', ({ env }) => {
  const a = env('admin');
  approvalFixture(a);
  a.navigate('approvals');
  a.click('[data-action="review-approval"][data-id="audit-approval"]');
  a.fill('decision', 'rejected');
  a.fill('note', 'رفض من نموذج قديم للاختبار');
  a.external((s) => {
    const row = s.approvals.find((x) => x.id === 'audit-approval');
    row.status = 'approved';
    row.decisionNote = 'قرار أحدث واجب الحفظ';
  });
  a.submit();
  assert.equal(persisted(a, 'approvals', 'audit-approval').status, 'approved');
  assert.equal(persisted(a, 'approvals', 'audit-approval').decisionNote, 'قرار أحدث واجب الحفظ');
});
test('WF14', 'إيقاف التواصل الأحدث يمنع رسالة إدارة من نموذج قديم', ({ env }) => {
  const a = env('admin');
  a.navigate('conversation', { id: 'client-1' });
  const form = a.q('form[data-submit="send-message"]');
  a.fill('text', 'رسالة ينبغي ألا تحفظ بعد وقف التواصل', 'form[data-submit="send-message"]');
  const count = a.state().messages.length;
  a.external((s) => {
    s.clients.find((c) => c.id === 'client-1').doNotContact = true;
  });
  a.submit(form);
  assert.equal(
    a.stored().messages.length,
    count,
    'Latest doNotContact was ignored inside mutation',
  );
});
test('WF15', 'إسناد مهمة يظهر للمندوب وإكمالها يعود للإدارة', ({ env }) => {
  const a = env('admin');
  a.navigate('tasks');
  a.click('[data-action="new-task"]');
  a.fill('title', 'مهمة تكامل مستقلة');
  a.fill('repId', 'rep-1');
  a.fill('clientId', 'client-1');
  a.fill('dueDate', a.w.Elvorance.addDays(2));
  a.fill('priority', 'high');
  a.submit();
  const task = a.state().tasks.find((t) => t.title === 'مهمة تكامل مستقلة');
  assert.ok(task);
  const r = env('rep', a.serialize());
  r.navigate('tasks');
  r.click(`[data-action="task-toggle"][data-id="${task.id}"]`);
  assert.equal(find(r, 'tasks', task.id).status, 'done');
  const reopened = env('admin', r.serialize());
  reopened.navigate('tasks');
  assert.equal(find(reopened, 'tasks', task.id).status, 'done');
});
test('WF16', 'معرّفات إدارية غير موجودة لا تنشئ قيودًا يتيمة', ({ env }) => {
  const a = env('admin'),
    before = a.serialize();
  a.invoke('save-payment', {
    id: 'missing-invoice',
    data: { amount: '100', note: 'اختبار معرّف خاطئ' },
  });
  a.invoke('decide-approval', {
    id: 'missing-approval',
    data: { decision: 'approved', note: 'اختبار قرار غير موجود' },
  });
  a.invoke('save-milestone', {
    id: 'missing-project',
    data: { milestoneId: 'missing', status: 'done', title: 'مرحلة' },
  });
  assert.equal(a.serialize(), before, 'Invalid target mutated persistent state');
});
test('WF17', 'تفضيل العميل عدم التواصل يوقف الزيارات والمهام الاستباقية', ({ env }) => {
  const c = env('client');
  c.navigate('preferences');
  const form = c.q('form[data-submit="save-preferences"]');
  c.q('[name="doNotContact"]', form).checked = true;
  c.submit(form);
  assert.equal(find(c, 'clients', 'client-1').doNotContact, true);
  assert.equal(
    c.state().visits.filter((v) => v.clientId === 'client-1' && v.status === 'scheduled').length,
    0,
    'Scheduled contact remains after opting out',
  );
  assert.equal(
    c
      .state()
      .tasks.filter(
        (t) => t.clientId === 'client-1' && t.status === 'open' && t.type === 'follow_up',
      ).length,
    0,
    'Proactive follow-up task remains open',
  );
  const r = env('rep', c.serialize());
  r.navigate('client-detail', { id: 'client-1' });
  assert.match(r.q('#main-content').textContent, /التواصل/);
});
test(
  'WF18',
  'قبول العرض واعتماد العقد ينتجان مشروعًا وفواتير قابلة للمتابعة مرة واحدة',
  ({ env }) => {
    const c = env('client'),
      id = acceptFixture(c);
    const before = clone(find(c, 'contracts', id));
    assert.equal(find(c, 'quotes', 'quote-1').status, 'accepted');
    assert.equal(find(c, 'opportunities', 'opp-1').stage, 'won');
    assert.equal(before.status, 'pending');
    assert.ok(
      before.itemsSnapshot?.length && before.scopeSnapshot,
      'Contract has no frozen item/scope snapshot',
    );
    c.navigate('contract-detail', { id });
    c.click('[data-action="sign-contract-modal"]');
    c.fill('signer', 'صاحب موافقة الاختبار');
    c.fill('confirmation', 'أوافق');
    c.fill('demoConsent', true);
    const form = c.q('#app-modal form');
    c.submit(form);
    c.submit(form);
    const contract = find(c, 'contracts', id),
      projects = c.state().projects.filter((p) => p.contractId === id),
      invoices = c.state().invoices.filter((i) => i.contractId === id);
    assert.equal(contract.status, 'signed');
    assert.equal(projects.length, 1, 'Signed contract has no unique followable project');
    assert.equal(contract.projectId, projects[0].id);
    assert.equal(projects[0].status, 'planning');
    assert.equal(projects[0].progress, 0);
    assert.equal(projects[0].deliverables.length, 0, 'Signing created fictitious completed work');
    assert.ok(projects[0].milestones.every((m) => m.status === 'pending'));
    assert.equal(invoices.length, contract.paymentPlan.length);
    assert.equal(
      Math.round(invoices.reduce((n, i) => n + i.total, 0) * 100),
      Math.round(contract.total * 100),
    );
    assert.equal(new Set(invoices.map((i) => i.paymentPlanId)).size, invoices.length);
    assert.ok(invoices.every((i) => contract.paymentPlan.some((p) => p.id === i.paymentPlanId)));
    const a = env('admin', c.serialize());
    a.navigate('project-detail', { id: contract.projectId });
    assert.ok(a.q('#main-content h1'));
    a.navigate('invoice-detail', { id: invoices[0].id });
    assert.ok(a.q('#main-content h1'));
  },
);
test('WF19', 'قبول عرض مسودة أو معرّف أجنبي لا يصنع عقدًا', ({ env }) => {
  const c = env('client'),
    before = c.state().contracts.length;
  c.invoke('accept-quote', { data: { quoteId: 'quote-3', acceptTerms: 'on' } });
  c.invoke('accept-quote', { data: { quoteId: 'missing-quote', acceptTerms: 'on' } });
  assert.equal(c.state().contracts.length, before);
  assert.equal(find(c, 'quotes', 'quote-3').status, 'draft');
});
test('WF20', 'فشل التخزين يرجع المعاملة دون نصف قيود جديدة', ({ env }) => {
  const c = env('client'),
    before = clone(c.state());
  c.navigate('quote-detail', { id: 'quote-1' });
  c.click('[data-action="accept-quote-modal"]');
  c.fill('acceptTerms', true);
  const native = c.w.Storage.prototype.setItem;
  c.w.Storage.prototype.setItem = () => {
    throw new Error('audit quota');
  };
  c.submit();
  c.w.Storage.prototype.setItem = native;
  assert.equal(find(c, 'quotes', 'quote-1').status, 'sent');
  assert.equal(c.state().contracts.length, before.contracts.length);
  assert.equal(c.state().messages.length, before.messages.length);
  assert.equal(c.q('#app-modal').open, true);
  assert.match(c.q('#toasts').textContent, /تعذر حفظ/);
});
test('WF21', 'مراجعة العميل الحالية تمنع إكمال مشروع من نموذج قديم', ({ env }) => {
  const a = env('admin');
  a.fixture((s) => {
    const p = s.projects.find((x) => x.id === 'project-1');
    p.milestones.forEach((m) => {
      m.status = 'done';
    });
    p.deliverables.forEach((d) => {
      d.status = 'approved';
      d.url = 'https://example.test/reviewed-delivery';
    });
  });
  a.navigate('project-detail', { id: 'project-1' });
  a.click('[data-action="edit-project"]');
  a.fill('status', 'completed');
  a.fill('progress', 100);
  a.fill('stage', 'launch');
  a.external((s) => {
    s.projects.find((p) => p.id === 'project-1').deliverables[0].status = 'changes_requested';
  });
  a.submit();
  assert.notEqual(
    persisted(a, 'projects', 'project-1').status,
    'completed',
    'New client revision was overwritten by old completion form',
  );
});

function discountRequest(envFactory) {
  const r = envFactory('rep');
  r.fixture((s) => {
    const q = clone(s.quotes.find((x) => x.id === 'quote-1'));
    q.id = 'audit-discount-quote';
    q.title = 'عرض دورة مراجعة الخصم';
    q.status = 'draft';
    q.validUntil = r.w.Elvorance.addDays(14);
    q.discount =
      Math.round(q.items.reduce((n, item) => n + item.qty * item.price, 0) * 0.3 * 100) / 100;
    q.total = q.items.reduce((n, item) => n + item.qty * item.price, 0) - q.discount;
    s.quotes.push(q);
  });
  r.navigate('quote-detail', { id: 'audit-discount-quote' });
  r.click('[data-action="send-quote"][data-id="audit-discount-quote"]');
  const request = r
    .state()
    .approvals.find((a) => a.quoteId === 'audit-discount-quote' && a.status === 'pending');
  assert.ok(request, 'High discount did not produce an actionable approval');
  assert.equal(find(r, 'quotes', 'audit-discount-quote').status, 'draft');
  return { r, approvalId: request.id, quoteId: 'audit-discount-quote' };
}
function approveDiscount(envFactory, serialized, approvalId) {
  const a = envFactory('admin', serialized);
  a.navigate('approvals');
  a.click(`[data-action="review-approval"][data-id="${approvalId}"]`);
  a.fill('decision', 'approved');
  a.fill('note', 'اعتماد خصم الاختبار بعد مراجعة النطاق والأسعار');
  a.submit();
  const decision = a.state().approvals.find((entry) => entry.id === approvalId);
  assert.equal(decision?.status, 'approved', 'Admin approval was not committed: ' + a.q('#toasts').textContent.trim());
  return a;
}
function approvedDiscount(envFactory) {
  const setup = discountRequest(envFactory);
  const a = approveDiscount(envFactory, setup.r.serialize(), setup.approvalId);
  assert.equal(
    find(a, 'quotes', setup.quoteId).status,
    'draft',
    'Admin decision sent draft without representative review',
  );
  return { ...setup, a };
}

test('WF22', 'دورة خصم ثم تعديل العميل ثم اعتماد جديد وإعادة إرسال تنتهي بعقد واحد', ({ env }) => {
  const setup = approvedDiscount(env),
    r = env('rep', setup.a.serialize());
  r.navigate('quote-detail', { id: setup.quoteId });
  r.click(`[data-action="send-quote"][data-id="${setup.quoteId}"]`);
  assert.equal(find(r, 'quotes', setup.quoteId).status, 'sent', 'First send reason: '+r.q('#toasts').textContent.trim());
  const c = env('client', r.serialize());
  c.navigate('quote-detail', { id: setup.quoteId });
  c.click('[data-action="revise-quote-modal"]');
  c.fill('reason', 'أرجو زيادة كمية الخدمة مع مراجعة شروط التنفيذ والدفعات');
  c.submit();
  assert.equal(find(c, 'quotes', setup.quoteId).status, 'revision_requested');
  const revision = env('rep', c.serialize());
  revision.navigate('quote-builder', { id: setup.quoteId });
  const qty = revision.q('[data-input="quote-qty"]');
  revision.input('[data-input="quote-qty"]', Number(qty.value) + 1);
  // Recalculate installments after the changed quantity before requesting fresh approval.
  revision.click('[data-action="quote-payment-suggest"]');
  revision.click('[data-action="save-send-quote"]');
  const draft = find(revision, 'quotes', setup.quoteId);
  assert.equal(
    draft.status,
    'draft',
    'Changed quote was not saved for fresh approval; UI: ' +
      revision.q('#toasts').textContent.trim(),
  );
  const approval = revision
    .state()
    .approvals.find(
      (a) => a.quoteId === setup.quoteId && a.status === 'pending' && a.id !== setup.approvalId,
    );
  assert.ok(approval, 'Revision has no new actionable approval');
  const approved = approveDiscount(env, revision.serialize(), approval.id),
    resend = env('rep', approved.serialize());
  resend.navigate('quote-detail', { id: setup.quoteId });
  resend.click(`[data-action="send-quote"][data-id="${setup.quoteId}"]`);
  assert.equal(find(resend, 'quotes', setup.quoteId).status, 'sent', 'Resend reason: '+resend.q('#toasts').textContent.trim());
  const final = env('client', resend.serialize()),
    contractId = acceptFixture(final, setup.quoteId);
  assert.equal(final.state().contracts.filter((item) => item.quoteId === setup.quoteId).length, 1);
  assert.equal(
    find(final, 'contracts', contractId).total,
    find(final, 'quotes', setup.quoteId).total,
  );
});
test('WF23', 'تغيير النطاق مع المجموع نفسه يبطل اعتماد الخصم القديم', ({ env }) => {
  const setup = approvedDiscount(env),
    r = env('rep', setup.a.serialize());
  r.navigate('quote-builder', { id: setup.quoteId });
  const terms = r.q('[name="terms"]');
  r.input(
    '[name="terms"]',
    terms.value + '\nيشمل التعديل إضافة التزام دعم جديد لم يكن ضمن الاعتماد السابق.',
  );
  r.click('[data-action="save-send-quote"]');
  assert.equal(
    find(r, 'quotes', setup.quoteId).status,
    'draft',
    'Approval matched amount/subtotal while scope changed',
  );
  assert.ok(
    r
      .state()
      .approvals.some(
        (a) => a.quoteId === setup.quoteId && a.status === 'pending' && a.id !== setup.approvalId,
      ),
  );
});
test('WF24', 'نقل عرض إلى عميل آخر لا ينقل موافقة الخصم معه', ({ env }) => {
  const setup = approvedDiscount(env),
    r = env('rep', setup.a.serialize());
  r.navigate('quote-builder', { id: setup.quoteId });
  r.input('[name="clientId"]', 'client-2', 'change');
  r.click('[data-action="save-send-quote"]');
  const q = find(r, 'quotes', setup.quoteId);
  assert.equal(q.clientId, 'client-2');
  assert.equal(q.status, 'draft', 'Approval from different customer authorized sending');
  assert.ok(
    r
      .state()
      .approvals.some(
        (a) => a.quoteId === setup.quoteId && a.clientId === 'client-2' && a.status === 'pending',
      ),
  );
});
test('WF25', 'رفض اعتماد الخصم في الحالة الأحدث يمنع إرسال نموذج قديم', ({ env }) => {
  const setup = approvedDiscount(env),
    r = env('rep', setup.a.serialize());
  r.navigate('quote-builder', { id: setup.quoteId });
  r.external((s) => {
    const approval = s.approvals.find((a) => a.id === setup.approvalId);
    approval.status = 'rejected';
    approval.decisionNote = 'قرار أحدث ألغي الاعتماد السابق';
  });
  r.click('[data-action="save-send-quote"]');
  assert.notEqual(
    persisted(r, 'quotes', setup.quoteId).status,
    'sent',
    'Builder reused stale approval during mutation',
  );
});
test('WF26', 'انتهاء صلاحية العرض بعد فتح الموافقة يمنع القبول', ({ env }) => {
  const c = env('client');
  c.navigate('quote-detail', { id: 'quote-1' });
  c.click('[data-action="accept-quote-modal"]');
  c.fill('acceptTerms', true);
  const count = c.state().contracts.length;
  c.external((s) => {
    s.quotes.find((q) => q.id === 'quote-1').validUntil = c.w.Elvorance.addDays(-1);
  });
  c.submit();
  assert.equal(persisted(c, 'quotes', 'quote-1').status, 'sent');
  assert.equal(c.stored().contracts.length, count);
});
test('WF27', 'تغيير الكتالوج لا يغيّر النطاق المجمد في عقد مقبول', ({ env }) => {
  const r = env('rep');
  r.fixture((s) => {
    const q = s.quotes.find((q) => q.id === 'quote-1');
    q.status = 'draft';
    q.validUntil = r.w.Elvorance.addDays(14);
  });
  r.navigate('quote-detail', { id: 'quote-1' });
  r.click('[data-action="send-quote"][data-id="quote-1"]');
  const c = env('client', r.serialize()),
    id = acceptFixture(c);
  const before = clone(find(c, 'contracts', id));
  assert.ok(
    before.itemsSnapshot?.length && before.scopeSnapshot,
    'Contract scope snapshot missing',
  );
  c.fixture((s) => {
    s.catalog.forEach((service) => {
      service.price = 999999;
      service.deliverables = ['تسليم مضاف بعد الاتفاق يجب ألا يظهر بالعقد'];
      service.title = 'عنوان معدل بعد القبول';
    });
  });
  c.navigate('contract-detail', { id });
  assert.deepEqual(clone(find(c, 'contracts', id).itemsSnapshot), before.itemsSnapshot);
  assert.deepEqual(clone(find(c, 'contracts', id).scopeSnapshot), before.scopeSnapshot);
  assert.ok(!c.q('#main-content').textContent.includes('تسليم مضاف بعد الاتفاق'));
  assert.ok(!c.q('#main-content').textContent.includes('عنوان معدل بعد القبول'));
});
test('WF28', 'طلب خدمة العميل يصل لفرصة المندوب ثم عرض مرتبط قابل للقبول', ({ env }) => {
  const c = env('client');
  c.navigate('request-service', { id: 'svc-web' });
  const form = c.q('form[data-submit="submit-service-request"]');
  const set = (name, value) => {
    const node = c.q(`[name="${name}"]`, form);
    node.value = String(value);
  };
  set('title', 'طلب موقع ضمن اختبار تكامل مستقل');
  set('brief', 'نحتاج موقعًا تعريفيًا واضحًا مع الخدمات وطلب التواصل وربط المتابعة ضمن الفريق.');
  set('budget', 2500);
  set('deadline', c.w.Elvorance.addDays(30));
  c.submit(form);
  const opportunity = c
    .state()
    .opportunities.find((o) => o.title === 'طلب موقع ضمن اختبار تكامل مستقل');
  assert.ok(opportunity);
  assert.equal(opportunity.stage, 'new');
  assert.equal(opportunity.clientId, 'client-1');
  const r = env('rep', c.serialize());
  r.navigate('opportunity-detail', { id: opportunity.id });
  r.click('[data-action="quote-new"]');
  r.flush();
  const qForm = r.q('#rep-quote-form');
  if (!qForm.querySelector('[data-input="quote-qty"]'))
    r.click('[data-action="quote-add"][data-id="svc-web"]');
  if (r.q('[name="title"]').value.trim().length < 3)
    r.input('[name="title"]', 'عرض الموقع لطلب العميل');
  if (r.q('[name="terms"]').value.trim().length < 10)
    r.input(
      '[name="terms"]',
      'تنفيذ موقع تعريفي ضمن البنود المذكورة مع مراجعة العميل قبل التسليم.',
    );
  r.click('[data-action="save-send-quote"]');
  const quote = r.state().quotes.find((q) => q.opportunityId === opportunity.id);
  assert.ok(quote, 'Quote lost source opportunity association');
  assert.equal(quote.status, 'sent');
  const final = env('client', r.serialize());
  acceptFixture(final, quote.id);
  assert.equal(find(final, 'opportunities', opportunity.id).stage, 'won');
});
test('WF29', 'نقل إسناد مهمة يمنع المندوب السابق من تعديلها من شاشة قديمة', ({ env }) => {
  const r = env('rep'),
    task = r.state().tasks.find((t) => t.repId === 'rep-1' && t.status === 'open');
  assert.ok(task);
  r.navigate('tasks');
  r.external((s) => {
    s.tasks.find((t) => t.id === task.id).repId = 'rep-2';
  });
  r.click(`[data-action="task-toggle"][data-id="${task.id}"]`);
  assert.equal(persisted(r, 'tasks', task.id).repId, 'rep-2');
  assert.equal(
    persisted(r, 'tasks', task.id).status,
    'open',
    'Old assignee mutated reassigned task',
  );
});
test('WF30', 'تحديث نافذة أخرى لا يمسح نموذجًا قيد التحرير ويحفظ السجلين', ({ env }) => {
  const c = env('client');
  c.navigate('profile');
  const form = c.q('form[data-submit="save-profile"]');
  const name = c.q('[name="name"]', form);
  name.value = 'اسم العميل أثناء التحرير';
  name.dispatchEvent(new c.w.Event('input', { bubbles: true }));
  c.external((s) => {
    s.tasks[0].notes = 'ملاحظة أحدث من نافذة أخرى';
  }, true);
  assert.equal(
    c.q('form[data-submit="save-profile"] [name="name"]').value,
    'اسم العميل أثناء التحرير',
    'Storage refresh wiped dirty form',
  );
  c.submit('form[data-submit="save-profile"]');
  assert.equal(persisted(c, 'clients', 'client-1').name, 'اسم العميل أثناء التحرير');
  assert.equal(c.stored().tasks[0].notes, 'ملاحظة أحدث من نافذة أخرى');
});
test('WF31', 'تكرار قبول النموذج لا ينشئ عقدًا أو إشعارًا مكررًا', ({ env }) => {
  const c = env('client');
  c.navigate('quote-detail', { id: 'quote-1' });
  c.click('[data-action="accept-quote-modal"]');
  c.fill('acceptTerms', true);
  const form = c.q('#app-modal form');
  c.submit(form);
  const contracts = c.state().contracts.length,
    messages = c.state().messages.length,
    notices = c.state().notifications.length;
  c.submit(form);
  assert.equal(c.state().contracts.length, contracts);
  assert.equal(c.state().messages.length, messages);
  assert.equal(c.state().notifications.length, notices);
});
test('WF32', 'طلب موافقة خصم قديم لا يُعتمد بعد تغير النطاق دون تغير المبلغ', ({ env }) => {
  const setup = discountRequest(env),
    a = env('admin', setup.r.serialize());
  a.navigate('approvals');
  a.click(`[data-action="review-approval"][data-id="${setup.approvalId}"]`);
  a.fill('decision', 'approved');
  a.fill('note', 'اعتماد يجب رفضه لأن النطاق تغير بعد فتح المراجعة');
  a.external((s) => {
    const q = s.quotes.find((q) => q.id === setup.quoteId);
    q.terms += '\nالتزام إضافي خارج الموافقة الأصلية';
    q.baseTerms = q.terms;
  });
  a.submit();
  assert.equal(
    persisted(a, 'approvals', setup.approvalId).status,
    'pending',
    'Stale scope approval accepted solely by matching amount/subtotal',
  );
});
test('WF33', 'حذف المندوب بعد فتح إسناد مهمة لا ينشئ مهمة يتيمة', ({ env }) => {
  const a = env('admin');
  a.navigate('tasks');
  a.click('[data-action="new-task"]');
  a.fill('title', 'مهمة يجب رفضها بعد حذف المسؤول');
  a.fill('repId', 'rep-2');
  a.fill('dueDate', a.w.Elvorance.addDays(2));
  a.external((s) => {
    s.reps = s.reps.filter((r) => r.id !== 'rep-2');
  });
  a.submit();
  assert.ok(
    !a.stored().tasks.some((t) => t.title === 'مهمة يجب رفضها بعد حذف المسؤول'),
    'Latest missing assignee produced an orphan task',
  );
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
test(
  'WF34',
  'المشروع الجديد يصل من التخطيط إلى تسليم حقيقي واعتماد العميل ثم الإنجاز',
  async ({ env }) => {
    const c = env('client'),
      contractId = acceptFixture(c);
    c.navigate('contract-detail', { id: contractId });
    c.click('[data-action="sign-contract-modal"]');
    c.fill('signer', 'صاحب مشروع التدقيق');
    c.fill('confirmation', 'أوافق');
    c.fill('demoConsent', true);
    c.submit();
    const projectId = find(c, 'contracts', contractId).projectId;
    assert.ok(projectId);
    const a = env('admin', c.serialize());
    a.navigate('project-detail', { id: projectId });
    a.click('[data-action="new-deliverable"]');
    a.fill('title', 'مستند التسليم الفعلي للاختبار');
    a.fill(
      'content',
      'نطاق التسليم الفعلي: صفحة تعريفية وخدمات واضحة ونموذج تواصل، مع اختبار الاستجابة ومراجعة النصوص العربية قبل الموافقة.',
    );
    const deliveryForm = a.q('#app-modal form');
    a.submit(deliveryForm);
    await settle();
    a.submit(deliveryForm);
    await settle();
    const project = find(a, 'projects', projectId);
    assert.equal(project.deliverables.length, 1, 'Repeated submission duplicated deliverable');
    const d = project.deliverables[0];
    assert.equal(d.status, 'pending');
    const review = env('client', a.serialize());
    review.navigate('deliverable-detail', { id: projectId, deliverable: d.id });
    assert.match(review.q('#main-content').textContent, /نطاق التسليم الفعلي/);
    review.click('[data-action="approve-deliverable"]');
    review.click('[data-action="confirm-action"]');
    const reviewed = find(review, 'projects', projectId);
    assert.equal(reviewed.deliverables[0].status, 'approved');
    assert.ok(reviewed.milestones.every((m) => m.status === 'pending'));
    assert.ok(reviewed.progress < 100);
    const finish = env('admin', review.serialize());
    for (const milestone of clone(find(finish, 'projects', projectId).milestones)) {
      finish.navigate('project-detail', { id: projectId });
      finish.click(`[data-action="edit-milestone"][data-milestone="${milestone.id}"]`);
      finish.fill('status', 'done');
      finish.fill('date', finish.w.Elvorance.today());
      finish.submit();
    }
    assert.equal(find(finish, 'projects', projectId).status, 'completed');
    assert.equal(find(finish, 'projects', projectId).progress, 100);
  },
);
test('WF35', 'رد الإدارة دون مادة جديدة لا ينتج إصدار تسليم وهميًا', async ({ env }) => {
  const a = env('admin'),
    original = clone(find(a, 'projects', 'project-1').deliverables[0]);
  a.navigate('project-detail', { id: 'project-1' });
  a.click(`[data-action="respond-deliverable"][data-deliverable="${original.id}"]`);
  a.fill('response', 'رد فقط بلا محتوى تسليم جديد للاختبار');
  a.fill('resolution', 'resubmit');
  a.submit();
  await settle();
  const d = find(a, 'projects', 'project-1').deliverables.find((d) => d.id === original.id);
  assert.equal(d.version, original.version);
  assert.equal((d.history || []).length, (original.history || []).length);
});
test('WF36', 'التعديل الفعلي يحفظ الإصدار السابق ويظهر المحتوى الجديد للعميل', async ({ env }) => {
  const a = env('admin');
  a.fixture((s) => {
    const d = s.projects.find((p) => p.id === 'project-1').deliverables[0];
    d.content = 'محتوى الإصدار الأول من مستند الاختبار قبل مراجعة العميل.';
    d.status = 'changes_requested';
  });
  const original = clone(find(a, 'projects', 'project-1').deliverables[0]);
  a.navigate('project-detail', { id: 'project-1' });
  a.click(`[data-action="respond-deliverable"][data-deliverable="${original.id}"]`);
  a.fill('response', 'عولجت الملاحظات وأضيف نطاق تفصيلي واضح');
  a.fill('resolution', 'resubmit');
  a.fill(
    'content',
    'محتوى الإصدار المعدل: قائمة الخدمات الجديدة وتوضيح آلية التواصل وخطوات المراجعة والتسليم الفعلي للعميل.',
  );
  a.submit();
  await settle();
  const d = find(a, 'projects', 'project-1').deliverables.find((d) => d.id === original.id);
  assert.equal(
    Number(String(d.version).replace(/^v/i, '')),
    Number(String(original.version).replace(/^v/i, '')) + 1,
  );
  assert.equal(d.status, 'pending');
  assert.equal(d.history.at(-1).content, original.content);
  const c = env('client', a.serialize());
  c.navigate('deliverable-detail', { id: 'project-1', deliverable: d.id });
  assert.match(c.q('#main-content').textContent, /محتوى الإصدار المعدل/);
});
test('WF37', 'مرجع العميل لا يمنع إنهاء تسليمات الفريق المعتمدة', ({ env }) => {
  const a = env('admin');
  a.fixture((s) => {
    const p = s.projects.find((p) => p.id === 'project-1');
    p.milestones.forEach((m) => {
      m.status = 'done';
    });
    p.deliverables = [
      {
        id: 'audit-team-delivery',
        title: 'تسليم الفريق',
        type: 'document',
        status: 'approved',
        version: 1,
        content: 'مستند تسليم فعلي معتمد يتضمن نطاق العمل المنجز وخطوات مراجعة النتيجة.',
      },
      {
        id: 'audit-client-reference',
        title: 'مرجع العميل',
        type: 'client_attachment',
        status: 'pending',
        version: 1,
        fileData: 'data:application/pdf;base64,JVBERi0xLjQKJSVFT0Y=',
      },
    ];
  });
  a.navigate('project-detail', { id: 'project-1' });
  a.click('[data-action="edit-project"]');
  a.fill('status', 'completed');
  a.fill('progress', 100);
  a.fill('stage', 'launch');
  a.submit();
  assert.equal(
    find(a, 'projects', 'project-1').status,
    'completed',
    'Unapprovable client reference blocked completion forever',
  );
  assert.equal(
    find(a, 'projects', 'project-1').deliverables.find((d) => d.id === 'audit-client-reference')
      .status,
    'pending',
    'Completion silently approved client reference',
  );
});
test('WF38', 'نسخة تسليم أحدث لا تُعتمد من مربع تأكيد قديم', ({ env }) => {
  const c = env('client');
  c.navigate('deliverable-detail', { id: 'project-1', deliverable: 'deliverable-1' });
  c.click('[data-action="approve-deliverable"]');
  c.external((s) => {
    const d = s.projects
      .find((p) => p.id === 'project-1')
      .deliverables.find((d) => d.id === 'deliverable-1');
    d.version = Number(String(d.version).replace(/^v/i, '')) + 1;
    d.content = 'نسخة أحدث تتطلب قراءة جديدة قبل الاعتماد حتى لو بقي عنوان المشروع نفسه.';
  });
  c.click('[data-action="confirm-action"]');
  assert.equal(
    persisted(c, 'projects', 'project-1').deliverables.find((d) => d.id === 'deliverable-1').status,
    'pending',
  );
});
test('WF39', 'دفعتان من العميل والإدارة تتراكمان مرة واحدة في نفس الفاتورة والخطة', ({ env }) => {
  const c = env('client');
  c.navigate('invoice-detail', { id: 'invoice-2' });
  c.click('[data-action="payment-modal"]');
  c.fill('amount', 125);
  c.fill('demoPayment', true);
  const form = c.q('#app-modal form');
  c.submit(form);
  c.submit(form);
  assert.equal(find(c, 'invoices', 'invoice-2').paid, 125);
  const a = env('admin', c.serialize());
  a.submit(openPayment(a, 'invoice-2', 300));
  const invoice = find(a, 'invoices', 'invoice-2'),
    contract = find(a, 'contracts', invoice.contractId),
    plan = contract.paymentPlan.find((p) => p.id === invoice.paymentPlanId);
  assert.equal(invoice.paid, 425);
  assert.equal(invoice.payments.length, 2);
  assert.equal(contract.paid, 980 + 425);
  assert.equal(plan.paid, 425);
  assert.equal(plan.status, 'partial');
});
test('WF40', 'تعافي عقد معتمد قديم يصنع السجلات الناقصة دون تكرار أو فقد دفعة', ({ env }) => {
  const c = env('client');
  c.fixture((s) =>
    s.contracts.push({
      id: 'audit-legacy-contract',
      clientId: 'client-1',
      quoteId: '',
      projectId: null,
      title: 'عقد قديم لتدقيق التعافي',
      total: 500,
      paid: 200,
      status: 'active',
      signer: 'اعتماد سابق',
      signedAt: '2025-01-01T10:00:00.000Z',
      terms: 'نطاق قديم ثابت لا يستنتج أعمالًا منجزة.',
      itemsSnapshot: [{ serviceId: 'svc-web', title: 'خدمة قديمة ثابتة', qty: 1, price: 500 }],
      scopeSnapshot: [
        { serviceId: 'svc-web', title: 'خدمة قديمة ثابتة', deliverables: ['مستند النطاق القديم'] },
      ],
      paymentPlan: [
        {
          label: 'دفعة العقد',
          amount: 500,
          paid: 200,
          status: 'partial',
          due: c.w.Elvorance.addDays(10),
        },
      ],
    }),
  );
  c.navigate('contract-detail', { id: 'audit-legacy-contract' });
  c.click('[data-action="provision-contract"]');
  c.invoke('provision-contract', { id: 'audit-legacy-contract' });
  const contract = find(c, 'contracts', 'audit-legacy-contract'),
    projects = c.state().projects.filter((p) => p.contractId === contract.id),
    invoices = c.state().invoices.filter((i) => i.contractId === contract.id);
  assert.equal(projects.length, 1);
  assert.equal(invoices.length, 1);
  assert.equal(projects[0].status, 'planning');
  assert.equal(contract.paid, 200);
  assert.equal(invoices[0].paid, 200);
  assert.equal(contract.signedAt, '2025-01-01T10:00:00.000Z');
});

const transitionGroups = [
  [/quote|discount|approval/, 'العرض/الخصم/قرار الموافقة'],
  [/contract/, 'العقد وتثبيت النطاق وخطة التنفيذ'],
  [/payment|invoice/, 'الفاتورة والتحصيل وخطة الدفع'],
  [/deliverable|project|milestone|attach/, 'المشروع والتسليم والمراحل والمرفقات'],
  [/visit|outcome|proof|gps/, 'الزيارة وتوثيق الوصول والنتيجة والمتابعة'],
  [/opportunity|stage/, 'الفرصة ومراحل البيع والحسم'],
  [/task/, 'المهمة والإسناد والإنجاز'],
  [/client|profile|preferences|contact/, 'ملف العميل/المندوب وتفضيلات التواصل'],
  [/zone|member/, 'الفريق وتوزيع المناطق والأهداف'],
  [/message|ticket|conversation/, 'المحادثة وطلب المساعدة'],
  [/service/, 'الخدمة والطلب التجاري'],
  [/filter|search|territory-day/, 'فلترة عرض محلية دون تغيير سجل الأعمال'],
  [/settings/, 'إعدادات مساحة العمل'],
  [/export|print|download/, 'تصدير أو طباعة محلية'],
];
function category(name) {
  return transitionGroups.find(([pattern]) => pattern.test(name))?.[1] || 'واجهة محلية/تفضيل عرض';
}
const stateTransitions = {
  rep: {
    'client-search': 'قائمة العملاء → إظهار المطابق للبحث؛ دون تعديل السجلات',
    'save-client': 'عميل جديد/موجود → ملف محفوظ ضمن ملكية المندوب ومنطقته',
    'territory-day': 'يوم المسار المعروض → يوم مختار؛ دون تغيير الموعد الأصلي',
    'schedule-visit': 'عميل قابل للتواصل → نموذج حجز موعد',
    'save-schedule': 'بيانات موعد صحيحة → زيارة scheduled مرتبطة بعميل ومندوب',
    'cancel-visit': 'زيارة scheduled → cancelled مع عدم إلغاء زيارة منتهية',
    'proof-mode': 'وسيلة التوثيق المحلية → GPS مطلوب بإذن أو سبب يدوي',
    'request-gps': 'توثيق غير موجود → طلب إذن/إحداثيات أو خطأ؛ لم ينفذ GPS في هذا التدقيق',
    'start-visit': 'لا زيارة جارية + وصول موثق → زيارة active واحدة',
    'save-visit-notes': 'زيارة active → ملاحظات محفوظة دون إنهاء الزيارة',
    'save-visit-draft': 'زيارة active → احتياج ومقترحات وملاحظات محفوظة في workingDraft',
    'link-existing-quote': 'زيارة جارية → اختيار عرض سابق للعميل نفسه',
    'save-link-quote': 'زيارة وعرض صالحان → ربط المرجعين دون تغيير قبول العميل',
    'commit-visit-quote': 'مسودة عرض مرتبطة بالزيارة → سجل draft ثم ملخص الختام',
    'review-quote': 'عدة عروض مرتبطة → اختيار العرض الأساسي في ملخص الزيارة',
    'review-followup': 'خيار المتابعة → إظهار الموعد وجعله مطلوبًا عند طلب مهمة',
    'finish-review': 'ملخص عرض مراجع → إنهاء زيارة بنسخة ثابتة ومتابعة اختيارية',
    'exception-outcome': 'ملخص العروض → مسار نتيجة استثنائية للزيارة',
    'back-to-summary': 'نتيجة استثنائية غير محفوظة → ملخص العروض المرتبطة',
    'print-agreement': 'agreementSnapshot محفوظ → مستند ختام يميز المقترح عن القبول',
    'choose-outcome': 'زيارة active → مسودة نتيجة الزيارة',
    'outcome-back': 'خطوة مراجعة النتيجة → خطوة تحرير سابقة',
    'prepare-outcome': 'نتيجة وملاحظات وخطوة متابعة صحيحة → مراجعة نهائية',
    'complete-visit': 'زيارة active → completed؛ متابعة/فرصة/طلب إداري حسب النتيجة',
    'task-new': 'سياق عميل/فريق → نموذج مهمة',
    'save-task': 'نموذج مهمة → مهمة open ضمن المندوب الحالي',
    'task-toggle': 'مهمة مملوكة open/done → الحالة المقابلة؛ لا تعديل بعد نقل الإسناد',
    'opportunity-new': 'عميل وخدمة → نموذج فرصة',
    'save-opportunity': 'احتياج موثق → فرصة new مرتبطة بالعميل والخدمة',
    'opportunity-stage': 'مرحلة فرصة → مرحلة مسموحة؛ won يحتاج عرضًا مقبولًا',
    'lose-opportunity': 'فرصة غير مكتسبة + سبب → lost',
    'quote-new': 'سياق عميل/زيارة/فرصة → مسودة محرر عرض',
    'quote-field': 'قيمة في مسودة المحرر → قيمة محدثة؛ حفظ محلي للمسودة بحسب التنفيذ',
    'quote-qty': 'كمية بند → كمية ومجاميع معاد حسابها',
    'quote-discount': 'قيمة خصم → إجمالي ونسبة خصم معاد حسابهما',
    'quote-add': 'خدمة من الكتالوج → بند في مسودة العرض',
    'quote-remove': 'بند مسودة → حذف من المحرر وإعادة حساب المجاميع',
    'quote-rebase': 'تعارض عرض مراجع → إسناد مدخلات المسودة إلى النسخة الأحدث دون إرسالها تلقائيًا',
    'quote-discard': 'مسودة متعارضة → استعادة النسخة المحفوظة بعد تأكيد التخلص من مدخلاتها',
    'save-quote': 'مسودة محرر صحيحة → عرض draft محفوظ',
    'save-send-quote': 'عرض قابل للتحرير → sent أو draft مع طلب اعتماد مطابق',
    'send-quote': 'draft/revision_requested → sent عند صحة العميل والصلاحية والاعتماد',
    'duplicate-quote': 'عرض موجود → مسودة مستقلة بمعرّف جديد',
    'print-quote': 'عرض موجود → مستند محلي للطباعة',
    'open-conversation': 'عميل موجود → محادثته المشتركة',
    'send-message': 'نص وعميل قابل للتواصل → رسالة محلية مشتركة',
    'copy-contact': 'بيانات اتصال → طلب نسخ؛ ليس إرسالًا خارجيًا',
    'contact-preference': 'عميل → نموذج تفضيل التواصل',
    'save-contact-preference': 'تفضيلات عميل → سجل مشترك وتطبيق وقف التواصل',
    'save-profile': 'بيانات مندوب صحيحة → ملف محفوظ',
    'export-day': 'زيارات اليوم → تنزيل بيانات محلي',
  },
  client: {
    'open-messages': 'الشاشة الحالية → المحادثة',
    'filter-services': 'قائمة خدمات → العناصر المطابقة؛ لا تغيير بيانات',
    'submit-service-request': 'احتياج صحيح → فرصة new ورسالة/إشعار للفريق',
    'accept-quote-modal': 'عرض sent ضمن العميل → نموذج مراجعة وقبول',
    'revise-quote-modal': 'عرض sent → نموذج سبب طلب التعديل',
    'reject-quote-modal': 'عرض sent → نموذج سبب الرفض',
    'accept-quote': 'sent غير منتهٍ ومراجع → accepted وعقد pending وفرصة won',
    'revise-quote': 'sent → revision_requested مع سبب ورغبات العميل',
    'reject-quote': 'sent → rejected مع سبب محفوظ',
    'sign-contract-modal': 'عقد pending → مراجعة موافقة تجريبية',
    'sign-contract': 'pending مراجع → signed ومشروع planning وفواتير خطة الدفع مرة واحدة',
    'provision-contract':
      'عقد قديم signed/active → استكمال مشروع التخطيط وفواتير الدفعات الناقصة دون تكرار',
    'approve-deliverable': 'تسليم فعلي معلّق → approved؛ دون اختلاق إنجاز مراحل',
    'revise-deliverable-modal': 'تسليم قابل للمراجعة → نموذج ملاحظات',
    'revise-deliverable': 'تسليم قيد المراجعة → changes_requested مع الملاحظات',
    'attach-project-modal': 'مشروع مملوك → نموذج مرفق محلي',
    'attach-project': 'ملف مسموح وحجمه محدود → مرفق عميل في المشروع',
    'download-attachment': 'مرفق محفوظ → تنزيل الملف المحلي نفسه',
    'payment-modal': 'فاتورة لها رصيد → نموذج قيد دفع تجريبي',
    'record-payment': 'قيد فريد صالح → زيادة paid ومزامنة العقد وخطة الدفع',
    'create-ticket': 'طلب دعم صحيح → تذكرة مشتركة open',
    'reply-ticket': 'تذكرة مملوكة → رد محفوظ وإعادة فتح المحلولة عند الرد',
    'send-message': 'نص العميل → رسالة محلية للفريق',
    'save-profile': 'بيانات نشاط صحيحة → تحديث ملف العميل المشترك',
    'save-preferences': 'احتياج وتفضيلات → تحديث الملف؛ إلغاء المتابعة الاستباقية عند وقف التواصل',
    'print-contract': 'عقد مملوك → مستند يعكس النطاق المثبت',
    'print-invoice': 'فاتورة مملوكة → مستند بالقيمة والمحصّل والمتبقي',
    'print-deliverable': 'تسليم مملوك → مستند مراجعة محلي',
  },
  admin: {
    'new-member': 'الفريق → نموذج إضافة مندوب',
    'edit-member': 'مندوب موجود → نموذج تحرير',
    'save-member': 'ملف مندوب → بيانات وأهداف مع مزامنة المناطق من الجهتين',
    'new-zone': 'المناطق → نموذج منطقة',
    'edit-zone': 'منطقة موجودة → نموذج إعداداتها',
    'save-zone': 'نموذج منطقة → اسم وهدف وقدرة محفوظة',
    'assign-zone': 'منطقة → نموذج توزيع عدة مندوبين',
    'save-zone-team': 'اختيارات المندوبين → zones.repIds وreps.zoneIds متزامنة',
    'new-client': 'العملاء → نموذج إنشاء',
    'edit-client': 'عميل موجود → نموذج تحرير',
    'save-client': 'ملف عميل صحيح → بيانات/احتياج/إسناد وتفضيلات مشتركة',
    'contact-client': 'عميل موجود → عرض بيانات اتصاله واحترام تفضيل الوقف',
    'new-opportunity': 'المبيعات → نموذج فرصة',
    'edit-opportunity': 'فرصة موجودة → نموذج تعديل',
    'save-opportunity': 'نموذج فرصة → حفظ مع حماية الاتفاق المقبول وشرط won',
    'change-stage': 'مرحلة فرصة → مرحلة مسموحة بعد تأكيد',
    'lose-opportunity': 'فرصة غير مكتسبة + سبب → lost',
    'view-quote': 'عرض موجود → تفاصيل العرض المرتبط',
    'new-task': 'الفريق/العميل → نموذج إسناد',
    'edit-task': 'مهمة موجودة → نموذج تعديل',
    'save-task': 'بيانات صحيحة ومراجع موجودة → مهمة مسندة وإشعار للمندوب',
    'toggle-task': 'مهمة قابلة للتغيير → open/done مع احترام الإلغاء ووقف التواصل',
    'review-approval': 'طلب إداري → تفاصيله ونموذج القرار إذا كان pending',
    'decide-approval': 'pending مطابق للحالة الأحدث → approved/rejected بسبب؛ دون إرسال العرض',
    'edit-project': 'مشروع موجود → نموذج الحالة والمرحلة والتقدم',
    'save-project': 'مشروع → حالة وتقدم متسقان مع مراحل وتسليمات فعلية معتمدة',
    'edit-milestone': 'مرحلة موجودة → نموذج تحديث',
    'save-milestone': 'مرحلة → pending/active/done مع ترتيب العمل وإعادة حساب التقدم',
    'respond-deliverable': 'تسليم موجود → نموذج رد ومحتوى إصدار عند الحاجة',
    'save-deliverable-response': 'مراجعة عميل → رد أو إصدار بمحتوى فعلي؛ لا رفع رقم إصدار وحده',
    'new-deliverable': 'مشروع غير مكتمل → نموذج تسليم فريق بمحتوى أو ملف أو رابط',
    'save-deliverable': 'مادة تسليم فعلية → نسخة pending ظاهرة للعميل مرة واحدة',
    'record-payment': 'فاتورة غير مسددة → نموذج قيد بمعرّف طلب فريد',
    'save-payment': 'قيد فريد صالح → زيادة paid دون فقد التاريخ أو تجاوز آخر رصيد',
    'print-invoice': 'فاتورة → مستند محلي',
    'reply-ticket': 'تذكرة → رد إدارة وحالة متابعة مشتركة',
    'open-conversation': 'عميل → محادثة مشتركة',
    'send-message': 'عميل قابل للتواصل ونص → رسالة إدارة محلية',
    'export-analytics': 'نتائج الفلاتر الحالية → CSV محلي',
    'export-invoices': 'فواتير الفلتر → CSV محلي',
    'save-settings': 'اسم شركة ومدينة صحيحان → إعدادات مشتركة',
    filter: 'اختيار فلتر → إعادة عرض دون تغيير سجل الأعمال',
    'search-records': 'نص بحث → إظهار المطابق دون فقد التركيز',
  },
};
async function run() {
  // Enumerate every current handler, including ones outside this focused execution scope.
  for (const role of ['rep', 'client', 'admin']) {
    const e = environment(role);
    e.close();
  }
  for (const entry of tests) {
    if (
      process.env.ELVORANCE_AUDIT_FILTER &&
      !new RegExp(process.env.ELVORANCE_AUDIT_FILTER).test(entry.id)
    )
      continue;
    currentTest = entry.id;
    const environments = [];
    const started = Date.now();
    const context = {
      env(role, state) {
        const e = environment(role, state);
        environments.push(e);
        return e;
      },
    };
    try {
      await entry.fn(context);
      // Rejections should use the explicit business guard and a visible message.
      // Do not disguise a TypeError/other mutation failure as a successful refusal.
      const unexpected = environments.flatMap((e) => e.errors);
      assert.deepEqual(unexpected, [], 'Unhandled runtime/render/mutation errors');
      results.push({
        id: entry.id,
        title: entry.title,
        status: 'passed',
        ms: Date.now() - started,
      });
    } catch (error) {
      results.push({
        id: entry.id,
        title: entry.title,
        status: 'failed',
        error: error.message,
        ms: Date.now() - started,
      });
    } finally {
      environments.forEach((e) => e.close());
    }
  }
  const handlers = Object.entries(inventories).flatMap(([role, entries]) =>
    Object.keys(entries).map((action) => ({
      app: role,
      action,
      category: category(action),
      transition:
        stateTransitions[role]?.[action] ||
        'معالج أضيف بعد الحصر التفصيلي؛ يرجع إلى المصدر ولا يُفترض تغطيته',
      executed_by: [...(coverage[`${role}:${action}`] || [])].filter(Boolean),
    })),
  );
  const corePart =
    sources['src/shared/core.js'].split('const coreActions =')[1]?.split('function dispatch')[0] ||
    '';
  const coreNames = [...corePart.matchAll(/['"]([\w-]+)['"]\s*:/g)]
    .map((m) => m[1])
    .filter((name, i, all) => all.indexOf(name) === i);
  const baselineResults = [
    'rep-flows-results.json',
    'client-flows-results.json',
    'admin-results.json',
    'route-integrity-results.json',
  ].map((file) => {
    const location = path.join(__dirname, file);
    if (!fs.existsSync(location)) return { file, available: false };
    const data = JSON.parse(fs.readFileSync(location, 'utf8')),
      rows = data.checks || data.results || [];
    return {
      file,
      available: true,
      passed: data.passed ?? rows.filter((r) => r.status === 'passed').length,
      failed: data.failed ?? rows.filter((r) => r.status === 'failed').length,
      total: data.checked_routes ?? data.total ?? rows.length,
    };
  });
  const summary = {
    suite: 'Focused Elvorance cross-app workflow and state-transition audit',
    generated_at: new Date().toISOString(),
    scope:
      'Actual modules in JSDOM; delegated forms/buttons plus explicit invalid-ID handler calls; latest-storage interleavings simulate stale forms. Not exhaustive algorithm, browser, geolocation, legal-signature or payment-provider verification.',
    source_hashes: Object.fromEntries(
      files.map((file) => [file, crypto.createHash('sha256').update(sources[file]).digest('hex')]),
    ),
    baseline:
      'Before fixes: npm test passed 48 business-flow cases and 63 route states; that baseline did not exercise the failures targeted here.',
    latest_existing_suite_artifacts: baselineResults,
    passed: results.filter((r) => r.status === 'passed').length,
    failed: results.filter((r) => r.status === 'failed').length,
    total: results.length,
    handler_inventory_count: handlers.length,
    exercised_handler_count: handlers.filter((h) => h.executed_by.length).length,
    results,
    handlers,
    core_actions: coreNames.map((action) => ({
      action,
      executed_by: [...(coverage[`core:${action}`] || [])].filter(Boolean),
    })),
  };
  const lines = [
    'إلفورانس 2027 — تدقيق مسارات الأعمال وشروط النهاية',
    '',
    `التاريخ: ${summary.generated_at}`,
    `النتيجة: ${summary.passed} ناجح / ${summary.failed} فاشل / ${summary.total} حالة مستقلة.`,
    '',
    'خط الأساس السابق: npm test نجح في 48 حالة تدفق و63 حالة مسار قبل الإصلاحات. نجاح العرض والاختبارات القديمة لم يكن دليلًا على اكتمال رحلة الأعمال.',
    'المنهج: تحميل الملفات الفعلية داخل JSDOM، تشغيل الأزرار والنماذج المشتركة، قراءة الحالة المحفوظة، ثم فتح تطبيق الدور الآخر بالبيانات نفسها. بعض اختبارات المعرفات غير الصحيحة تستدعي المعالج الفعلي مباشرة. اختبارات التعارض تضع revision أحدث في localStorage بين فتح النموذج وحفظه؛ ليست اختبار تزامن شبكة أو قاعدة بيانات.',
    'حدود النطاق: تدقيق موجّه للتحولات أدناه، وليس إثباتًا شاملًا لجميع الخوارزميات. لا اختبار بصري أو متصفح أصلي أو GPS أو بوابة دفع حقيقية. تسجل المصفوفة كل معالج حالي، وتفرق بين ما نُفذ هنا وما حُصر فقط.',
    '',
    'ما كشفته جولات المراجعة قبل إصلاح كل حالة:',
    '- إرسال نموذج تحصيل 200 مرتين رفع المحصّل إلى 400. إضافة 200 على عقد محصّله التاريخي 2600 أسقط الرصيد إلى 200 بدل 2800. نموذج 200 قديم بعد تسجيل 900 على فاتورة 980 حُفظ بصمت رغم أن المتبقي 80 فقط.',
    '- أمكن اعتبار فرصة ناجحة دون عرض مقبول، وإعادة فرصة مقبولة إلى التفاوض، وإغلاق مشروع بمجرد تغيير الحالة رغم مراجعة العميل المعلقة.',
    '- قرار إداري قديم استبدل موافقة أحدث، ورسالة إدارة تجاوزت أحدث تفضيل لوقف التواصل، ومهمة أُسندت إلى مندوب حُذف بعد فتح النموذج.',
    '- مرجع العميل المحفوظ كملحق معلّق كان يمنع إغلاق تسليمات الفريق المعتمدة. النسخة المعدلة لعرض ينتظر اعتماد خصم بقيت مرئية بحالة طلب تعديل بدل مسودة لم تُرسل.',
    'الحالات أدناه تعيد هذه السيناريوهات وتتحقق من السلوك المصحح، وتختبر المسارات الصحيحة أيضًا حتى لا يكون النجاح نتيجة حظر كل الإجراءات.',
    '',
    'نتائج ملفات الاختبارات السابقة بعد تحديث شروط قبولها:',
    ...baselineResults.map(
      (item) =>
        `${item.file}: ${item.available ? `${item.passed} ناجح / ${item.failed} فاشل / ${item.total} حالة` : 'لا توجد نتيجة محفوظة في هذا المسار'}`,
    ),
    'تغييرات التوقعات موضحة بتعليقات في الاختبارات: منع العمل التجاري الجديد بعد عدم التواصل؛ فصل رغبات الدفع عن شروط العقد؛ موافقة خصم تطابق نسخة العرض؛ إنجاز يتطلب دليلًا؛ إعادة إصدار تتطلب محتوى مختلفًا؛ حصر 64 مسارًا بعد إضافة شاشة التتبع الإدارية. شاشة التتبع لا تعني اختبار خدمة الموقع أو أذونات الجهاز.',
    '',
    'شروط القبول التي اعتمدها مالك التنفيذ:',
    '- لا won دون عرض مقبول مرتبط بالفرصة والعميل، ولا إعادة فتح بيع مقبول بمسار عام.',
    '- لا completed أو 100% دون مراحل منجزة وتسليم فعلي واحد على الأقل واعتماد كل تسليمات الفريق؛ مراجع العميل لا تدخل في شرط الاعتماد، ولا يُنشأ عمل منجز بمجرد تغيير الحالة.',
    '- قبول العرض يثبت نطاقه؛ اعتماد العقد يولد مشروع تخطيط وفواتير مرتبطة بخطة الدفع مرة واحدة.',
    '- التحصيل الجزئي والكامل متسق مع الفاتورة والعقد وخطة الدفع، ولا يكرر القيد نفسه أو يتجاوز الرصيد الأحدث.',
    '- تفضيل عدم التواصل يوقف العمل الاستباقي ويُعاد التحقق منه عند الحفظ.',
    '',
    'نتائج الحالات:',
  ];
  results.forEach((r) => {
    lines.push(`${r.status === 'passed' ? 'نجح' : 'فشل'} | ${r.id} | ${r.title}`);
    if (r.error) lines.push('  الدليل: ' + r.error.replace(/\n/g, ' / '));
  });
  lines.push(
    '',
    `مصفوفة جميع المعالجات: ${handlers.length} معالج؛ نُفذ ${summary.exercised_handler_count} منها ضمن هذه المجموعة.`,
  );
  for (const role of ['rep', 'client', 'admin']) {
    lines.push('', `التطبيق: ${role}`);
    handlers
      .filter((h) => h.app === role)
      .forEach((h) =>
        lines.push(
          `${h.action} | ${h.transition} | ${h.executed_by.length ? 'نُفذ في: ' + h.executed_by.join(', ') : 'حصر مصدر فقط؛ خارج تنفيذ هذه المجموعة'}`,
        ),
      );
  }
  lines.push('', 'الإجراءات المشتركة المحصورة من core:');
  summary.core_actions.forEach((h) =>
    lines.push(`${h.action} | ${h.executed_by.length ? h.executed_by.join(', ') : 'حصر مصدر فقط'}`),
  );
  lines.push('', 'بصمات الملفات التي اختُبرت:');
  Object.entries(summary.source_hashes).forEach(([file, hash]) =>
    lines.push(`${file}  sha256:${hash}`),
  );
  lines.push(
    '',
    'إعادة التشغيل:',
    'ELVORANCE_JSDOM_PATH=/path/to/jsdom node tests/workflow-audit.cjs',
    'النتائج المنظمة تطبع إلى stdout؛ هذا التقرير يتولد من الاختبار نفسه.',
  );
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs/WORKFLOW-AUDIT.txt'), lines.join('\n') + '\n');
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.failed ? 1 : 0;
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

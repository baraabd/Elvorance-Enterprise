// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import {
  initialState,
  transition,
  gateSummary,
  OUTCOMES,
  ROLES,
  WorkflowError,
  minimumFirstPaymentCents,
} from './domain.mts';
const STORAGE_KEY = 'elvorance-instant-close-demo-v1';
const iconPaths = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  arrow: '<path d="m15 18-6-6 6-6"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  spark: '<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z"/>',
  store:
    '<path d="M3 10V6l2-3h14l2 3v4"/><path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 13v8h14v-8M10 21v-6h4v6"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8"/>',
  wallet: '<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M3 10h18M7 6V3h10v3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user: '<circle cx="12" cy="7" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  play: '<path d="m7 4 14 8-14 8z"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
};
const ic = (name) =>
  `<svg aria-hidden="true" viewBox="0 0 24 24">${iconPaths[name] || iconPaths.check}</svg>`;
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
const money = (cents) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
const time = (v) =>
  v ? new Date(v).toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const labels = { rep: 'المندوب الميداني', client: 'العميل', admin: 'الإدارة / المالية' };
const outcomeDetails = {
  [OUTCOMES.READY]: [
    'العميل موافق ومستعد لدفع الدفعة الأولى',
    'إتمام البيع خلال الزيارة: تأكيد العرض والعقد ثم توثيق الدفعة وبدء التنفيذ.',
    'spark',
  ],
  [OUTCOMES.INTERESTED]: ['مهتم بالخدمة', 'احتياج واضح، لكنه لم يوافق على العرض النهائي.', 'check'],
  [OUTCOMES.DECISION_MAKER_ABSENT]: [
    'صاحب القرار غير موجود',
    'يجب تحديد المسؤول عن القرار وموعد العودة.',
    'user',
  ],
  [OUTCOMES.CLOSED]: ['الموقع مغلق', 'وثّق الزيارة وحدد موعد المحاولة القادمة.', 'lock'],
};
let role = ROLES.REP;
let s;
try {
  const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  s = cached?.schemaVersion === 1 ? cached : initialState();
} catch {
  s = initialState();
}
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(STORAGE_KEY) : null;
channel &&
  (channel.onmessage = (event) => {
    if (event.data?.schemaVersion === 1 && event.data.revision > s.revision) {
      s = event.data;
      render();
    }
  });
addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return;
  try {
    const incoming = JSON.parse(event.newValue);
    if (incoming && incoming.revision > s.revision) {
      s = incoming;
      render();
    }
  } catch {}
});
const $ = () => document.querySelector('#app');
let toastTimer;
function flash(message, isError = false) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 4600);
}
function commit(action) {
  try {
    const result = transition(s, action, role);
    s = result;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    channel?.postMessage(s);
    render();
    flash('تم تحديث حالة الطلب بنجاح.');
  } catch (error) {
    flash(error instanceof WorkflowError ? error.message : 'تعذر حفظ هذا الإجراء.', true);
  }
}
function statusText(x) {
  return x.done ? 'مكتملة' : x.blocked ? 'بانتظار الخطوة السابقة' : 'مطلوبة الآن';
}
function stepsMarkup(g) {
  return `<div class="stepdots" aria-label="مراحل إتمام الصفقة">${g.steps.map((x, i) => `<span class="stepdot ${x.done ? 'done' : !x.blocked ? 'current' : ''}"><span>${x.done ? '✓' : i + 1}</span>${esc(x.label)}</span>`).join('')}</div>`;
}
function choices() {
  return `<section class="card"><div class="section-head"><div><h2>1 · النتيجة</h2><p>اختر ما حدث مع العميل فعليًا. لن تُحسب الصفقة مكتملة قبل موافقته وتحقق الدفعة.</p></div><span class="pill ${s.visit.outcome ? 'good' : 'warn'}">${s.visit.outcome ? 'نتيجة مسجلة' : 'اختر نتيجة'}</span></div><div class="outcome-list">${Object.entries(
    outcomeDetails,
  )
    .map(
      ([key, [title, desc, icon]]) =>
        `<button type="button" class="outcome-option ${key === OUTCOMES.READY ? 'featured' : ''} ${s.visit.outcome === key ? 'selected' : ''}" data-outcome="${esc(key)}" ${s.visit.status !== 'active' ? 'disabled' : ''} aria-pressed="${s.visit.outcome === key ? 'true' : 'false'}"><span class="out-icon">${ic(icon)}</span><span class="body">${key === OUTCOMES.READY ? '<span class="feature-chip">إتمام الصفقة خلال الزيارة</span>' : ''}<strong>${esc(title)}</strong><small>${esc(desc)}</small></span><span class="arrow">${ic('arrow')}</span></button>`,
    )
    .join(
      '',
    )}</div>${s.visit.outcome && s.visit.outcome !== OUTCOMES.READY ? `<div class="banner">هذه نتيجة أولية، وليست بيعًا مكتملًا. سجّل موعد المتابعة المناسب في النظام الأساسي أو أنهِ الزيارة مع الحفاظ على حالتها.</div>` : ''}${s.visit.status === 'active' && s.visit.outcome && s.visit.outcome !== OUTCOMES.READY ? `<div class="actions"><button class="outline" data-action="CLOSE_VISIT">${ic('check')}حفظ نتيجة الزيارة وإنهاؤها</button></div>` : ''}</section>`;
}
function quoteCard() {
  return `<div class="card"><div class="section-head"><div><h2>العرض المرتبط بالزيارة</h2><p>نسخة محددة البنود، وليست ملاحظة شفوية</p></div><span class="pill ${s.quote.status === 'accepted' ? 'good' : s.quote.status === 'sent' ? 'warn' : ''}">${esc(s.quote.status === 'accepted' ? 'مقبول من العميل' : s.quote.status === 'sent' ? 'مرسل للمراجعة' : 'جاهز للإرسال')}</span></div><div class="line"><span>رقم العرض</span><strong dir="ltr">${esc(s.quote.id)} / v${s.quote.version}</strong></div>${s.quote.lines.map((it) => `<div class="line"><span>${esc(it.title)}</span><strong class="money-small">${money(it.amountCents)}</strong></div>`).join('')}<div class="line"><span>قيمة الخدمات</span><strong class="money-small">${money(s.quote.subtotalCents)}</strong></div><div class="line"><span>الخصم</span><strong class="money-small">− ${money(s.quote.discountCents)}</strong></div><div class="quote-total"><div><p class="small muted">صافي العرض</p><div class="money">${money(s.quote.totalCents)}</div></div><span class="pill good">بنود محسوبة</span></div><div class="quote-receipt">الدفعة الأولى المقترحة: <strong>${money(s.installment.amountCents)}</strong> (${Math.round((s.installment.amountCents / s.quote.totalCents) * 100)}%). الحد الأدنى 20%: ${money(minimumFirstPaymentCents(s.quote))}.</div></div>`;
}
function repArea(g) {
  const active = s.visit.outcome === OUTCOMES.READY;
  return `${choices()}${active ? `<section class="card"><div class="section-head"><div><h2>المسار السريع لإغلاق الصفقة</h2><p>كل إجراء يظهر لصاحبه الصحيح في تطبيقه.</p></div><span class="pill dark">مسار بيع مباشر</span></div>${stepsMarkup(g)}<div class="note">${ic('shield')} الموافقة النهائية على العرض والعقد تُسجل من العميل نفسه. والتحصيل لا يؤكده المندوب؛ تؤكده الإدارة بعد التحقق من الدليل.</div>${quoteCard()}${s.quote.status === 'draft' ? `<div class="actions"><button class="primary" data-action="SEND_QUOTE">${ic('send')}إرسال نسخة العرض للعميل</button></div>` : g.complete ? `<div class="banner good">بدأ التنفيذ بعد استيفاء جميع الشروط. يمكنك إنهاء الزيارة مع حفظ سجل الاتفاق.</div>` : `<div class="banner"><strong>الإجراء التالي:</strong> ${esc(g.current.label)}، والمسؤول عنه: <strong>${esc(labels[g.current.role])}</strong>. استخدم تبويب الدور المناسب لمتابعة الرحلة.</div>`}${s.visit.status === 'active' ? `<div class="actions"><button class="outline" data-action="CLOSE_VISIT">${ic('check')}إنهاء الزيارة وحفظ حالة الاتفاق</button></div>` : `<div class="banner good">تم إنهاء الزيارة وحفظها. تبقى متابعة العقد والدفعة والمشروع ظاهرة هنا بعد الإغلاق.</div>`}</section>` : ''}`;
}
function clientArea(g) {
  return `<section class="card"><div class="section-head"><div><h2>تأكيد العميل أثناء الزيارة</h2><p>يمكن تنفيذ هذه الخطوات الآن، من حساب العميل، دون مغادرة مكان الزيارة.</p></div><span class="pill">تطبيق العميل</span></div>${stepsMarkup(g)}${s.visit.outcome !== OUTCOMES.READY ? `<div class="empty">لم يحدد المندوب أن العميل مستعد للتعاقد الآن.</div>` : s.quote.status === 'draft' ? `<div class="banner">المندوب يُعد نسخة العرض. لا يمكن الموافقة على عرض لم يُرسل بعد.</div>` : g.customerAccepted ? `<div class="success-hero"><h3>${ic('check')} سُجل قبول العرض</h3><p>وافق العميل على الإصدار ${s.quote.version} من العرض بتاريخ ${esc(time(s.clientReview.at))}.</p></div>` : `${quoteCard()}<form id="accept-quote" class="card-dividerless"><label class="check"><input name="confirm" type="checkbox" required /> اطلعت على بنود العرض وقيمته وخطة الدفعات وأؤكد قبولها بنفسي.</label><button type="submit" class="primary full">${ic('check')}أوافق على عرض السعر</button></form>`}${g.customerAccepted && s.contract.status !== 'accepted' ? `<div class="card-divider"></div><h3 class="box-title">اعتماد العقد (إجراء مستقل)</h3><p class="small muted">يشمل العقد نطاق العمل والجدول وشروط التسليم والدفعات. العرض المقبول لا يعني تلقائيًا اعتماد العقد.</p><div class="readonly">رقم العقد: ${esc(s.contract.id)} · صافي التعاقد ${money(s.quote.totalCents)}.</div><form id="accept-contract"><label class="check"><input name="confirm" type="checkbox" required /> راجعت شروط العقد وأوافق على اعتماده.</label><button class="primary full" type="submit">${ic('file')}اعتماد العقد</button></form>` : g.contractAccepted ? `<div class="banner good">تم اعتماد نموذج العقد التجريبي. الدفعة الأولى مستحقة بمبلغ <strong>${money(s.installment.amountCents)}</strong>.</div>` : ''}${g.contractAccepted && !s.installment.intent && s.installment.status !== 'verified' ? `<div class="actions"><button class="secondary" data-action="MARK_PAYMENT_INTENT">${ic('wallet')}سأدفع الدفعة الأولى الآن</button></div><p class="fine-print">هذا يُسجّل استعداد العميل للدفع فقط، ولا يؤكد استلام المبلغ.</p>` : ''}${s.installment.intent && s.installment.status === 'pending_payment' ? `<div class="banner">تم تسجيل نية الدفع. تنتظر الدفعة تحقق الإدارة من الإيصال.</div>` : ''}${g.installmentVerified ? `<div class="banner good">الدفعة الأولى مؤكدة في هذه التجربة، ومرجعها ${esc(s.installment.reference)}.</div>` : ''}${g.projectStarted ? `<div class="success-hero"><h3>بدأ المشروع</h3><p>فريق التنفيذ: ${esc(s.project.team)}. يمكن متابعة العمل في تطبيق العميل.</p></div>` : ''}</section>`;
}
function adminArea(g) {
  return `<section class="card"><div class="section-head"><div><h2>التحصيل وبدء المشروع</h2><p>القرارات التي تحتاج تحققًا ماليًا وتشغيليًا تُنفّذ من الإدارة.</p></div><span class="pill">الإدارة / المالية</span></div>${stepsMarkup(g)}<div class="milestone"><span>اعتماد العرض من العميل</span><strong>${g.customerAccepted ? 'مؤكد' : 'قيد الانتظار'}</strong></div><div class="milestone"><span>اعتماد العقد</span><strong>${g.contractAccepted ? 'مؤكد' : 'قيد الانتظار'}</strong></div><div class="milestone"><span>الدفعة الأولى ${money(s.installment.amountCents)}</span><strong>${g.installmentVerified ? 'موثّقة' : 'لم يُؤكد استلامها'}</strong></div>${g.contractAccepted && s.installment.status === 'pending_payment' ? `<div class="card-divider"></div><h3 class="box-title">تأكيد استلام الدفعة الأولى</h3><div class="banner warn">لا تضغط تأكيد الاستلام إلا بعد فحص التحويل أو الإيصال فعليًا. الحقول أدناه للتجربة فقط.</div><form id="verify-payment"><label class="field">طريقة التحصيل<select name="method" required><option value="">اختر الوسيلة</option><option value="cash">نقدي موثق</option><option value="bank">تحويل مصرفي</option><option value="gateway">بوابة دفع</option></select></label><label class="field">رقم الإيصال أو مرجع التحويل<input name="reference" required minlength="5" maxlength="60" autocomplete="off" placeholder="مثال: RECEIPT-2027-22" /></label><label class="check"><input type="checkbox" name="checked" required /> أؤكد أنني تحققت من دليل تحصيل المبلغ، وليس مجرد وعد بالدفع.</label><button type="submit" class="primary full">${ic('shield')}تأكيد استلام الدفعة (تجريبي)</button></form>` : ''}${g.installmentVerified && !g.projectStarted ? `<div class="card-divider"></div><h3 class="box-title">إسناد فريق وبدء التنفيذ</h3><p class="small muted">العقد معتمد، والدفعة الأولى مؤكدة. يجب تحديد الجهة المنفذة قبل البدء.</p><form id="start-project"><label class="field">فريق التنفيذ<select name="team" required><option value="">اختر الفريق</option><option value="فريق تطوير الويب">فريق تطوير الويب</option><option value="فريق الحلول الرقمية">فريق الحلول الرقمية</option><option value="فريق التسويق والتصميم">فريق التسويق والتصميم</option></select></label><button type="submit" class="primary full">${ic('play')}اعتماد بدء التنفيذ</button></form>` : ''}${g.projectStarted ? `<div class="banner good">تم إنشاء مرحلة «قيد التنفيذ» وإسناد المشروع إلى ${esc(s.project.team)} بتاريخ ${esc(time(s.project.startedAt))}.</div>` : !g.contractAccepted ? `<div class="banner">ليس هناك تحصيل موثق أو مشروع فعال حتى يعتمد العميل العرض والعقد.</div>` : ''}</section>`;
}
function sidebar(g) {
  return `<div class="column"><section class="card card-dark"><div class="section-head"><div><h2>أين وصل الاتفاق؟</h2><p>مرحلة حيّة مشتركة بين الأدوار</p></div><span class="pill dark">${g.complete ? 'مكتمل' : 'قيد التقدم'}</span></div><div class="status-list">${g.steps.map((x, i) => `<div class="status-item ${x.done ? 'done' : !x.blocked ? 'active' : ''}"><div class="status-number">${x.done ? '✓' : i + 1}</div><div><h3>${esc(x.label)}</h3><p>${esc(statusText(x))} · ${esc(labels[x.role])}</p></div></div>`).join('')}</div></section><section class="card"><div class="section-head"><div><h2>الحالة والاتفاق</h2><p>الإغلاق الميداني منفصل عن التنفيذ</p></div>${ic('file')}</div><div class="line"><span>الزيارة</span><strong>${s.visit.status === 'active' ? 'جارية' : 'مكتملة'}</strong></div><div class="line"><span>العميل</span><strong>${esc(s.visit.customer)}</strong></div><div class="line"><span>عرض السعر</span><strong dir="ltr">${esc(s.quote.id)}</strong></div><div class="line"><span>صافي العقد</span><strong class="money-small">${money(s.quote.totalCents)}</strong></div><div class="line"><span>الدفعة الأولى</span><strong class="money-small">${money(s.installment.amountCents)}</strong></div><div class="line"><span>استلام الدفعة</span><strong>${g.installmentVerified ? 'مؤكد' : 'غير مؤكد'}</strong></div><div class="line"><span>التنفيذ</span><strong>${g.projectStarted ? 'بدأ' : 'لم يبدأ'}</strong></div></section><section class="card"><div class="section-head"><div><h2>سجل الإجراءات</h2><p>آخر الأحداث في هذه المحاكاة</p></div></div>${
    s.activity.length
      ? `<div class="activity-list">${s.activity
          .slice(0, 10)
          .map(
            (a) =>
              `<div class="activity-item"><strong>${esc(a.message)}</strong>${esc(labels[a.role])} · ${esc(time(a.at))}</div>`,
          )
          .join('')}</div>`
      : '<div class="empty">ستظهر الإجراءات بعد تسجيل أول خطوة.</div>'
  }</section></div>`;
}
function render() {
  const g = gateSummary(s);
  const content =
    role === ROLES.REP ? repArea(g) : role === ROLES.CLIENT ? clientArea(g) : adminArea(g);
  $().innerHTML = `<main class="page"><header class="top"><div class="brand"><div class="brand-mark">A</div><div><strong>ELVORANCE</strong><p>مسار البيع المباشر · تجربة تفاعلية 2027</p></div></div><div class="top-right-actions"><span class="pill">بيانات توضيحية فقط</span><button class="reset" data-action="RESET">إعادة ضبط التجربة</button></div></header><section class="hero"><div><p class="eyebrow">زيارة ميدانية / ${esc(s.visit.id)}</p><h1>اتفاق الآن، وتنفيذ بعد التأكيد</h1><p>خيار واضح للبيع المباشر دون الخلط بين اهتمام العميل وموافقته الرسمية، أو بين وعد الدفع والتحصيل المؤكد.</p></div><div class="hero-metrics"><span>${ic('store')} المنشأة <strong>${esc(s.visit.customer)}</strong></span><span>${ic('user')} المندوب <strong>${esc(s.visit.representative)}</strong></span><span>${ic('wallet')} الدفعة الأولى <strong>${money(s.installment.amountCents)}</strong></span></div></section><div class="rolebar"><h2>عاين رحلة كل طرف</h2><div class="role-tabs" role="tablist" aria-label="تبديل التطبيق التجريبي">${Object.entries(
    labels,
  )
    .map(
      ([key, label]) =>
        `<button role="tab" aria-selected="${role === key ? 'true' : 'false'}" class="${role === key ? 'active' : ''}" data-role="${key}">${esc(label)}</button>`,
    )
    .join(
      '',
    )}</div></div><div class="note">${ic('shield')} نموذج وظيفي لتصميم الواجهات والتحقق من الانتقالات. الصلاحيات هنا محاكاة على المتصفح فقط؛ لا يوجد تحصيل مالي حقيقي، ولا توقيع قانوني، ولا مزامنة مع خادم Elvorance.</div><div class="layout"><div class="column">${content}</div>${sidebar(g)}</div><footer class="foot">ELVORANCE CRM · مكوّن قابل للدمج بعد ربطه بهوية العميل وخدمة العقود والفوترة والمشاريع</footer></main>`;
}
document.addEventListener('click', (event) => {
  const roleButton = event.target.closest('button[data-role]');
  if (roleButton) {
    role = roleButton.dataset.role;
    render();
    return;
  }
  const outcomeButton = event.target.closest('button[data-outcome]');
  if (outcomeButton) {
    commit({ type: 'SELECT_OUTCOME', outcome: outcomeButton.dataset.outcome });
    return;
  }
  const actionButton = event.target.closest('button[data-action]');
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  if (action === 'RESET') {
    if (!confirm('إعادة ضبط بيانات التجربة المحلية فقط؟')) return;
    s = initialState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    channel?.postMessage(s);
    render();
    return;
  }
  if (['SEND_QUOTE', 'MARK_PAYMENT_INTENT', 'CLOSE_VISIT'].includes(action))
    commit({ type: action });
});
document.addEventListener('submit', (event) => {
  if (!(event.target instanceof HTMLFormElement)) return;
  const form = event.target;
  if (!['accept-quote', 'accept-contract', 'verify-payment', 'start-project'].includes(form.id))
    return;
  event.preventDefault();
  const data = new FormData(form);
  if (form.id === 'accept-quote')
    commit({ type: 'ACCEPT_QUOTE', confirm: data.get('confirm') === 'on' });
  if (form.id === 'accept-contract')
    commit({ type: 'ACCEPT_CONTRACT', confirm: data.get('confirm') === 'on' });
  if (form.id === 'verify-payment')
    commit({
      type: 'VERIFY_FIRST_PAYMENT',
      method: data.get('method'),
      reference: data.get('reference'),
      checked: data.get('checked') === 'on',
    });
  if (form.id === 'start-project') commit({ type: 'START_PROJECT', team: data.get('team') });
});
render();

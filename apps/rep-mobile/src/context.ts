// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/* ELVORANCE_DASHBOARD_DRILLDOWN_2027 */
import { createRepUi } from '../../../packages/ui/src/index.ts';
import { createQueries } from './queries.ts';
export function createContext(A) {
  const cash = (value) => A.money(Number(value) || 0);
  const now = () => new Date().toISOString();
  const localDay = (value) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? ''
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const localInput = (value) => {
    const d = value ? new Date(value) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };
  const time = (value) =>
    value
      ? new Date(value).toLocaleTimeString('ar', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'غير محدد';
  const date = (value) => (value ? A.date(value) : 'غير محدد');
  const elapsed = (value) => {
    const sec = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
    return `${Math.floor(sec / 3600)
      .toString()
      .padStart(2, '0')}:${Math.floor((sec % 3600) / 60)
      .toString()
      .padStart(2, '0')}:${(sec % 60).toString().padStart(2, '0')}`;
  };
  const labels = {
    new: 'جديد',
    qualified: 'مؤهّل',
    customer: 'عميل حالي',
    lost: 'غير مكتمل',
    proposal: 'عرض مقدّم',
    negotiation: 'تفاوض',
    won: 'مكتسب',
    draft: 'مسودة',
    sent: 'أُرسل داخل المنصة',
    revision_requested: 'طلب تعديل',
    accepted: 'مقبول',
    rejected: 'مرفوض',
    pending: 'بانتظار القرار',
    approved: 'معتمد',
    scheduled: 'مجدولة',
    active: 'جارية',
    completed: 'مكتملة',
    cancelled: 'ملغاة',
  };
  const categoryNames = {
    web: 'المواقع',
    commerce: 'التجارة الإلكترونية',
    design: 'الهوية والتصميم',
    marketing: 'التسويق',
    software: 'الأنظمة والتطبيقات',
    infrastructure: 'البنية والحماية',
  };
  const stageList = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
  const outcomes = [
    ['ready_to_contract', 'العميل موافق ومستعد لبدء التنفيذ', 'check-circle', 'انتقل إلى اعتماد العرض والعقد من العميل ثم تحقّق من الدفعة الأولى قبل تشغيل المشروع.'],
    ['interested', 'مهتم بالخدمة', 'target', 'احتياج واضح وخطوة تجارية تالية.'],
    ['no_decision_maker', 'صاحب القرار غير موجود', 'user', 'حدّد الشخص المناسب وموعد العودة.'],
    ['closed', 'الموقع مغلق', 'lock', 'وثّق الملاحظة وجدول محاولة أخرى.'],
    ['reschedule', 'طلب تغيير الموعد', 'calendar', 'احفظ الموعد الجديد المتفق عليه.'],
    ['no_budget', 'الميزانية غير متاحة', 'wallet', 'سجّل حدود الميزانية وموعد مراجعتها.'],
    ['competitor', 'يتعامل مع منافس', 'briefcase', 'افهم البديل الحالي وما ينقصه.'],
    ['not_interested', 'غير مهتم / رفض', 'x', 'سجّل سبب الرفض دون متابعة مزعجة.'],
    ['wrong_contact', 'بيانات التواصل غير صحيحة', 'phone', 'أنشئ مهمة داخلية لتصحيح البيانات.'],
    ['do_not_contact', 'طلب عدم التواصل', 'shield', 'أوقف الزيارات والرسائل الجديدة لهذا العميل.'],
    ['remote_meeting', 'اجتماع عن بُعد', 'monitor', 'حدّد وسيلة الاجتماع وموعده.'],
    ['needs_approval', 'يحتاج موافقة داخلية', 'check-circle', 'ارفع القرار المطلوب للإدارة.'],
    ['follow_up', 'متابعة لاحقة', 'refresh', 'حافظ على خطوة وموعد واضحين.'],
  ];
  const needsFollowup = (value) =>
    !['ready_to_contract', 'not_interested', 'wrong_contact', 'do_not_contact'].includes(value);
  const ui = {
    gps: null,
    gpsBusy: false,
    gpsError: '',
    proofMode: 'manual',
    outcome: {},
    quote: null,
    timer: null,
  };
  const tone = (status) =>
    ['won', 'accepted', 'approved', 'completed', 'customer'].includes(status)
      ? 'good'
      : ['lost', 'rejected', 'cancelled'].includes(status)
        ? 'bad'
        : ['pending', 'revision_requested', 'draft'].includes(status)
          ? 'warn'
          : 'info';
  const badge = (status) => A.badge(labels[status] || status, tone(status));
  const missing = (text) =>
    head(text, 'قد تكون البيانات تغيّرت أو لم تعد ضمن حسابك.') +
    A.empty(
      'لم نجد هذا السجل',
      'ارجع إلى قائمة العملاء للمتابعة.',
      go('clients', 'العملاء', 'users'),
    );
  const notify = (s, audience, title, body, extra = {}) =>
    s.notifications.unshift({
      id: A.id('note'),
      audience,
      title,
      body,
      read: false,
      createdAt: now(),
      ...extra,
    });
  const servicesText = (values) => (values || []).map((v) => A.service(v)?.title || v);
  const needsChips = (values) =>
    servicesText(values)
      .map((t) => `<span class="chip">${e(t)}</span>`)
      .join('');
  const chipLink = (route, key, label, active, value = key) =>
    `<button type="button" class="chip ${active ? 'active' : ''}" data-go="${route}" data-param-filter="${e(value)}">${e(label)}</button>`;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const draftKey = (kind, id) => `${rep(A.state()).id}:${kind}:${id || 'new'}`;
  const reviewLabels = {
    accepted: 'عرض قبله العميل داخل المنصة',
    sent: 'عرض مرسل ينتظر قرار العميل',
    revision_requested: 'العميل طلب تعديل العرض',
    rejected: 'العميل رفض العرض',
    draft: 'مقترح محفوظ لم يُرسل بعد',
    no_quote: 'زيارة دون عرض سعر',
  };
  const { e, ic, go, act, iconGo, head, section, metric, metricLink, drilldownSummary } = createRepUi(A);
  const { rep, ownClients, client, ownVisits, ownQuotes, ownOpps, activeVisit, getVisit } =
    createQueries({});
  return {
    A,
    cash,
    now,
    localDay,
    localInput,
    time,
    date,
    elapsed,
    labels,
    categoryNames,
    stageList,
    outcomes,
    needsFollowup,
    ui,
    tone,
    badge,
    missing,
    notify,
    servicesText,
    needsChips,
    chipLink,
    clone,
    draftKey,
    reviewLabels,
    e,
    ic,
    go,
    act,
    iconGo,
    head,
    section,
    metric,
    metricLink,
    drilldownSummary,
    rep,
    ownClients,
    client,
    ownVisits,
    ownQuotes,
    ownOpps,
    activeVisit,
    getVisit,
  };
}

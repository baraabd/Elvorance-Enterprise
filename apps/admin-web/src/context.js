import { createAdminUi } from '../../../packages/ui/src/index.js';
import { createQueries } from './queries.js';
export function createContext(A) {
  const N = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const money = (value) => A.money(N(value));
  const date = (value) => (value ? A.date(value) : 'غير محدد');
  const stamp = () => new Date().toISOString();
  const color = (value) => (/^#[\da-f]{3,8}$/i.test(value || '') ? value : '#d9f99d');
  const ui = {
    search: {},
    teamStatus: 'all',
    clientStatus: 'all',
    pipelineStage: 'all',
    pipelineRep: 'all',
    taskStatus: 'open',
    taskRep: 'all',
    approvalStatus: 'pending',
    projectStatus: 'all',
    invoiceStatus: 'all',
    ticketStatus: 'all',
    period: '30',
    analyticsRep: 'all',
    analyticsZone: 'all',
  };
  const stages = {
    new: 'جديدة',
    qualified: 'مؤهلة',
    proposal: 'عرض سعر',
    negotiation: 'تفاوض',
    won: 'ناجحة',
    lost: 'خاسرة',
  };
  const repStatuses = {
    active: 'متاح',
    break: 'استراحة',
    offline: 'غير متاح',
  };
  const clientStatuses = {
    new: 'جديد',
    qualified: 'مؤهل',
    customer: 'عميل حالي',
    lost: 'غير مستمر',
  };
  const projectStatuses = {
    planning: 'قيد التخطيط',
    active: 'قيد التنفيذ',
    waiting_client: 'بانتظار العميل',
    delayed: 'متأخر',
    completed: 'مكتمل',
    on_hold: 'متوقف مؤقتًا',
  };
  const projectStages = {
    discovery: 'الاكتشاف',
    ux: 'تجربة المستخدم',
    design: 'التصميم',
    development: 'التطوير',
    testing: 'الاختبار',
    launch: 'الإطلاق',
  };
  const approvalTypes = {
    discount: 'خصم',
    reschedule: 'تغيير موعد',
    zone_transfer: 'توزيع منطقة',
    scope_change: 'تغيير نطاق',
  };
  const ticketStatuses = {
    open: 'جديدة',
    in_progress: 'قيد المعالجة',
    resolved: 'محلولة',
  };
  const outcomeNames = {
    interested: 'مهتم',
    no_decision_maker: 'غياب صاحب القرار',
    closed: 'الموقع مغلق',
    reschedule: 'إعادة جدولة',
    no_budget: 'ميزانية غير مناسبة',
    competitor: 'يتعامل مع منافس',
    not_interested: 'غير مهتم',
    wrong_contact: 'بيانات تواصل غير صحيحة',
    do_not_contact: 'عدم التواصل',
    needs_approval: 'تحتاج موافقة',
    remote_meeting: 'اجتماع عن بعد',
    follow_up: 'متابعة',
  };
  const search = (collection, placeholder) =>
    `<label class="search-box">${icon('search')}<span class="sr-only">${E(placeholder)}</span><input class="input" type="search" data-input="search-records" data-collection="${E(collection)}" placeholder="${E(placeholder)}" aria-label="${E(placeholder)}" value="${E(ui.search[collection] || '')}"></label>`;
  const filter = (label, key, values) =>
    `<label class="field"><span class="small muted">${E(label)}</span><select class="select" data-change="filter" data-key="${E(key)}">${options(values, ui[key])}</select></label>`;
  const searchable = (value) => `data-search="${E(String(value).toLocaleLowerCase('ar'))}"`;
  const searchEmpty = (name) =>
    `<p class="notice" data-search-empty="${E(name)}" hidden>لا توجد نتائج مطابقة لعبارة البحث.</p>`;
  const missing = () =>
    empty(
      'السجل غير موجود',
      'ربما تغيرت البيانات في نافذة أخرى. ارجع إلى القائمة وحدّثها.',
      go('home', 'الرئيسية', 'home'),
    );
  const wrap = (html) => `<div class="admin-wrap">${html}</div>`;
  function dayOf(value) {
    return String(value || '').slice(0, 10);
  }
  function within(value, days) {
    if (days === 'all') return true;
    const day = dayOf(value);
    return Boolean(day) && day >= A.addDays(-N(days) + 1) && day <= A.today();
  }
  const invoiceLabels = {
    paid: 'مدفوعة بالسجل',
    partial: 'جزئية',
    due: 'مستحقة',
    overdue: 'متأخرة',
  };
  function notify(s, audience, title, body, scope) {
    if (!Array.isArray(s.notifications)) s.notifications = [];
    s.notifications.push({
      id: A.id('notice'),
      audience,
      title,
      body,
      read: false,
      createdAt: stamp(),
      ...(scope || {}),
    });
  }
  function split(value) {
    return String(value || '')
      .split(/[,،\n]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  function fail(message) {
    A.toast(message, 'error');
    return false;
  }
  const {
    E,
    icon,
    badge,
    empty,
    go,
    action,
    iconAction,
    idAttr,
    pageTitle,
    sectionTitle,
    input,
    textarea,
    options,
    select,
    choices,
    selectedChecks,
    form,
    progress,
    metric,
  } = createAdminUi(A, {
    N,
  });
  const { list, sum, find, person, customer, needLabel, repOptions, clientOptions, zoneOptions } =
    createQueries({
      N,
    });
  return {
    A,
    N,
    money,
    date,
    stamp,
    color,
    ui,
    stages,
    repStatuses,
    clientStatuses,
    projectStatuses,
    projectStages,
    approvalTypes,
    ticketStatuses,
    outcomeNames,
    search,
    filter,
    searchable,
    searchEmpty,
    missing,
    wrap,
    dayOf,
    within,
    invoiceLabels,
    notify,
    split,
    fail,
    E,
    icon,
    badge,
    empty,
    go,
    action,
    iconAction,
    idAttr,
    pageTitle,
    sectionTitle,
    input,
    textarea,
    options,
    select,
    choices,
    selectedChecks,
    form,
    progress,
    metric,
    list,
    sum,
    find,
    person,
    customer,
    needLabel,
    repOptions,
    clientOptions,
    zoneOptions,
  };
}

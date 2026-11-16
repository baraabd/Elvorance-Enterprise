// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import { createClientUi } from '../../../packages/ui/src/index.ts';
import { createQueries } from './queries.ts';
export function createContext(A) {
  const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const cents = (value) => Math.round(Number(value) * 100);
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const money = (value) => A.money(num(value));
  const date = (value) => (value ? A.date(value) : 'لم يحدد بعد');
  const now = () => new Date().toISOString();
  const textLines = (text) =>
    (Array.isArray(text) ? text : String(text || '').split('\n')).filter(Boolean);
  const paragraph = (text) => E(text).replace(/\n/g, '<br>');
  const label = (map, value) => map[value] || value || 'غير محدد';
  const stages = ['discovery', 'ux', 'design', 'development', 'testing', 'launch'];
  const stageLabels = {
    discovery: 'الاكتشاف',
    ux: 'تجربة المستخدم',
    design: 'التصميم',
    development: 'التطوير',
    testing: 'الاختبار',
    launch: 'الإطلاق',
  };
  const projectLabels = {
    planning: 'بانتظار خطة البدء',
    active: 'قيد التنفيذ',
    waiting_client: 'بانتظار ملاحظتك',
    delayed: 'يحتاج متابعة',
    completed: 'مكتمل',
    on_hold: 'متوقف مؤقتًا',
  };
  const quoteLabels = {
    draft: 'مسودة',
    sent: 'بانتظار قرارك',
    revision_requested: 'طلب تعديل',
    accepted: 'مقبول',
    rejected: 'مرفوض',
  };
  const contractLabels = {
    pending: 'بانتظار موافقتك',
    signed: 'تمت الموافقة',
    active: 'نشط',
    completed: 'مكتمل',
  };
  const invoiceLabels = {
    due: 'مستحقة',
    overdue: 'متأخرة',
    partial: 'مدفوعة جزئيًا',
    paid: 'مدفوعة',
  };
  const ticketLabels = {
    open: 'مفتوحة',
    in_progress: 'قيد المعالجة',
    resolved: 'محلولة',
  };
  const opportunityLabels = {
    new: 'استلمنا طلبك',
    qualified: 'دراسة الاحتياج',
    proposal: 'العرض جاهز',
    negotiation: 'مراجعة التفاصيل',
    won: 'تم الاتفاق',
    lost: 'أغلق الطلب',
  };
  const serviceCategories = {
    web: 'المواقع',
    commerce: 'التجارة الإلكترونية',
    design: 'التصميم والهوية',
    marketing: 'التسويق',
    software: 'البرمجيات',
    infrastructure: 'البنية والحماية',
  };
  const categoryLabels = {
    technical: 'مشكلة تقنية',
    project: 'المشروع والتصميم',
    scope_change: 'تغيير النطاق',
    billing: 'الفواتير والدفعات',
    general: 'استفسار عام',
  };
  const tone = (status) =>
    ['completed', 'paid', 'accepted', 'approved', 'signed', 'resolved', 'won'].includes(status)
      ? 'good'
      : ['rejected', 'overdue', 'lost', 'delayed'].includes(status)
        ? 'bad'
        : [
              'pending',
              'sent',
              'waiting_client',
              'revision_requested',
              'changes_requested',
              'partial',
            ].includes(status)
          ? 'warn'
          : 'info';
  const badge = (text, status) => A.badge(text, tone(status));
  const wrap = (html) => `<div class="client-app stack">${html}</div>`;
  const missing = (title = 'لم نجد هذا السجل') =>
    wrap(
      A.empty(
        title,
        'قد يكون السجل تغير. يمكنك الرجوع إلى مساحتك ومتابعة العمل.',
        go('العودة للرئيسية', 'home'),
      ),
    );
  const error = (message) => {
    A.toast(message, 'error');
    return false;
  };
  const idFrom = ({ el, params }) => el?.dataset?.id || params?.id;
  const notify = (state, title, body, audiences = ['admin', 'rep']) => {
    state.notifications ||= [];
    audiences.forEach((audience) =>
      state.notifications.unshift({
        id: A.id('notice'),
        audience,
        title,
        body,
        read: false,
        createdAt: now(),
        ...(audience === 'rep'
          ? {
              repId: customer(state)?.repId,
            }
          : {}),
        ...(audience === 'client'
          ? {
              clientId: clientId(state),
            }
          : {}),
      }),
    );
  };
  const addMessage = (state, text, id = A.id('msg')) => {
    state.messages ||= [];
    if (!state.messages.some((message) => message.id === id))
      state.messages.push({
        id,
        clientId: clientId(state),
        from: 'client',
        text,
        at: now(),
        read: false,
      });
  };
  function reviewToken(value) {
    // Detect stale review forms; authorization and cryptographic signing are not
    // claimed by this local demo token.
    const text = JSON.stringify(value);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }
  const { E, attrs, go, act, section, heading, notice, field, area, select } = createClientUi(A);
  const { list, clientId, customer, mine, owned, findService } = createQueries({});
  return {
    A,
    num,
    cents,
    copy,
    money,
    date,
    now,
    textLines,
    paragraph,
    label,
    stages,
    stageLabels,
    projectLabels,
    quoteLabels,
    contractLabels,
    invoiceLabels,
    ticketLabels,
    opportunityLabels,
    serviceCategories,
    categoryLabels,
    tone,
    badge,
    wrap,
    missing,
    error,
    idFrom,
    notify,
    addMessage,
    reviewToken,
    E,
    attrs,
    go,
    act,
    section,
    heading,
    notice,
    field,
    area,
    select,
    list,
    clientId,
    customer,
    mine,
    owned,
    findService,
  };
}

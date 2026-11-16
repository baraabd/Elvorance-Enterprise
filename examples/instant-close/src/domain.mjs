/**
 * AtlasCRM — Instant-close domain workflow (demo/reference implementation).
 * Pure, deterministic state transitions; no network, payment processing or legal e-signature.
 */
export class WorkflowError extends Error {
  constructor(code, message) { super(message); this.name = 'WorkflowError'; this.code = code; }
}
export const ROLES = Object.freeze({ REP: 'rep', CLIENT: 'client', ADMIN: 'admin' });
export const OUTCOMES = Object.freeze({
  READY: 'ready_to_contract', INTERESTED: 'interested', DECISION_MAKER_ABSENT: 'no_decision_maker', CLOSED: 'location_closed'
});
export function initialState() {
  return {
    schemaVersion: 1,
    revision: 1,
    visit: { id: 'visit-demo-01', customer: 'مقهى مدار', representative: 'سامي', status: 'active', outcome: null, closedAt: null },
    quote: {
      id: 'AT-Q-2027-014', version: 3, status: 'draft', currency: 'USD', subtotalCents: 105000,
      discountCents: 10000, totalCents: 95000,
      lines: [{ title: 'موقع تعريفي وحجوزات', amountCents: 60000 }, { title: 'حضور رقمي وإدارة محتوى', amountCents: 45000 }],
    },
    clientReview: { status: 'not_started', acceptedQuoteVersion: null, at: null },
    contract: { id: 'AT-C-2027-014', status: 'not_ready', acceptedAt: null },
    installment: { id: 'AT-I-2027-014-1', amountCents: 28500, intent: false, status: 'not_issued', verifiedAt: null, method: null, reference: null },
    project: { id: 'AT-P-2027-014', status: 'not_started', team: null, startedAt: null },
    activity: [],
  };
}
function fail(code, message) { throw new WorkflowError(code, message); }
function requireRole(role, expected) { if (role !== expected) fail('FORBIDDEN', 'هذا الإجراء لا يُتاح لهذا الدور.'); }
function requireTrue(value, message) { if (!value) fail('PRECONDITION', message); }
function str(value) { return typeof value === 'string' ? value.trim() : ''; }
function record(state, action, role, message, at) {
  state.activity.unshift({ id: state.revision + 1, action, role, message, at });
  state.revision += 1;
}
export function quoteValid(q) {
  return q && q.totalCents > 0 && q.subtotalCents >= 0 && q.discountCents >= 0 &&
    q.totalCents === q.subtotalCents - q.discountCents && Array.isArray(q.lines) && q.lines.length > 0;
}
export function minimumFirstPaymentCents(quote) { return Math.ceil(quote.totalCents * 0.20); }
export function gateSummary(s) {
  const selected = s.visit.outcome === OUTCOMES.READY;
  const sent = s.quote.status === 'sent' || s.quote.status === 'accepted';
  const customerAccepted = s.clientReview.status === 'accepted' && s.clientReview.acceptedQuoteVersion === s.quote.version;
  const contractAccepted = s.contract.status === 'accepted';
  const installmentVerified = s.installment.status === 'verified';
  const projectStarted = s.project.status === 'active';
  const steps = [
    { key:'quote', label:'إرسال العرض المعتمد', role:ROLES.REP, done:sent, blocked:!selected },
    { key:'client',label:'موافقة العميل على العرض', role:ROLES.CLIENT, done:customerAccepted, blocked:!sent },
    { key:'contract',label:'اعتماد العقد',role:ROLES.CLIENT,done:contractAccepted,blocked:!customerAccepted },
    { key:'payment',label:'التحقق من الدفعة الأولى',role:ROLES.ADMIN,done:installmentVerified,blocked:!contractAccepted },
    { key:'project',label:'تكليف فريق وبدء التنفيذ',role:ROLES.ADMIN,done:projectStarted,blocked:!installmentVerified },
  ];
  const current = steps.find(x=>!x.done);
  return { steps, complete: steps.every(x=>x.done), current, selected, sent, customerAccepted, contractAccepted, installmentVerified, projectStarted };
}
/**
 * transition never trusts an action payload to assign role. `role` must come from authenticated server session in production.
 * `at` is injected for deterministic tests. UI has simulated roles only.
 */
export function transition(currentState, action, role, at = new Date().toISOString()) {
  if (!currentState || currentState.schemaVersion !== 1) fail('SCHEMA', 'حالة غير متوافقة مع هذا الإصدار.');
  const s = structuredClone(currentState);
  const type = action?.type;
  switch (type) {
    case 'SELECT_OUTCOME': {
      requireRole(role, ROLES.REP);
      requireTrue(s.visit.status === 'active', 'الزيارة مغلقة؛ لا يمكن تغيير نتيجتها.');
      requireTrue(Object.values(OUTCOMES).includes(action.outcome), 'اختر نتيجة متاحة.');
      requireTrue(!s.clientReview || s.clientReview.status !== 'accepted', 'لا تغيّر النتيجة بعد قبول العميل؛ راجع مسؤول المبيعات.');
      s.visit.outcome = action.outcome;
      record(s, type, role, 'اختار المندوب نتيجة الزيارة.', at); break;
    }
    case 'SEND_QUOTE': {
      requireRole(role, ROLES.REP);
      requireTrue(s.visit.outcome === OUTCOMES.READY, 'اختر «موافق ومستعد للتعاقد» أولًا.');
      requireTrue(quoteValid(s.quote), 'راجع أسعار العرض والخصم.');
      requireTrue(s.installment.amountCents >= minimumFirstPaymentCents(s.quote), 'الدفعة الأولى أقل من 20% من صافي العرض.');
      requireTrue(s.quote.status === 'draft', 'العرض مُرسل أو معتمد بالفعل.');
      s.quote.status = 'sent';
      s.contract.status = 'pending_client';
      s.installment.status = 'not_issued';
      record(s, type, role, 'أرسل المندوب نسخة العرض للعميل.', at); break;
    }
    case 'ACCEPT_QUOTE': {
      requireRole(role, ROLES.CLIENT);
      requireTrue(s.quote.status === 'sent', 'العرض غير مرسل أو لم يعد صالحًا للموافقة.');
      requireTrue(action.confirm === true, 'راجع العرض وأكّد اطلاعك على البنود والسعر.');
      s.clientReview = { status:'accepted', acceptedQuoteVersion:s.quote.version, at };
      s.quote.status = 'accepted';
      record(s, type, role, 'وافق العميل بنفسه على نسخة العرض.', at); break;
    }
    case 'ACCEPT_CONTRACT': {
      requireRole(role, ROLES.CLIENT);
      requireTrue(gateSummary(s).customerAccepted, 'يجب أن يوافق العميل على العرض قبل العقد.');
      requireTrue(s.contract.status === 'pending_client', 'العقد غير جاهز أو معتمد مسبقًا.');
      requireTrue(action.confirm === true, 'راجع العقد وأكّد الموافقة عليه بنفسك.');
      s.contract.status = 'accepted'; s.contract.acceptedAt = at;
      s.installment.status = 'pending_payment';
      record(s, type, role, 'اعتمد العميل نموذج العقد التجريبي.', at); break;
    }
    case 'MARK_PAYMENT_INTENT': {
      requireRole(role, ROLES.CLIENT);
      requireTrue(s.contract.status === 'accepted', 'يجب اعتماد العقد أولًا.');
      requireTrue(s.installment.status === 'pending_payment', 'الدفعة ليست قيد الانتظار.');
      s.installment.intent = true;
      record(s, type, role, 'أبدى العميل استعداده لدفع الدفعة الأولى؛ لم يتم تأكيد التحصيل.', at); break;
    }
    case 'VERIFY_FIRST_PAYMENT': {
      requireRole(role, ROLES.ADMIN);
      requireTrue(s.contract.status === 'accepted', 'يجب اعتماد العقد أولًا.');
      requireTrue(s.installment.status === 'pending_payment', 'الدفعة مؤكدة أو غير مستحقة بعد.');
      requireTrue(s.installment.amountCents >= minimumFirstPaymentCents(s.quote), 'الدفعة الأولى لا تحقق الحد الأدنى.');
      const method = str(action.method); const reference = str(action.reference);
      requireTrue(['cash','bank','gateway'].includes(method), 'حدد وسيلة التحصيل.');
      requireTrue(reference.length >= 5, 'أدخل مرجع إيصال أو تحويل بعد التحقق منه.');
      requireTrue(action.checked === true, 'يجب تأكيد مراجعة دليل التحصيل قبل تسجيل الدفعة.');
      s.installment.status = 'verified'; s.installment.verifiedAt = at;
      s.installment.method = method; s.installment.reference = reference;
      record(s, type, role, 'سُجّل تأكيد الدفعة في بيئة التجربة بواسطة الإدارة.', at); break;
    }
    case 'START_PROJECT': {
      requireRole(role, ROLES.ADMIN);
      requireTrue(s.contract.status === 'accepted', 'العقد غير معتمد.');
      requireTrue(s.installment.status === 'verified', 'يلزم التحقق من استلام الدفعة الأولى.');
      requireTrue(s.project.status === 'not_started', 'المشروع بدأ بالفعل.');
      const team = str(action.team);
      requireTrue(team.length >= 3, 'اختر فريق التنفيذ المسؤول.');
      s.project.status = 'active'; s.project.team = team; s.project.startedAt = at;
      record(s, type, role, 'اعتمدت الإدارة بدء المشروع بعد استيفاء الشروط.', at); break;
    }
    case 'CLOSE_VISIT': {
      requireRole(role, ROLES.REP);
      requireTrue(s.visit.status === 'active', 'تم إنهاء هذه الزيارة مسبقًا.');
      requireTrue(s.visit.outcome !== null, 'اختر نتيجة الزيارة أولًا.');
      s.visit.status = 'completed'; s.visit.closedAt = at;
      record(s, type, role, 'حُفظ ملخص الزيارة، وتبقى حالة الطلب منفصلة ومحدّثة.', at); break;
    }
    default: fail('UNKNOWN_ACTION', 'الإجراء غير معروف.');
  }
  return s;
}
export function canExecute(s, type, role, data={}) {
  try { transition(s,{type,...data},role,'2027-01-01T00:00:00Z');return true; } catch { return false; }
}

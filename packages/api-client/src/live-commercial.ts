import type { Entity } from '@elvorance/contracts';
import type { ServerRecord } from './live-data.ts';
import { escapeHtml, lines, money, record } from './live-format.ts';
import { ApiError } from './index.ts';

export type CommercialKind = 'quote' | 'contract' | 'approval';
export interface CommercialDetail {
  kind: CommercialKind;
  value: ServerRecord;
  approval?: ServerRecord;
}
export function requireReviewable(value: ServerRecord): void {
  const integer = (input: unknown) =>
    typeof input === 'number' && Number.isSafeInteger(input) && input > 0;
  const valid =
    typeof value.id === 'string' &&
    integer(value.version) &&
    integer(value.totalMinor) &&
    typeof value.currency === 'string' &&
    /^[A-Z]{3}$/.test(value.currency) &&
    typeof value.terms === 'string' &&
    value.terms.length >= 3 &&
    Array.isArray(value.items) &&
    value.items.length > 0 &&
    value.items.every((item: unknown) => {
      const row = record(item);
      return typeof row.title === 'string' && integer(row.quantity) && integer(row.unitPriceMinor);
    }) &&
    Array.isArray(value.paymentPlan) &&
    value.paymentPlan.length > 0 &&
    value.paymentPlan.every((item: unknown) => integer(record(item).amountMinor)) &&
    value.paymentPlan.reduce(
      (sum: number, item: unknown) => sum + Number(record(item).amountMinor),
      0,
    ) === value.totalMinor;
  if (!valid)
    throw new ApiError(
      200,
      'invalid_response',
      'The server did not provide the complete terms required for a customer decision.',
    );
}
export function commercialReviewButton(section: string, row: Entity): string {
  const kind =
    section === 'quotes'
      ? 'quote'
      : section === 'contracts'
        ? 'contract'
        : section === 'approvals'
          ? 'approval'
          : null;
  return kind
    ? `<button type="button" class="btn btn-secondary" data-live-review="${kind}" data-id="${escapeHtml(row.id)}">مراجعة التفاصيل</button>`
    : '';
}
function scope(value: ServerRecord): string {
  const items = Array.isArray(value.items) ? value.items.map(record) : [];
  return (
    '<h3>الخدمات والنطاق</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>الخدمة</th><th>الكمية</th><th>سعر الوحدة</th></tr></thead><tbody>' +
    items
      .map(
        (item) =>
          `<tr><td><strong>${escapeHtml(item.title)}</strong>${item.duration ? `<p>${escapeHtml(item.duration)}</p>` : ''}${Array.isArray(item.deliverables) ? `<ul>${item.deliverables.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul>` : ''}</td><td>${escapeHtml(item.quantity)}</td><td>${escapeHtml(money(item.unitPriceMinor, value.currency))}</td></tr>`,
      )
      .join('') +
    '</tbody></table></div>'
  );
}
function payments(value: ServerRecord): string {
  const plan = Array.isArray(value.paymentPlan) ? value.paymentPlan.map(record) : [];
  return (
    '<h3>جدول الدفعات المتفق عليه</h3><ul>' +
    plan
      .map(
        (item) =>
          `<li>${escapeHtml(item.label)} — ${escapeHtml(money(item.amountMinor, value.currency))}${item.dueOn ? ` — ${escapeHtml(item.dueOn)}` : ''}</li>`,
      )
      .join('') +
    '</ul><p class="small muted">هذا الجدول يحدد المبالغ المستحقة؛ لا يسجل تحصيل أي دفعة.</p>'
  );
}
function terms(value: ServerRecord): string {
  const quote = record(value.quoteSnapshot);
  const subtotal = value.subtotalMinor ?? quote.subtotalMinor ?? value.totalMinor;
  const discount = value.discountMinor ?? quote.discountMinor ?? 0;
  return (
    scope(value) +
    `<dl><dt>الإجمالي قبل الخصم</dt><dd>${escapeHtml(money(subtotal, value.currency))}</dd><dt>الخصم</dt><dd>${escapeHtml(money(discount, value.currency))}</dd><dt>القيمة النهائية</dt><dd><strong>${escapeHtml(money(value.totalMinor, value.currency))}</strong></dd></dl>` +
    `<h3>الشروط</h3><p>${lines(value.terms)}</p>` +
    payments(value)
  );
}
function consent(label: string): string {
  return `<label class="checkbox-row"><input type="checkbox" name="consent" required> <span>${escapeHtml(label)}</span></label>`;
}
function quoteActions(value: ServerRecord): string {
  if (
    typeof value.validUntil === 'string' &&
    value.validUntil < new Date().toISOString().slice(0, 10)
  )
    return '<p class="notice">انتهت صلاحية هذا العرض. اطلب من المندوب نسخة محدثة.</p>';
  if (value.status !== 'sent')
    return '<p class="notice">سُجّل وضع هذا العرض؛ راجع العقود إذا كان مقبولًا.</p>';
  return (
    `<form class="card stack" data-live-form="quote-accept"><h3>قبول العرض</h3><label>تفضيلات أو ملاحظات الدفع <textarea class="textarea" name="paymentWishes" maxlength="2000"></textarea></label>${consent('قرأت نطاق الخدمات والقيمة النهائية والشروط وجدول الدفعات، وأوافق على هذا العرض.')}<button class="btn btn-primary" type="submit">تأكيد قبول العرض</button><p class="small muted">بعد القبول يظهر عقد للمراجعة والموافقة المستقلة.</p></form>` +
    `<form class="card stack" data-live-form="quote-changes"><h3>طلب تعديل</h3><label>التعديلات المطلوبة <textarea class="textarea" name="reason" required minlength="3" maxlength="3000"></textarea></label><button class="btn btn-secondary" type="submit">إرسال طلب التعديل</button></form>` +
    `<form class="card stack" data-live-form="quote-reject"><h3>رفض العرض</h3><label>سبب الرفض <textarea class="textarea" name="reason" required minlength="3" maxlength="3000"></textarea></label><button class="btn btn-secondary" type="submit">تأكيد رفض العرض</button></form>`
  );
}
function contractActions(value: ServerRecord): string {
  if (value.status !== 'pending')
    return `<p class="notice">تمت الموافقة على العقد باسم ${escapeHtml(value.signerName)}${value.approvedAt ? ` بتاريخ ${escapeHtml(value.approvedAt)}` : ''}.</p>`;
  return `<form class="card stack" data-live-form="contract-approve"><h3>الموافقة على العقد</h3><label>الاسم الكامل للموقّع <input class="input" name="signerName" required minlength="2" maxlength="150" autocomplete="name"></label>${consent('قرأت هذا العقد بما يشمله من نطاق وشروط وجدول دفعات، وأؤكد موافقتي باسمي المكتوب.')}<button class="btn btn-primary" type="submit">تأكيد الموافقة على العقد</button></form>`;
}
function approvalActions(approval: ServerRecord, quote: ServerRecord): string {
  if (approval.status !== 'pending' || quote.status !== 'draft')
    return `<p class="notice">حالة القرار: ${escapeHtml(approval.status)}. ${escapeHtml(approval.decisionNote)}</p>`;
  return `<form class="card stack" data-live-form="discount-decision"><h3>قرار الإدارة</h3><label>القرار <select class="select" name="decision" required><option value="">اختر القرار بعد المراجعة</option><option value="approved">الموافقة على الاستثناء التجاري</option><option value="rejected">رفض الاستثناء التجاري</option></select></label><label>سبب القرار <textarea class="textarea" name="note" required minlength="3" maxlength="2000"></textarea></label>${consent('راجعت النطاق والقيمة والخصم والدفعات، وأثبت القرار المحدد لهذه النسخة من العرض.')}<button class="btn btn-primary" type="submit">حفظ القرار</button></form>`;
}
export function commercialDetail(
  detail: CommercialDetail,
  role: 'rep' | 'client' | 'admin',
): string {
  const { kind, value, approval } = detail;
  const title =
    kind === 'contract'
      ? 'مراجعة العقد'
      : kind === 'approval'
        ? 'مراجعة الاستثناء التجاري'
        : 'مراجعة عرض الأسعار';
  const actions =
    role === 'client' && kind === 'quote'
      ? quoteActions(value)
      : role === 'client' && kind === 'contract'
        ? contractActions(value)
        : role === 'admin' && kind === 'approval' && approval
          ? approvalActions(approval, value)
          : '';
  return `<button class="btn btn-secondary" type="button" data-live-back>العودة إلى القائمة</button><article class="card"><h2>${title}</h2><p><strong>${escapeHtml(value.customerName)}</strong></p><p>المرجع: ${escapeHtml(value.id)}</p>${value.validUntil ? `<p>صالح حتى: ${escapeHtml(value.validUntil)}</p>` : ''}${approval ? `<h3>سبب طلب المندوب</h3><p>${lines(approval.reason)}</p>` : ''}${terms(value)}</article>${actions}`;
}

export const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char] ?? char,
  );

export function money(amount: unknown, currency: unknown): string {
  if (
    typeof amount !== 'number' ||
    !Number.isSafeInteger(amount) ||
    typeof currency !== 'string' ||
    !/^[A-Z]{3}$/.test(currency)
  )
    return 'غير محدد';
  return new Intl.NumberFormat('ar', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}
export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function lines(value: unknown): string {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

const statusLabels: Readonly<Record<string, string>> = Object.freeze({
  new: 'جديد',
  qualified: 'مؤهل',
  customer: 'عميل',
  lost: 'لم تكتمل الفرصة',
  draft: 'مسودة',
  pending: 'بانتظار الإجراء',
  approved: 'تمت الموافقة',
  rejected: 'مرفوض',
  sent: 'تم الإرسال',
  accepted: 'مقبول',
  changes_requested: 'مطلوب تعديل',
  cancelled: 'ملغي',
  superseded: 'استُبدل بنسخة أحدث',
  scheduled: 'مجدول',
  active: 'نشط',
  completed: 'مكتمل',
  disabled: 'معطل',
  paused: 'متوقف مؤقتاً',
  stopped: 'متوقف',
  open: 'مفتوح',
  resolved: 'تم الحل',
  part_paid: 'مسدد جزئياً',
  paid: 'مسدد',
  in_progress: 'قيد التنفيذ',
  done: 'منجز',
  planning: 'قيد التخطيط',
});

export function statusLabel(value: unknown): string {
  return typeof value === 'string' && Object.hasOwn(statusLabels, value)
    ? statusLabels[value]!
    : 'حالة غير معروفة';
}

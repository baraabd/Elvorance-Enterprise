import { isolatedText, statePanel } from '@elvorance/ui/enterprise-ux';
import { ApiError } from '@elvorance/api-client';
import type { RecordValue } from '../api.ts';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = '',
  className = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export const words = (value: unknown, fallback = '—'): string =>
  typeof value === 'string' && value ? value : fallback;
export const amount = (value: unknown, currency: unknown = 'SAR'): string => {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat('ar-SA', {
      style: 'currency',
      currency: words(currency, 'SAR'),
    }).format(number / 100);
  } catch {
    return `${number / 100} ${words(currency, 'SAR')}`;
  }
};
export const dateText = (value: unknown): string => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat('ar-SA', {
    dateStyle: 'medium',
    ...(value.includes('T') ? { timeStyle: 'short' as const } : {}),
  }).format(new Date(value));
};
const labels: Record<string, string> = {
  scheduled: 'مجدولة',
  active: 'نشطة',
  completed: 'مكتملة',
  cancelled: 'ملغاة',
  draft: 'مسودة',
  sent: 'مرسل',
  accepted: 'مقبول',
  rejected: 'مرفوض',
  changes_requested: 'مطلوب تعديله',
  pending: 'قيد الانتظار',
  approved: 'معتمد',
  open: 'مفتوحة',
  done: 'مكتملة',
  resolved: 'مغلقة',
  planned: 'مخططة',
  new: 'جديدة',
  qualified: 'مؤهلة',
  proposal: 'عرض مقدم',
  negotiation: 'تفاوض',
  won: 'مكتسبة',
  lost: 'غير مكتملة',
  paused: 'متوقفة مؤقتًا',
  stopped: 'متوقفة',
  paid: 'مدفوعة',
  partially_paid: 'مدفوعة جزئيًا',
  unpaid: 'غير مدفوعة',
  submitted: 'مكتمل',
};
export const statusText = (value: unknown): string => labels[words(value, '')] ?? words(value);
export function button(
  label: string,
  handler: () => void | Promise<void>,
  signal: AbortSignal,
  className = 'button',
): HTMLButtonElement {
  const node = el('button', label, className);
  node.type = 'button';
  node.addEventListener(
    'click',
    () => {
      if (node.disabled) return;
      const previousBusy = node.getAttribute('aria-busy');
      node.disabled = true;
      node.setAttribute('aria-busy', 'true');
      void Promise.resolve()
        .then(handler)
        .catch((error: unknown) => {
          node.dispatchEvent(new CustomEvent('rep:error', { bubbles: true, detail: error }));
        })
        .finally(() => {
          node.disabled = false;
          if (previousBusy === null) node.removeAttribute('aria-busy');
          else node.setAttribute('aria-busy', previousBusy);
        });
    },
    { signal },
  );
  return node;
}
export function heading(title: string, subtitle?: string): HTMLElement {
  const node = el('header', '', 'page-heading');
  node.append(el('h1', title));
  if (subtitle) node.append(el('p', subtitle, 'muted'));
  return node;
}
export function card(title: string, subtitle?: string): HTMLElement {
  const node = el('article', '', 'card');
  node.append(el('h2', title));
  if (subtitle) node.append(el('p', subtitle, 'muted'));
  return node;
}
export function detail(node: HTMLElement, label: string, value: unknown): void {
  const row = el('p', '', 'detail');
  row.append(el('strong', label + ': '), isolatedText(words(value)));
  node.append(row);
}
export function rows(
  container: HTMLElement,
  values: RecordValue[],
  render: (value: RecordValue) => HTMLElement,
): void {
  if (!values.length) {
    container.append(statePanel('empty', 'لا توجد سجلات لعرضها بعد.'));
    return;
  }
  const list = el('div', '', 'cards');
  list.append(...values.map(render));
  container.append(list);
}
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'انتهت الجلسة أو تعذّر التحقق منها. سجّل الدخول مجددًا.';
    if (error.status === 403 || error.status === 404)
      return 'السجل غير متاح لحسابك. حدّث الصفحة للتحقق من الصلاحيات.';
    if (error.status === 409)
      return 'تغيّر السجل أو لم تتحقق شروط العملية. حدّث البيانات وراجع الحالة قبل إعادة الحفظ.';
    if (error.code === 'timeout')
      return 'لم يصل تأكيد العملية. أعد المحاولة بالبيانات نفسها للتحقق دون تكرار العملية.';
    if (error.status >= 500) return 'الخدمة غير متاحة حاليًا. حاول مرة أخرى لاحقًا.';
    return 'تعذّر حفظ البيانات. راجع الحقول وشروط العملية ثم حاول مجددًا.';
  }
  if (error instanceof Error && /[\u0600-\u06ff]/.test(error.message)) return error.message;
  return 'تعذّر الاتصال بالخدمة. تحقق من الشبكة وحاول مجددًا.';
}

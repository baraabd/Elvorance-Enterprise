import { object } from './api.ts';
export interface Field {
  key: string;
  label: string;
  type?:
    | 'text'
    | 'email'
    | 'tel'
    | 'date'
    | 'datetime-local'
    | 'number'
    | 'textarea'
    | 'select'
    | 'checkbox'
    | 'lines'
    | 'json'
    | 'rows';
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
  choices?: readonly string[];
  fields?: Field[];
  default?: unknown;
}
export function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  text = '',
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  node.textContent = text;
  return node;
}
export function button(doc: Document, text: string, action: () => void) {
  const node = el(doc, 'button', text);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}
const translations: Record<string, string> = {
  admin: 'إدارة',
  rep: 'مندوب',
  client: 'عميل',
  finance: 'مالية',
  delivery: 'تنفيذ',
  support: 'دعم',
  page: 'الصفحة الحالية',
  all: 'جميع الصفحات ضمن حد القراءة',
  name: 'الاسم',
  updatedAt: 'آخر تحديث',
  asc: 'تصاعدي',
  desc: 'تنازلي',
  active: 'نشط',
  disabled: 'معطل',
  new: 'جديد',
  qualified: 'مؤهل',
  customer: 'عميل حالي',
  lost: 'مفقود',
  open: 'مفتوح',
  done: 'منجز',
  cancelled: 'ملغى',
  low: 'منخفض',
  normal: 'عادي',
  high: 'مرتفع',
  proposal: 'عرض',
  negotiation: 'تفاوض',
  won: 'فوز بعقد معتمد',
  approved: 'موافق',
  rejected: 'مرفوض',
  planned: 'مخطط',
  completed: 'مكتمل',
  in_progress: 'قيد التنفيذ',
  resolved: 'محلول',
  pending: 'بانتظار الإجراء',
  submitted: 'مقدّم',
  in_review: 'قيد المراجعة',
  accepted: 'مقبول',
  declined: 'مرفوض',
  bank_transfer: 'تحويل بنكي',
  cash: 'نقد',
  external_provider: 'مزود خارجي',
};
export function label(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  return translations[String(value)] ?? String(value);
}
export function fields(doc: Document, definitions: Field[], initial: Record<string, unknown> = {}) {
  const root = el(doc, 'div');
  root.className = 'admin-fields';
  const readers: (() => [string, unknown])[] = [];
  for (const field of definitions) {
    const value = initial[field.key] ?? field.default;
    if (field.type === 'rows') {
      const group = el(doc, 'fieldset');
      group.append(el(doc, 'legend', field.label));
      const children: ReturnType<typeof fields>[] = [];
      const add = (value: Record<string, unknown> = {}) => {
        if (children.length >= (field.max ?? 40)) return;
        const child = fields(doc, field.fields ?? [], value);
        const wrapper = el(doc, 'fieldset');
        wrapper.append(el(doc, 'legend', field.label), child.root);
        wrapper.append(
          button(doc, `إزالة بند: ${field.label}`, () => {
            children.splice(children.indexOf(child), 1);
            wrapper.remove();
          }),
        );
        children.push(child);
        group.insertBefore(wrapper, addButton);
      };
      const addButton = button(doc, `إضافة بند: ${field.label}`, () => add());
      group.append(addButton);
      if (Array.isArray(value)) value.forEach((entry) => add(object(entry)));
      readers.push(() => {
        if (children.length < (field.min ?? (field.required ? 1 : 0)))
          throw new Error(`أكمل ${field.label}.`);
        return [field.key, children.map((child) => child.read())];
      });
      root.append(group);
      continue;
    }
    const wrapper = el(doc, 'label', field.label + (field.required ? ' *' : ''));
    const control =
      field.type === 'select'
        ? el(doc, 'select')
        : ['textarea', 'lines', 'json'].includes(field.type ?? '')
          ? el(doc, 'textarea')
          : el(doc, 'input');
    control.name = field.key;
    control.required = field.required ?? false;
    if (control.tagName === 'INPUT') {
      const input = control as HTMLInputElement;
      input.type = [
        'text',
        'email',
        'tel',
        'date',
        'datetime-local',
        'number',
        'checkbox',
      ].includes(field.type ?? '')
        ? (field.type ?? 'text')
        : 'text';
      if (field.type === 'checkbox') input.checked = value === true;
      if (field.type === 'number') {
        input.min = String(field.min ?? 0);
        input.max = String(field.max ?? 100_000_000_000);
        input.step = field.step ?? '1';
      }
    }
    if (field.type === 'select')
      for (const choice of field.choices ?? []) {
        const option = el(doc, 'option', label(choice));
        option.value = choice;
        control.append(option);
      }
    if (field.type !== 'checkbox') {
      control.value =
        field.type === 'json'
          ? JSON.stringify(value ?? {}, null, 2)
          : field.type === 'lines' && Array.isArray(value)
            ? value.join('\n')
            : field.type === 'datetime-local' && typeof value === 'string'
              ? localDateTime(value)
              : value == null
                ? ''
                : String(value);
    }
    if (['text', 'email', 'tel', 'textarea'].includes(field.type ?? 'text')) {
      const input = control as HTMLInputElement | HTMLTextAreaElement;
      input.minLength = field.min ?? (field.required ? 1 : 0);
      input.maxLength = field.max ?? 3000;
    }
    if (['email', 'tel', 'date', 'datetime-local', 'number', 'json'].includes(field.type ?? ''))
      control.dir = 'ltr';
    wrapper.append(control);
    root.append(wrapper);
    readers.push(() => {
      const text = control.value.trim();
      if (field.type === 'checkbox') return [field.key, (control as HTMLInputElement).checked];
      if (field.required && !text) throw new Error(`أكمل ${field.label}.`);
      if (field.type === 'number') {
        const number = Number(text);
        if (
          !text ||
          !Number.isFinite(number) ||
          (field.step !== '0.01' && !Number.isSafeInteger(number)) ||
          number < (field.min ?? 0) ||
          number > (field.max ?? 100_000_000_000)
        )
          throw new Error(`قيمة ${field.label} غير صالحة.`);
        return [field.key, number];
      }
      if (field.type === 'datetime-local') {
        if (!text || Number.isNaN(Date.parse(text)))
          throw new Error(`قيمة ${field.label} غير صالحة.`);
        return [field.key, new Date(text).toISOString()];
      }
      if (field.type === 'lines')
        return [
          field.key,
          text
            .split('\n')
            .map((value) => value.trim())
            .filter(Boolean),
        ];
      if (field.type === 'json') {
        try {
          return [field.key, JSON.parse(text) as unknown];
        } catch {
          throw new Error(`صيغة JSON غير صالحة: ${field.label}.`);
        }
      }
      if (field.type === 'select' && !field.choices?.includes(text))
        throw new Error(`اختر قيمة صالحة: ${field.label}.`);
      return [field.key, field.type === 'date' && !text ? null : text];
    });
  }
  return {
    root,
    read: () => Object.fromEntries(readers.map((read) => read())) as Record<string, unknown>,
  };
}
function localDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

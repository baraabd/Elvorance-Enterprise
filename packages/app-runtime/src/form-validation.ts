/** Browser input guard shared by the three frontends; server validation remains authoritative. */
export interface FormField {
  disabled?: boolean;
  type?: string;
  value?: unknown;
  name?: string;
  min?: string;
  max?: string;
  setCustomValidity?: (value: string) => void;
  reportValidity?: () => boolean;
  focus?: () => void;
}

const normalizeDigits = (value: unknown): string =>
  String(value)
    .replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - 0x660))
    .replace(/[\u06F0-\u06F9]/g, (ch) => String(ch.charCodeAt(0) - 0x6f0));
export function fieldProblem(input: FormField | null | undefined): string {
  if (
    !input ||
    input.disabled ||
    input.type === 'hidden' ||
    input.type === 'file' ||
    input.type === 'checkbox' ||
    input.type === 'radio'
  )
    return '';
  const value = String(input.value ?? '').trim();
  if (!value) return '';
  const name = String(input.name || '').toLowerCase();
  if (input.type === 'tel' || /(^phone$|^mobile$|phone_number$|_phone$)/.test(name)) {
    return /^\+?[\d\s()\-]{7,22}$/.test(normalizeDigits(value))
      ? ''
      : 'رقم الهاتف يقبل الأرقام والرمز + والفواصل والمسافات فقط (7–22 خانة).';
  }
  if (input.type === 'email' || name === 'email')
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ? '' : 'أدخل بريدًا إلكترونيًا صحيحًا.';
  if (
    input.type === 'number' ||
    /^(?:amount|discount|price|qty|quantity|budget|percentage|total|unitprice|target)$/.test(name)
  ) {
    const n = Number(normalizeDigits(value));
    if (!Number.isFinite(n) || /[a-z\u0621-\u064a]/i.test(value))
      return 'يجب أن يحتوي الحقل الرقمي على أرقام فقط.';
    if (input.type === 'number' && input.min != null && input.min !== '' && n < Number(input.min))
      return `الحد الأدنى ${input.min}.`;
    if (input.type === 'number' && input.max != null && input.max !== '' && n > Number(input.max))
      return `الحد الأعلى ${input.max}.`;
  }
  return '';
}
export function validateFormFields(form: HTMLFormElement): boolean {
  for (const field of Array.from(
    form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input,textarea,select',
    ),
  )) {
    field.setCustomValidity?.('');
    const problem = fieldProblem(field);
    if (problem) {
      field.setCustomValidity?.(problem);
      field.reportValidity?.();
      field.focus?.();
      return false;
    }
  }
  return true;
}

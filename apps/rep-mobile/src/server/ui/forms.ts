import { describeWith } from '@elvorance/ui/enterprise-ux';
import { button, el, errorMessage } from './dom.ts';

let fieldSequence = 0;

export interface Choice {
  value: string;
  label: string;
}
export interface Field {
  name: string;
  label: string;
  type?:
    | 'text'
    | 'email'
    | 'tel'
    | 'number'
    | 'date'
    | 'datetime-local'
    | 'textarea'
    | 'select'
    | 'checkbox'
    | 'multiselect';
  value?: unknown;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Choice[];
  hint?: string;
  formatValue?: (value: unknown) => unknown;
}
export function fieldControl(
  field: Field,
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const control =
    field.type === 'textarea'
      ? el('textarea')
      : field.type === 'select' || field.type === 'multiselect'
        ? el('select')
        : el('input');
  control.name = field.name;
  do control.id = `rep-field-${++fieldSequence}`;
  while (document.getElementById(control.id));
  control.dir = ['email', 'tel', 'number', 'date', 'datetime-local'].includes(field.type ?? '')
    ? 'ltr'
    : 'auto';
  control.required = field.required ?? false;
  if (control instanceof HTMLInputElement) {
    control.type = field.type ?? 'text';
    if (field.type === 'checkbox') control.checked = field.value === true;
    if (field.min !== undefined) control.min = String(field.min);
    if (field.max !== undefined) control.max = String(field.max);
    if (field.step !== undefined) control.step = String(field.step);
  }
  if (control instanceof HTMLSelectElement) {
    control.multiple = field.type === 'multiselect';
    if (!control.multiple && !control.required) control.append(new Option('بدون اختيار', ''));
    for (const item of field.options ?? []) {
      const option = new Option(item.label, item.value);
      option.selected = Array.isArray(field.value)
        ? field.value.includes(item.value)
        : item.value === field.value;
      control.append(option);
    }
  } else if (field.type !== 'checkbox' && field.value !== null && field.value !== undefined) {
    control.value = String(field.value);
  }
  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
    if (field.type !== 'number' && field.type !== 'checkbox')
      control.maxLength = field.max ?? (field.type === 'textarea' ? 5000 : 200);
    if (
      field.min !== undefined &&
      ['text', 'textarea', 'email', 'tel', undefined].includes(field.type)
    )
      control.minLength = field.min;
  }
  return control;
}
export function addField(form: HTMLElement, field: Field): ReturnType<typeof fieldControl> {
  const label = el('label', '', 'field');
  label.append(el('span', field.label));
  const control = fieldControl(field);
  label.append(control);
  if (field.hint) {
    const hint = el('small', field.hint, 'muted');
    hint.id = `${control.id}-hint`;
    describeWith(control, hint.id);
    label.append(hint);
  }
  form.append(label);
  return control;
}
export function fieldValues(form: HTMLFormElement, fields: Field[]): Record<string, unknown> {
  const data = new FormData(form);
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const value = data.get(field.name);
    values[field.name] =
      field.type === 'checkbox'
        ? value !== null
        : field.type === 'multiselect'
          ? data.getAll(field.name).map(String)
          : field.type === 'number'
            ? value === '' || value === null
              ? null
              : Number(value)
            : String(value ?? '').trim();
  }
  return values;
}
export function commandForm(options: {
  title: string;
  fields: Field[];
  signal: AbortSignal;
  submitLabel?: string;
  submit: (values: Record<string, unknown>, form: HTMLFormElement) => Promise<void>;
}): HTMLFormElement {
  const form = el('form', '', 'card command-form');
  form.append(el('h2', options.title));
  for (const field of options.fields) addField(form, field);
  const output = el('p', '', 'form-status');
  output.setAttribute('role', 'status');
  const submit = el('button', options.submitLabel ?? 'حفظ', 'button primary');
  submit.type = 'submit';
  form.append(output, submit);
  let busy = false;
  form.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      if (busy || options.signal.aborted || !form.reportValidity()) return;
      const values = fieldValues(form, options.fields);
      busy = true;
      // Inert blocks editing without excluding dynamic fields from FormData.
      const wasInert = form.inert === true;
      form.inert = true;
      submit.disabled = true;
      output.setAttribute('role', 'status');
      output.textContent = 'جارٍ الحفظ…';
      form.setAttribute('aria-busy', 'true');
      // Form data remains intact after a network failure, including its idempotency intent.
      void options
        .submit(values, form)
        .then(() => {
          if (!options.signal.aborted) output.textContent = 'تم الحفظ.';
        })
        .catch((error: unknown) => {
          if (!options.signal.aborted) {
            output.setAttribute('role', 'alert');
            output.textContent = errorMessage(error);
          }
        })
        .finally(() => {
          busy = false;
          form.inert = wasInert;
          submit.disabled = false;
          form.removeAttribute('aria-busy');
        });
    },
    { signal: options.signal },
  );
  return form;
}
export function editorButton(
  label: string,
  parent: HTMLElement,
  create: () => HTMLFormElement | Promise<HTMLFormElement>,
  signal: AbortSignal,
): HTMLButtonElement {
  return button(
    label,
    async () => {
      const previous = parent.querySelector(':scope > .editor');
      if (previous) {
        if (previous.querySelector('form[aria-busy="true"]'))
          throw new Error('انتظر تأكيد الحفظ قبل إغلاق النموذج أو تغييره.');
        const same = (previous as HTMLElement).dataset.editor === label;
        previous.remove();
        if (same) return;
      }
      const host = el('div', '', 'editor');
      host.dataset.editor = label;
      const form = await create();
      if (signal.aborted) return;
      host.append(form);
      parent.append(host);
      host.querySelector<HTMLElement>('input,select,textarea')?.focus();
    },
    signal,
  );
}

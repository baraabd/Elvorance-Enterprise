/** v1.1 markup variants. Keep DOM shape and attribute order stable. */
type Escape = (value: unknown) => string;
interface FormOptions {
  type?: string;
  required?: boolean;
  min?: number | string;
  max?: number | string;
  minlength?: number;
  maxlength?: number;
  step?: number | string;
  placeholder?: string;
  help?: string;
  rows?: number;
}
interface SelectChoice {
  id: string;
  name: string;
}

export function createClientForms({ E }: { E: Escape }) {
  const field = (title: string, name: string, value: unknown = '', options: FormOptions = {}) =>
    `<label class="field"><span>${E(title)}</span><input class="input" name="${E(name)}" type="${E(options.type || 'text')}" value="${E(value)}" ${options.required === false ? '' : 'required'} ${options.min != null ? `min="${E(options.min)}"` : ''} ${options.max != null ? `max="${E(options.max)}"` : ''} ${options.minlength ? `minlength="${E(options.minlength)}"` : ''} ${options.maxlength ? `maxlength="${E(options.maxlength)}"` : 'maxlength="250"'} ${options.step ? `step="${E(options.step)}"` : ''} ${options.placeholder ? `placeholder="${E(options.placeholder)}"` : ''} ${['email', 'tel', 'number', 'date'].includes(options.type ?? '') ? 'dir="ltr"' : ''}>${options.help ? `<small class="muted">${E(options.help)}</small>` : ''}</label>`;
  const area = (title: string, name: string, value: unknown = '', options: FormOptions = {}) =>
    `<label class="field"><span>${E(title)}</span><textarea class="textarea" name="${E(name)}" rows="${options.rows || 4}" maxlength="${options.maxlength || 3000}" ${options.required === false ? '' : 'required'} ${options.minlength ? `minlength="${options.minlength}"` : ''} placeholder="${E(options.placeholder || '')}">${E(value)}</textarea></label>`;
  const select = (title: string, name: string, options: Array<[string, string]>, selected = '', required = true) =>
    `<label class="field"><span>${E(title)}</span><select class="select" name="${E(name)}" ${required ? 'required' : ''}>${options.map(([value, text]) => `<option value="${E(value)}" ${value === selected ? 'selected' : ''}>${E(text)}</option>`).join('')}</select></label>`;
  return {
    field,
    area,
    select,
  };
}
export function createAdminForms({
  E,
  action,
  icon,
}: {
  E: Escape;
  action: (name: string, label: string, ico: string | null, attrs: string, cls: string) => string;
  icon: (name: string) => string;
}) {
  const input = (label: string, name: string, value: unknown, type?: string, extra?: string) =>
    `<label class="field"><span>${E(label)}</span><input class="input" name="${E(name)}" type="${type || 'text'}" value="${E(value)}" ${extra || ''}></label>`;
  const textarea = (label: string, name: string, value: unknown, extra?: string) =>
    `<label class="field"><span>${E(label)}</span><textarea class="textarea" name="${E(name)}" rows="3" ${extra || ''}>${E(value)}</textarea></label>`;
  const options = (values: Record<string, unknown>, current: unknown) =>
    Object.entries(values)
      .map(
        ([value, label]) =>
          `<option value="${E(value)}"${String(current) === value ? ' selected' : ''}>${E(label)}</option>`,
      )
      .join('');
  const select = (label: string, name: string, values: Record<string, unknown>, current: unknown, extra?: string) =>
    `<label class="field"><span>${E(label)}</span><select class="select" name="${E(name)}" ${extra || ''}>${options(values, current)}</select></label>`;
  const choices = (items: SelectChoice[], selected: string[], name: string, getName?: (item: SelectChoice) => string) =>
    `<div class="admin-checks">${items.map((item) => `<label class="checkbox-row"><input type="checkbox" name="${E(name)}" value="${E(item.id)}"${selected.includes(item.id) ? ' checked' : ''}><span>${E(getName ? getName(item) : item.name)}</span></label>`).join('')}</div>`;
  const selectedChecks = (form: HTMLFormElement, name: string) =>
    Array.from(form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`), (el) => el.value);
  const form = (handler: string, content: string, id?: string, submit?: string) =>
    `<form data-submit="${E(handler)}"${id ? ` data-id="${E(id)}"` : ''}>${content}<div class="form-actions">${action('close-modal', 'إلغاء', null, '', 'btn btn-ghost')}<button type="submit" class="btn btn-primary">${icon('check')}<span>${E(submit || 'حفظ التغييرات')}</span></button></div></form>`;
  return {
    input,
    textarea,
    options,
    select,
    choices,
    selectedChecks,
    form,
  };
}

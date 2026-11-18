import { addField, fieldValues, type Field } from './forms.ts';
import { button, el } from './dom.ts';

export function repeatingFields(
  form: HTMLFormElement,
  title: string,
  fields: Field[],
  initial: Record<string, unknown>[],
  signal: AbortSignal,
  maximum: number,
) {
  const section = el('fieldset');
  section.append(el('legend', title));
  const entries: { node: HTMLElement; fields: Field[]; id: string }[] = [];
  function append(value: Record<string, unknown> = {}): void {
    if (entries.length >= maximum) return;
    const id = typeof value.id === 'string' ? value.id : crypto.randomUUID();
    const prefix = crypto.randomUUID();
    const row = el('div', '', 'repeat-row');
    const scoped = fields.map((field) => ({
      ...field,
      name: `${prefix}_${field.name}`,
      value: value[field.name] ?? field.value,
    }));
    for (const field of scoped) addField(row, field);
    const entry = { node: row, fields: scoped, id };
    entries.push(entry);
    row.append(
      button(
        'إزالة البند',
        () => {
          if (entries.length === 1) return;
          entries.splice(entries.indexOf(entry), 1);
          row.remove();
          form.dispatchEvent(new Event('input', { bubbles: true }));
        },
        signal,
        'button subtle',
      ),
    );
    section.insertBefore(row, add);
  }
  const add = button('إضافة بند', () => append(), signal);
  section.append(add);
  for (const value of initial.length ? initial : [{}]) append(value);
  form.insertBefore(section, form.querySelector('.form-status'));
  return {
    section,
    values: () =>
      entries.map((entry) => {
        const values = fieldValues(form, entry.fields);
        const result: Record<string, unknown> = { id: entry.id };
        fields.forEach((field, index) => {
          result[field.name] = values[entry.fields[index]!.name];
        });
        return result;
      }),
    setFirst: (name: string, value: string) => {
      const index = fields.findIndex((field) => field.name === name);
      const entry = entries[0];
      if (index < 0 || !entry) return;
      const input = form.elements.namedItem(entry.fields[index]!.name);
      if (input instanceof HTMLInputElement) input.value = value;
    },
  };
}
/** Parse decimal input without floating-point multiplication or rounding surprises. */
export function minorUnits(input: unknown): number {
  const match = /^(\d{1,10})(?:[.,](\d{1,2}))?$/.exec(String(input ?? '').trim());
  if (!match) throw new Error('أدخل المبلغ برقم موجب وبمنزلتين عشريتين كحد أقصى.');
  const value = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(value)) throw new Error('المبلغ أكبر من الحد المسموح.');
  return value;
}

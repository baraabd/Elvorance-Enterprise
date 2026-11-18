import { idPath, resourcePaths, type RecordValue, type Resource } from '../api.ts';
import type { ViewContext } from '../context.ts';
import { commandForm, type Field, type Choice } from '../ui/forms.ts';
import { words } from '../ui/dom.ts';

export async function choices(
  context: ViewContext,
  resource: Resource,
  label = 'name',
  filter: (item: RecordValue) => boolean = () => true,
): Promise<Choice[]> {
  return (await context.api.list(resource, context.signal)).filter(filter).map((item) => ({
    value: item.id,
    label: words(item[label], words(item.customerName, item.id)),
  }));
}
export function editForm(
  context: ViewContext,
  resource: Resource,
  title: string,
  fields: Field[],
  value?: RecordValue,
  transform: (values: Record<string, unknown>) => Record<string, unknown> = (values) => values,
): HTMLFormElement {
  return commandForm({
    title,
    fields: fields.map((field) => ({
      ...field,
      ...(value && field.value === undefined
        ? { value: field.formatValue ? field.formatValue(value[field.name]) : value[field.name] }
        : {}),
    })),
    signal: context.signal,
    submit: async (values) => {
      const payload = transform(values);
      await context.api.mutate(
        value ? 'PATCH' : 'POST',
        `${resourcePaths[resource]}${value ? '/' + idPath(value.id) : ''}`,
        { ...payload, ...(value ? { expectedVersion: value.version } : {}) },
        context.signal,
      );
      context.notify('تم حفظ التغييرات.');
      await context.refresh();
    },
  });
}
export function actionForm(
  context: ViewContext,
  resource: Resource,
  value: RecordValue,
  action: string,
  title: string,
  fields: Field[],
  transform: (
    values: Record<string, unknown>,
  ) => Record<string, unknown> | Promise<Record<string, unknown>> = (values) => values,
): HTMLFormElement {
  return commandForm({
    title,
    fields,
    signal: context.signal,
    submit: async (values) => {
      await context.api.mutate(
        'POST',
        `${resourcePaths[resource]}/${idPath(value.id)}/${idPath(action)}`,
        { ...(await transform(values)), expectedVersion: value.version },
        context.signal,
      );
      context.notify('تم تنفيذ العملية.');
      await context.refresh();
    },
  });
}
export function localInputDate(instant: unknown): string {
  if (typeof instant !== 'string' || !Number.isFinite(Date.parse(instant))) return '';
  const date = new Date(instant);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

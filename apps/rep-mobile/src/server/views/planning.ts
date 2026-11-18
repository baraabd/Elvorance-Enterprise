import type { ViewContext } from '../context.ts';
import { amount, card, dateText, detail, el, heading, rows, statusText, words } from '../ui/dom.ts';
import { editorButton, type Field } from '../ui/forms.ts';
import { choices, editForm } from './common.ts';
import type { Resource } from '../api.ts';
import { minorUnits } from '../ui/repeating-fields.ts';

async function collection(
  context: ViewContext,
  resource: Resource,
  title: string,
  fields: Field[],
  extra: Field[],
  render: (
    item: HTMLElement,
    value: Awaited<ReturnType<ViewContext['api']['list']>>[number],
  ) => void,
  transform: (values: Record<string, unknown>) => Record<string, unknown> = (values) => values,
): Promise<void> {
  const items = await context.api.list(resource, context.signal);
  if (context.signal.aborted) return;
  context.root.append(heading(title));
  const create = el('section');
  create.append(
    editorButton(
      'إضافة',
      create,
      () => editForm(context, resource, 'إضافة ' + title, fields, undefined, transform),
      context.signal,
    ),
  );
  context.root.append(create);
  rows(context.root, items, (value) => {
    const node = card(words(value.title, words(value.name)));
    render(node, value);
    node.append(
      editorButton(
        'تعديل',
        node,
        () => editForm(context, resource, 'تعديل', [...fields, ...extra], value, transform),
        context.signal,
      ),
    );
    return node;
  });
}
export async function tasks(context: ViewContext): Promise<void> {
  const clients = await choices(context, 'customers');
  await collection(
    context,
    'tasks',
    'المهام',
    [
      { name: 'title', label: 'عنوان المهمة', required: true, max: 200 },
      { name: 'clientId', label: 'العميل', type: 'select', options: clients },
      { name: 'dueOn', label: 'تاريخ الاستحقاق', type: 'date', required: true },
      {
        name: 'priority',
        label: 'الأولوية',
        type: 'select',
        required: true,
        options: [
          { value: 'normal', label: 'عادية' },
          { value: 'low', label: 'منخفضة' },
          { value: 'high', label: 'عالية' },
        ],
      },
      { name: 'notes', label: 'التفاصيل', type: 'textarea' },
    ],
    [
      {
        name: 'status',
        label: 'الحالة',
        type: 'select',
        required: true,
        options: ['open', 'done', 'cancelled'].map((value) => ({
          value,
          label: statusText(value),
        })),
      },
    ],
    (node, value) => {
      detail(node, 'الحالة', statusText(value.status));
      detail(node, 'الاستحقاق', dateText(value.dueOn));
      detail(node, 'التفاصيل', value.notes);
    },
    (values) => ({ ...values, clientId: values.clientId || null }),
  );
}
export async function opportunities(context: ViewContext): Promise<void> {
  const [clients, contracts] = await Promise.all([
    choices(context, 'customers', 'name', (value) => !value.doNotContact),
    choices(context, 'contracts', 'customerName', (value) => value.status === 'approved'),
  ]);
  await collection(
    context,
    'opportunities',
    'الفرص',
    [
      { name: 'title', label: 'عنوان الفرصة', required: true },
      { name: 'clientId', label: 'العميل', type: 'select', required: true, options: clients },
      {
        name: 'stage',
        label: 'المرحلة',
        type: 'select',
        required: true,
        options: ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'].map((value) => ({
          value,
          label: statusText(value),
        })),
      },
      {
        name: 'valueMinor',
        label: 'القيمة المتوقعة',
        required: true,
        hint: 'المبلغ بالعملة المختارة، مثل 1500.00',
        formatValue: (value) => (Number(value ?? 0) / 100).toFixed(2),
      },
      {
        name: 'currency',
        label: 'العملة',
        type: 'select',
        required: true,
        options: [
          { value: 'SAR', label: 'ريال سعودي' },
          { value: 'USD', label: 'دولار أمريكي' },
        ],
      },
      { name: 'expectedCloseOn', label: 'موعد القرار المتوقع', type: 'date' },
      { name: 'notes', label: 'ملاحظات', type: 'textarea' },
    ],
    [
      {
        name: 'contractId',
        label: 'العقد المعتمد لإثبات اكتساب الفرصة',
        type: 'select',
        options: contracts,
      },
    ],
    (node, value) => {
      detail(node, 'المرحلة', statusText(value.stage));
      detail(node, 'القيمة', amount(value.valueMinor, value.currency));
      detail(node, 'الموعد', dateText(value.expectedCloseOn));
    },
    (values) => ({
      ...values,
      valueMinor: minorUnits(values.valueMinor),
      expectedCloseOn: values.expectedCloseOn || null,
      ...(values.contractId ? {} : { contractId: undefined }),
    }),
  );
}
export async function routes(context: ViewContext): Promise<void> {
  const visits = (await context.api.list('visits', context.signal)).filter(
    (value) => value.status !== 'cancelled',
  );
  await collection(
    context,
    'routes',
    'خطط الزيارات',
    [
      { name: 'name', label: 'اسم الخطة', required: true },
      { name: 'date', label: 'اليوم حسب التوقيت العالمي UTC', type: 'date', required: true },
      {
        name: 'visitIds',
        label: 'زيارات الخطة',
        type: 'multiselect',
        required: true,
        options: visits.map((value) => ({
          value: value.id,
          label: `${words(value.customerName)} · ${dateText(value.scheduledAt)}`,
        })),
        hint: 'اختر زيارات مجدولة في يوم الخطة نفسه.',
      },
    ],
    [
      {
        name: 'status',
        label: 'الحالة',
        type: 'select',
        required: true,
        options: ['planned', 'active', 'completed', 'cancelled'].map((value) => ({
          value,
          label: statusText(value),
        })),
      },
    ],
    (node, value) => {
      detail(node, 'اليوم', dateText(value.date));
      detail(node, 'الحالة', statusText(value.status));
      const selected = Array.isArray(value.visitIds) ? value.visitIds : [];
      const list = el('ol');
      for (const id of selected)
        list.append(
          el('li', words(visits.find((visit) => visit.id === id)?.customerName, 'زيارة غير متاحة')),
        );
      node.append(list);
    },
  );
}

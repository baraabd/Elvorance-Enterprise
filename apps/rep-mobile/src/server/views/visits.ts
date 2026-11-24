import { createMobilePlatform, locationPermissionMode } from '@elvorance/mobile-platform';
import type { ViewContext } from '../context.ts';
import { idPath, type RecordValue } from '../api.ts';
import { card, dateText, detail, el, heading, rows, statusText, words } from '../ui/dom.ts';
import { editorButton, type Field } from '../ui/forms.ts';
import { actionForm, choices, editForm, localInputDate } from './common.ts';

export async function visits(context: ViewContext): Promise<void> {
  const [items, clients] = await Promise.all([
    context.api.list('visits', context.signal),
    choices(context, 'customers', 'name', (item) => !item.doNotContact),
  ]);
  if (context.signal.aborted) return;
  context.root.append(heading('الزيارات', 'الجدولة والوصول وتوثيق النتيجة من الجهاز.'));
  const fields: Field[] = [
    {
      name: 'scheduledAt',
      label: 'موعد الزيارة (توقيت الجهاز)',
      type: 'datetime-local',
      required: true,
    },
    { name: 'purpose', label: 'هدف الزيارة', type: 'textarea', required: true, max: 2000 },
  ];
  const scheduled = (values: Record<string, unknown>) => ({
    ...values,
    scheduledAt: new Date(String(values.scheduledAt)).toISOString(),
  });
  const create = el('section');
  create.append(
    editorButton(
      'جدولة زيارة',
      create,
      () =>
        editForm(
          context,
          'visits',
          'زيارة جديدة',
          [
            { name: 'clientId', label: 'العميل', type: 'select', required: true, options: clients },
            ...fields,
          ],
          undefined,
          scheduled,
        ),
      context.signal,
    ),
  );
  context.root.append(create);
  rows(
    context.root,
    [...items].sort((a, b) => words(b.scheduledAt).localeCompare(words(a.scheduledAt))),
    (value) => {
      const item = card(words(value.customerName), dateText(value.scheduledAt));
      detail(item, 'الحالة', statusText(value.status));
      detail(item, 'الهدف', value.purpose);
      if (value.status === 'scheduled') {
        item.append(
          editorButton(
            'تغيير الموعد',
            item,
            () =>
              editForm(
                context,
                'visits',
                'موعد الزيارة',
                fields.map((field) =>
                  field.name === 'scheduledAt'
                    ? { ...field, value: localInputDate(value.scheduledAt) }
                    : field,
                ),
                value,
                scheduled,
              ),
            context.signal,
          ),
        );
        item.append(
          editorButton(
            'تسجيل الوصول',
            item,
            () =>
              actionForm(
                context,
                'visits',
                value,
                'start',
                'إثبات الوصول',
                [
                  {
                    name: 'kind',
                    label: 'طريقة الإثبات',
                    type: 'select',
                    required: true,
                    options: [
                      { value: 'manual', label: 'تسجيل الوصول دون مشاركة الموقع' },
                      { value: 'gps', label: 'أوافق على إرسال قراءة موقع واحدة لإثبات الوصول' },
                    ],
                  },
                  {
                    name: 'reason',
                    label: 'السبب عند التسجيل اليدوي',
                    type: 'textarea',
                    max: 1000,
                  },
                ],
                async (values) => {
                  if (values.kind === 'manual') {
                    if (String(values.reason).length < 5)
                      throw new Error('أدخل سببًا واضحًا من خمسة أحرف على الأقل.');
                    return { proof: { kind: 'manual', reason: values.reason } };
                  }
                  const platform = createMobilePlatform();
                  if (context.signal.aborted)
                    throw new DOMException('Request aborted', 'AbortError');
                  const permission = await platform.requestLocationPermission();
                  if (context.signal.aborted)
                    throw new DOMException('Request aborted', 'AbortError');
                  const mode = locationPermissionMode(permission, platform.native);
                  if (mode === 'denied')
                    throw new Error('صلاحية الموقع مرفوضة؛ اختر سببًا يدويًا أو عدّل الصلاحية.');
                  const position = await platform.currentLocation(mode !== 'approximate');
                  if (context.signal.aborted)
                    throw new DOMException('Request aborted', 'AbortError');
                  return {
                    proof: {
                      kind: 'gps',
                      latitude: position.coords.latitude,
                      longitude: position.coords.longitude,
                      accuracy: position.coords.accuracy,
                      capturedAt: new Date(position.timestamp).toISOString(),
                    },
                  };
                },
              ),
            context.signal,
          ),
        );
        item.append(
          editorButton(
            'إلغاء الزيارة',
            item,
            () =>
              actionForm(context, 'visits', value, 'cancel', 'سبب إلغاء الزيارة', [
                { name: 'reason', label: 'السبب', type: 'textarea', required: true, max: 1000 },
              ]),
            context.signal,
          ),
        );
      }
      if (value.status === 'active')
        item.append(
          editorButton(
            'إنهاء الزيارة',
            item,
            () =>
              actionForm(
                context,
                'visits',
                value,
                'complete',
                'نتيجة الزيارة',
                [
                  {
                    name: 'outcome',
                    label: 'النتيجة',
                    type: 'select',
                    required: true,
                    options: [
                      { value: 'interested', label: 'مهتم' },
                      { value: 'follow_up', label: 'تحتاج متابعة' },
                      { value: 'not_interested', label: 'غير مهتم' },
                      { value: 'no_contact', label: 'طلب عدم التواصل' },
                      { value: 'agreement', label: 'اتفاق بعرض مقبول من العميل' },
                    ],
                  },
                  { name: 'notes', label: 'تقرير الزيارة', type: 'textarea', required: true },
                  { name: 'nextStep', label: 'الخطوة التالية', type: 'textarea', max: 2000 },
                ],
                async (values) => {
                  if (values.outcome === 'no_contact') {
                    // Persist withdrawal at its CRM authority before completing the sales visit.
                    // A failed second command leaves the customer's safer preference in force.
                    const customer = await context.api.get<RecordValue>(
                      `/v1/crm/customers/${idPath(String(value.clientId))}`,
                      { signal: context.signal },
                    );
                    if (customer.doNotContact !== true)
                      await context.api.mutate(
                        'PATCH',
                        `/v1/crm/customers/${idPath(customer.id)}`,
                        { expectedVersion: customer.version, doNotContact: true },
                        context.signal,
                      );
                  }
                  return values;
                },
              ),
            context.signal,
          ),
        );
      if (value.notes) detail(item, 'التقرير', value.notes);
      if (value.nextStep) detail(item, 'الخطوة التالية', value.nextStep);
      return item;
    },
  );
}

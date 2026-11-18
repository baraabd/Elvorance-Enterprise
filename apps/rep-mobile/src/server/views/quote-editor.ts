import type { ViewContext } from '../context.ts';
import { idPath, type RecordValue } from '../api.ts';
import { commandForm, type Field } from '../ui/forms.ts';
import { amount, button, el, words } from '../ui/dom.ts';
import { minorUnits, repeatingFields } from '../ui/repeating-fields.ts';

export interface CatalogItem {
  id: string;
  title: string;
  price: number;
  unitPriceMinor: number;
  active?: boolean;
  duration?: string;
  deliverables?: string[];
  short?: string;
  category?: string;
}
export interface CatalogResponse {
  items: CatalogItem[];
  configured: boolean;
  recordVersion: number;
  currency: string;
}
export async function quoteEditor(
  context: ViewContext,
  existing?: RecordValue,
  copy = false,
): Promise<HTMLFormElement> {
  const [visits, catalog] = await Promise.all([
    context.api.list('visits', context.signal),
    context.api.get<CatalogResponse>('/v1/crm/catalog', { signal: context.signal }),
  ]);
  if (!catalog.configured || !catalog.items.length)
    throw new Error('يلزم نشر دليل خدمات معتمد قبل إعداد عرض السعر.');
  const sourceItems = Array.isArray(existing?.items)
    ? (existing.items as Record<string, unknown>[])
    : [];
  const payments = Array.isArray(existing?.paymentPlan)
    ? (existing.paymentPlan as Record<string, unknown>[])
    : [];
  const initial: Field[] = [
    {
      name: 'visitId',
      label: 'الزيارة',
      type: 'select',
      required: true,
      value: existing?.visitId,
      options: visits
        .filter((value) => ['active', 'completed'].includes(String(value.status)))
        .map((value) => ({
          value: value.id,
          label: words(value.customerName) + ' · ' + words(value.purpose),
        })),
    },
    {
      name: 'currency',
      label: 'العملة',
      type: 'select',
      required: true,
      value: existing?.currency ?? catalog.currency,
      options: [{ value: catalog.currency, label: catalog.currency }],
    },
    {
      name: 'validUntil',
      label: 'صالح حتى',
      type: 'date',
      required: true,
      value: existing?.validUntil,
    },
    {
      name: 'discount',
      label: 'مبلغ الخصم',
      value: (Number(existing?.discountMinor ?? 0) / 100).toFixed(2),
      required: true,
      hint: 'الخصم فوق 15% يحتاج موافقة الإدارة قبل إرسال العرض.',
    },
    {
      name: 'terms',
      label: 'الشروط والنطاق المتفق عليه',
      type: 'textarea',
      required: true,
      value: existing?.terms,
      max: 10000,
    },
  ];
  const form = commandForm({
    title: existing && !copy ? 'تعديل مسودة العرض' : 'عرض سعر جديد',
    fields: initial,
    signal: context.signal,
    submit: async (values) => {
      const items = lines.values().map((row) => {
        const service = catalog.items.find((item) => item.id === row.serviceId);
        if (!service) throw new Error('اختر خدمة منشورة لكل بند.');
        return {
          serviceId: service.id,
          title: service.title,
          quantity: Number(row.quantity),
          unitPriceMinor:
            service.unitPriceMinor > 0 ? service.unitPriceMinor : minorUnits(row.price),
          duration: service.duration ?? '',
          deliverables: service.deliverables ?? [],
        };
      });
      const discountMinor = minorUnits(values.discount);
      const paymentPlan = installments
        .values()
        .map((row) => ({
          id: row.id,
          label: row.label,
          amountMinor: minorUnits(row.amount),
          dueOn: row.dueOn || null,
        }));
      const subtotal = items.reduce(
        (total, item) => total + item.quantity * item.unitPriceMinor,
        0,
      );
      const total = subtotal - discountMinor;
      if (
        total <= 0 ||
        paymentPlan.reduce((sum, payment) => sum + payment.amountMinor, 0) !== total
      )
        throw new Error('يجب أن يساوي مجموع الدفعات إجمالي العرض بعد الخصم.');
      if (paymentPlan[0]!.amountMinor < Math.ceil(total / 5))
        throw new Error('الدفعة الأولى لا تقل عن 20% من إجمالي العرض.');
      const payload = {
        visitId: existing && !copy ? existing.visitId : values.visitId,
        currency: catalog.currency,
        validUntil: values.validUntil,
        terms: values.terms,
        discountMinor,
        items,
        paymentPlan,
        ...(existing && !copy ? { expectedVersion: existing.version } : {}),
      };
      await context.api.mutate(
        existing && !copy ? 'PATCH' : 'POST',
        `/v1/sales/quotes${existing && !copy ? '/' + idPath(existing.id) : ''}`,
        payload,
        context.signal,
      );
      context.notify('تم حفظ مسودة العرض. راجعها ثم أرسلها للعميل.');
      await context.refresh();
    },
  });
  if (existing && !copy) (form.elements.namedItem('visitId') as HTMLSelectElement).disabled = true;
  const lines = repeatingFields(
    form,
    'بنود العرض',
    [
      {
        name: 'serviceId',
        label: 'الخدمة',
        type: 'select',
        required: true,
        options: catalog.items
          .filter((item) => item.active !== false)
          .map((item) => ({
            value: item.id,
            label: `${item.title} · ${item.unitPriceMinor > 0 ? amount(item.unitPriceMinor, catalog.currency) : 'تسعير خاص بموافقة الإدارة'}`,
          })),
      },
      {
        name: 'quantity',
        label: 'الكمية',
        type: 'number',
        min: 1,
        max: 1000,
        step: 1,
        required: true,
        value: 1,
      },
      {
        name: 'price',
        label: 'سعر الخدمة ذات التسعير الخاص فقط',
        hint: 'الأسعار المحددة في الدليل تُطبّق تلقائيًا. الخدمة ذات التسعير الخاص تحتاج موافقة الإدارة.',
        value: '0.00',
      },
    ],
    sourceItems.map((item) => ({ ...item, price: (Number(item.unitPriceMinor) / 100).toFixed(2) })),
    context.signal,
    40,
  );
  const installments = repeatingFields(
    form,
    'جدول الدفعات',
    [
      { name: 'label', label: 'اسم الدفعة', required: true, value: 'دفعة أولى' },
      { name: 'amount', label: 'المبلغ', required: true },
      { name: 'dueOn', label: 'تاريخ الاستحقاق', type: 'date' },
    ],
    payments.map((item) => ({
      ...item,
      ...(copy ? { id: crypto.randomUUID() } : {}),
      amount: (Number(item.amountMinor) / 100).toFixed(2),
    })),
    context.signal,
    24,
  );
  const total = el('p', '', 'quote-total');
  const sum = () =>
    lines.values().reduce((value, item) => {
      const service = catalog.items.find((entry) => entry.id === item.serviceId);
      return (
        value +
        Number(item.quantity) *
          (service && service.unitPriceMinor > 0 ? service.unitPriceMinor : minorUnits(item.price))
      );
    }, 0) - minorUnits((form.elements.namedItem('discount') as HTMLInputElement).value);
  form.insertBefore(total, form.querySelector('.form-status'));
  form.insertBefore(
    button(
      'تعبئة الدفعة الأولى بكامل الإجمالي',
      () => {
        installments.setFirst('amount', (sum() / 100).toFixed(2));
      },
      context.signal,
    ),
    form.querySelector('.form-status'),
  );
  form.addEventListener(
    'input',
    () => {
      try {
        total.textContent =
          'الإجمالي بعد الخصم: ' +
          amount(sum(), (form.elements.namedItem('currency') as HTMLSelectElement).value);
      } catch {
        total.textContent = 'أكمل أسعار البنود لحساب الإجمالي.';
      }
    },
    { signal: context.signal },
  );
  return form;
}

import type { CatalogSnapshot } from '@elvorance/contracts';
import { object, paths, segment, type Row } from './api.ts';
import type { Operation } from './operations.ts';
/** Prices are selected from the active tenant catalog, not a bundled example catalog. */
export function quoteOperation(catalog: CatalogSnapshot, existing?: Row): Operation {
  if (!catalog.configured || !catalog.items.length)
    throw new Error('انشر كتالوج المؤسسة الفعلي أولًا؛ لا توجد أسعار تشغيلية جاهزة.');
  return {
    id: existing ? 'edit-quote' : 'create-quote',
    label: existing ? 'تعديل مسودة العرض' : 'إضافة عرض سعر',
    method: existing ? 'PATCH' : 'POST',
    path: paths.quotes + (existing ? `/${segment(existing.id)}` : ''),
    versioned: Boolean(existing),
    notice:
      'تُقرأ أسعار الخدمات من الكتالوج. جميع المبالغ بأصغر وحدة نقدية (مثل الهللة). يجب أن تطابق الدفعات صافي الإجمالي وأن تكون الأولى 20% على الأقل. قبول العرض والعقد من صلاحيات العميل، لا الإدارة.',
    fields: [
      ...(!existing
        ? [{ key: 'visitId', label: 'معرّف زيارة بدأت بالفعل', required: true, max: 100 }]
        : []),
      {
        key: 'items',
        label: 'الخدمات',
        type: 'rows',
        required: true,
        min: 1,
        max: 40,
        fields: [
          {
            key: 'serviceId',
            label: 'معرّف الخدمة المنشورة',
            type: 'select',
            required: true,
            choices: catalog.items.map((item) => item.id),
          },
          {
            key: 'quantity',
            label: 'الكمية',
            type: 'number',
            min: 1,
            max: 1000,
            default: 1,
            required: true,
          },
          {
            key: 'unitPriceMinor',
            label: 'سعر خاص للخدمات المسعّرة بصفر فقط',
            type: 'number',
            default: 0,
            min: 0,
            max: 10_000_000_000,
            required: true,
          },
          { key: 'deliverables', label: 'المخرجات المتفق عليها، كل مخرج في سطر', type: 'lines' },
          { key: 'duration', label: 'المدة', max: 200 },
        ],
      },
      {
        key: 'discountMinor',
        label: 'الخصم بأصغر وحدة نقدية',
        type: 'number',
        min: 0,
        default: 0,
        required: true,
      },
      {
        key: 'paymentPlan',
        label: 'الدفعات',
        type: 'rows',
        min: 1,
        max: 24,
        required: true,
        fields: [
          { key: 'label', label: 'اسم الدفعة', min: 2, max: 150, required: true },
          {
            key: 'amountMinor',
            label: 'المبلغ بأصغر وحدة نقدية',
            type: 'number',
            min: 1,
            required: true,
          },
          { key: 'dueOn', label: 'تاريخ الاستحقاق', type: 'date' },
        ],
      },
      { key: 'validUntil', label: 'صالح حتى', type: 'date', required: true },
      { key: 'terms', label: 'الشروط', type: 'textarea', min: 3, max: 10000, required: true },
    ],
    prepare(input) {
      const items = (input.items as unknown[]).map((value) => {
        const item = object(value);
        const service = catalog.items.find((service) => service.id === item.serviceId);
        if (!service) throw new Error('خدمة غير موجودة في الكتالوج.');
        return {
          ...item,
          quantity: Number(item.quantity),
          title: service.title,
          unitPriceMinor: service.unitPriceMinor || Number(item.unitPriceMinor),
        };
      });
      const subtotal = items.reduce(
        (sum, item) => sum + Number(item.quantity) * item.unitPriceMinor,
        0,
      );
      const total = subtotal - Number(input.discountMinor);
      const plan = (input.paymentPlan as unknown[]).map(object);
      if (
        !Number.isSafeInteger(total) ||
        total < 1 ||
        total > 100_000_000_000 ||
        plan.reduce((sum, item) => sum + Number(item.amountMinor), 0) !== total ||
        Number(plan[0]?.amountMinor) < Math.ceil(total / 5)
      )
        throw new Error('تحقق من الإجمالي والخصم وتطابق خطة الدفعات والدفعة الأولى.');
      return { ...input, items, currency: catalog.currency };
    },
  };
}

import type { ViewContext } from '../context.ts';
import type { RecordValue } from '../api.ts';
import { card, detail, el, heading, rows, words } from '../ui/dom.ts';
import { editorButton, type Field } from '../ui/forms.ts';
import { choices, editForm } from './common.ts';
import { discoveryForm } from './discovery.ts';
import { minorUnits } from '../ui/repeating-fields.ts';

export async function customers(context: ViewContext): Promise<void> {
  const [items, regions] = await Promise.all([
    context.api.list('customers', context.signal),
    choices(context, 'regions', 'name', (item) => item.active === true),
  ]);
  if (context.signal.aborted) return;
  context.root.append(heading('العملاء', 'إدارة بيانات العملاء واحتياجاتهم وتفضيلات التواصل.'));
  const fields: Field[] = [
    { name: 'name', label: 'اسم العميل / المنشأة', required: true, min: 2, max: 200 },
    { name: 'contactName', label: 'اسم جهة الاتصال', max: 150 },
    { name: 'phone', label: 'الهاتف', type: 'tel', max: 40 },
    { name: 'email', label: 'البريد الإلكتروني', type: 'email', max: 200 },
    { name: 'city', label: 'المدينة', max: 120 },
    { name: 'address', label: 'العنوان', max: 500 },
    { name: 'businessType', label: 'نوع النشاط', max: 100 },
    { name: 'source', label: 'مصدر العميل', max: 100 },
    {
      name: 'status',
      label: 'مرحلة العميل',
      type: 'select',
      required: true,
      options: [
        { value: 'new', label: 'جديد' },
        { value: 'qualified', label: 'مؤهل' },
        { value: 'customer', label: 'عميل حالي' },
        { value: 'lost', label: 'غير مكتمل' },
      ],
    },
    {
      name: 'budgetMinor',
      label: 'الميزانية التقديرية بالريال',
      formatValue: (value) => (Number(value ?? 0) / 100).toFixed(2),
    },
    { name: 'decisionMaker', label: 'صاحب القرار', max: 150 },
    { name: 'preferredContact', label: 'وسيلة التواصل المفضلة', max: 100 },
    { name: 'bestTime', label: 'وقت التواصل المناسب', max: 150 },
    { name: 'painPoints', label: 'التحديات', type: 'textarea', max: 3000 },
    { name: 'wishes', label: 'الأهداف', type: 'textarea', max: 3000 },
    {
      name: 'tags',
      label: 'تصنيفات العميل (افصل بفاصلة)',
      formatValue: (value) => (Array.isArray(value) ? value.join('، ') : ''),
    },
    {
      name: 'needs',
      label: 'الاحتياجات (افصل بفاصلة)',
      formatValue: (value) => (Array.isArray(value) ? value.join('، ') : ''),
    },
    { name: 'notes', label: 'ملاحظات', type: 'textarea', max: 3000 },
  ];
  const payload = (values: Record<string, unknown>) => ({
    ...values,
    budgetMinor: values.budgetMinor ? minorUnits(values.budgetMinor) : 0,
    tags: [
      ...new Set(
        String(values.tags ?? '')
          .split(/[,،]/)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ],
    needs: [
      ...new Set(
        String(values.needs ?? '')
          .split(/[,،]/)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ],
  });
  const create = el('section');
  create.append(
    editorButton(
      'إضافة عميل',
      create,
      () =>
        editForm(
          context,
          'customers',
          'عميل جديد',
          [...fields, { name: 'regionId', label: 'المنطقة', type: 'select', options: regions }],
          undefined,
          (values) => ({ ...payload(values), regionId: values.regionId || null }),
        ),
      context.signal,
    ),
  );
  context.root.append(create);
  const search = el('input');
  search.type = 'search';
  search.placeholder = 'بحث بالاسم أو الهاتف';
  search.setAttribute('aria-label', 'بحث العملاء');
  const list = el('div');
  context.root.append(search, list);
  const render = (value: RecordValue): HTMLElement => {
    const item = card(words(value.name), words(value.contactName, ''));
    detail(item, 'الهاتف', value.phone);
    detail(item, 'البريد', value.email);
    detail(item, 'المدينة', value.city);
    if (value.doNotContact) item.append(el('p', 'طلب العميل عدم التواصل.', 'notice'));
    item.append(
      editorButton(
        'تعديل البيانات',
        item,
        () =>
          editForm(
            context,
            'customers',
            'بيانات العميل',
            [
              ...fields,
              { name: 'doNotContact', label: 'العميل طلب عدم التواصل', type: 'checkbox' },
            ],
            value,
            payload,
          ),
        context.signal,
      ),
    );
    item.append(
      editorButton('اكتشاف الاحتياج', item, () => discoveryForm(context, value), context.signal),
    );
    return item;
  };
  const display = () => {
    list.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase();
    rows(
      list,
      items.filter((item) =>
        `${words(item.name, '')} ${words(item.phone, '')}`.toLocaleLowerCase().includes(query),
      ),
      render,
    );
  };
  search.addEventListener('input', display, { signal: context.signal });
  display();
}

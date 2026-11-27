import { paths, segment, type Method, type Resource, type Row } from './api.ts';
import type { Field } from './forms.ts';
export interface Operation {
  id: string;
  label: string;
  method: Method;
  path: string;
  fields: Field[];
  versioned?: boolean;
  notice?: string;
  prepare?: (input: Record<string, unknown>) => Record<string, unknown>;
}
const text = (key: string, label: string, min = 0, max = 3000): Field => ({
  key,
  label,
  min,
  max,
  required: min > 0,
});
const choice = (key: string, label: string, choices: string[], value?: string): Field => ({
  key,
  label,
  type: 'select',
  choices,
  required: true,
  ...(value ? { default: value } : {}),
});
const number = (key: string, label: string, value = 0, min = 0): Field => ({
  key,
  label,
  type: 'number',
  default: value,
  min,
  required: true,
});
const date = (key: string, label: string, required = true): Field => ({
  key,
  label,
  type: 'date',
  required,
});
const notes = (): Field => ({ ...text('notes', 'ملاحظات'), type: 'textarea' });
const customerFields: Field[] = [
  text('name', 'اسم العميل', 2, 200),
  text('repId', 'معرّف المندوب المعتمد في الهوية', 1, 100),
  text('regionId', 'معرّف المنطقة', 0, 100),
  { ...text('phone', 'الهاتف', 0, 40), type: 'tel' },
  { ...text('email', 'البريد الإلكتروني', 0, 200), type: 'email' },
  text('contactName', 'اسم جهة الاتصال', 0, 150),
  text('businessType', 'النشاط', 0, 100),
  text('address', 'العنوان', 0, 500),
  text('city', 'المدينة', 0, 150),
  choice('status', 'الحالة', ['new', 'qualified', 'customer', 'lost'], 'new'),
  number('budgetMinor', 'الميزانية بأصغر وحدة نقدية'),
  notes(),
];
const taskFields: Field[] = [
  text('title', 'عنوان المهمة', 3, 200),
  date('dueOn', 'تاريخ الاستحقاق'),
  choice('priority', 'الأولوية', ['low', 'normal', 'high'], 'normal'),
  notes(),
];
const opportunityFields: Field[] = [
  text('title', 'عنوان الفرصة', 3, 200),
  choice('stage', 'المرحلة', ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'], 'new'),
  number('valueMinor', 'القيمة بأصغر وحدة نقدية'),
  text('currency', 'العملة (ثلاثة أحرف)', 3, 3),
  date('expectedCloseOn', 'الإغلاق المتوقع', false),
  text('contractId', 'معرّف العقد المعتمد عند الفوز', 0, 100),
  notes(),
];
const visitFields: Field[] = [
  {
    key: 'scheduledAt',
    label: 'موعد الزيارة (التوقيت المحلي)',
    type: 'datetime-local',
    required: true,
  },
  text('purpose', 'الغرض من الزيارة', 3, 2000),
];
const routeFields: Field[] = [
  text('name', 'اسم المسار', 3, 150),
  date('date', 'تاريخ المسار UTC'),
  {
    key: 'visitIds',
    label: 'معرّفات الزيارات بالترتيب، كل معرّف في سطر',
    type: 'lines',
    required: true,
  },
];
const roles = ['admin', 'rep', 'client', 'finance', 'delivery', 'support'];
export const titles: Record<Resource, string> = {
  customers: 'العملاء',
  users: 'المستخدمون',
  representatives: 'المندوبون',
  regions: 'المناطق',
  visits: 'الزيارات',
  tasks: 'المهام',
  opportunities: 'الفرص',
  routes: 'مسارات الزيارات',
  quotes: 'عروض الأسعار',
  approvals: 'الموافقات التجارية',
  contracts: 'العقود',
  projects: 'المشاريع',
  invoices: 'الفواتير',
  tickets: 'الدعم',
  conversations: 'الرسائل',
  notifications: 'الإشعارات',
};
export function createOperation(resource: Resource): Operation | null {
  const input: Partial<Record<Resource, Field[]>> = {
    customers: customerFields,
    regions: [text('name', 'اسم المنطقة', 2, 150), text('code', 'رمز المنطقة', 1, 30)],
    users: [
      text('subject', 'معرّف المستخدم لدى موفر الهوية', 1, 150),
      text('displayName', 'اسم العرض', 2, 150),
      choice('role', 'دور وصفي في سجل العضوية', roles),
    ],
    visits: [text('clientId', 'معرّف العميل', 1, 100), ...visitFields],
    tasks: [
      text('clientId', 'معرّف العميل (اختياري)', 0, 100),
      text('repId', 'معرّف المندوب عند عدم اختيار عميل', 0, 100),
      ...taskFields,
    ],
    opportunities: [text('clientId', 'معرّف العميل', 1, 100), ...opportunityFields],
    routes: routeFields,
    conversations: [text('clientId', 'معرّف العميل', 1, 100)],
  };
  const fields = input[resource];
  if (!fields) return null;
  return {
    id: 'create',
    label: `إضافة — ${titles[resource]}`,
    method: 'POST',
    path: paths[resource],
    fields,
    ...(resource === 'users'
      ? {
          notice:
            'هذا يسجل ملف عضوية فقط. لا ينشئ حساب دخول ولا يمنح صلاحيات OIDC؛ إدارة الصلاحيات الفعلية غير متاحة في هذا العقد.',
          prepare: (value: Record<string, unknown>) => ({
            subject: value.subject,
            displayName: value.displayName,
            roles: [value.role],
          }),
        }
      : {}),
  };
}
export function recordOperations(resource: Resource, row: Row): Operation[] {
  const base = `${paths[resource]}/${segment(row.id)}`;
  const update = (fields: Field[]): Operation => ({
    id: 'edit',
    label: 'تعديل',
    method: 'PATCH',
    path: base,
    fields,
    versioned: true,
  });
  const command = (id: string, label: string, fields: Field[] = []): Operation => ({
    id,
    label,
    method: 'POST',
    path: `${base}/${id}`,
    fields,
    versioned: true,
  });
  switch (resource) {
    case 'customers':
      return [
        update([
          ...customerFields,
          { key: 'doNotContact', label: 'عدم التواصل مع العميل', type: 'checkbox' },
        ]),
      ];
    case 'tasks':
      return [update([...taskFields, choice('status', 'الحالة', ['open', 'done', 'cancelled'])])];
    case 'opportunities':
      return [update(opportunityFields)];
    case 'routes':
      return ['completed', 'cancelled'].includes(String(row.status))
        ? []
        : [
            update([
              ...routeFields,
              choice('status', 'الحالة', ['planned', 'active', 'completed', 'cancelled']),
            ]),
          ];
    case 'visits':
      return row.status === 'scheduled'
        ? [
            update([...visitFields, notes()]),
            {
              ...command('start', 'بدء بإثبات يدوي', [
                text('reason', 'سبب الإثبات اليدوي', 5, 1000),
              ]),
              prepare: (value) => ({ proof: { kind: 'manual', reason: value.reason } }),
            },
            command('cancel', 'إلغاء الزيارة', [text('reason', 'سبب الإلغاء', 3, 1000)]),
          ]
        : row.status === 'active'
          ? [
              update([notes()]),
              command('complete', 'إنهاء الزيارة', [
                choice('outcome', 'النتيجة', [
                  'interested',
                  'follow_up',
                  'not_interested',
                  'no_contact',
                  'agreement',
                  'ready_to_contract',
                  'no_decision_maker',
                  'closed',
                  'reschedule',
                  'no_budget',
                  'competitor',
                  'wrong_contact',
                  'do_not_contact',
                  'remote_meeting',
                  'needs_approval',
                ]),
                { ...text('notes', 'ملخص الزيارة', 3, 5000), type: 'textarea' },
                text('nextStep', 'الخطوة التالية', 0, 2000),
              ]),
              command('cancel', 'إلغاء الزيارة', [text('reason', 'سبب الإلغاء', 3, 1000)]),
            ]
          : [];
    case 'quotes':
      return row.status === 'draft'
        ? [
            command('send', 'إرسال العرض'),
            command('discount-approval', 'طلب موافقة تجارية', [
              text('reason', 'سبب الاستثناء', 5, 2000),
            ]),
          ]
        : row.status !== 'accepted'
          ? [command('revise', 'إنشاء مراجعة للعرض')]
          : [];
    case 'approvals':
      return row.status === 'pending'
        ? [
            command('decision', 'قرار تجاري', [
              choice('decision', 'القرار', ['approved', 'rejected']),
              text('note', 'سبب القرار', 3, 2000),
            ]),
          ]
        : [];
    case 'projects':
      return row.status === 'completed'
        ? []
        : [
            command('milestones', 'إضافة مرحلة', [
              text('title', 'عنوان المرحلة', 3, 300),
              date('dueOn', 'موعد المرحلة', false),
            ]),
            command('deliverables', 'إضافة مُخرج', [
              text('milestoneId', 'معرّف المرحلة', 1, 100),
              text('title', 'عنوان المخرج', 3, 300),
              { ...text('content', 'المحتوى الفعلي', 30, 20000), type: 'textarea' },
              text('url', 'رابط HTTPS (اختياري)', 0, 2000),
            ]),
            command('complete', 'إغلاق المشروع'),
          ];
    case 'invoices':
      return row.status === 'paid'
        ? []
        : [
            {
              ...command('payments', 'تسجيل تحصيل موثّق', [
                number('amountMinor', 'المبلغ بأصغر وحدة نقدية', 0, 1),
                text('requestId', 'معرّف عملية التحصيل الفريد', 8, 150),
                choice('method', 'طريقة التحصيل', ['bank_transfer', 'cash', 'external_provider']),
                text('reference', 'المرجع الخارجي', 3, 300),
              ]),
              notice:
                'لا تُنفّذ هذه العملية دفعًا أو خصمًا؛ سجل تحصيلًا تم التحقق منه خارج النظام فقط.',
            },
          ];
    case 'tickets':
      return [
        ...(row.status === 'open'
          ? [
              command('replies', 'إضافة رد', [
                { ...text('message', 'الرد', 1, 5000), type: 'textarea' },
              ]),
            ]
          : []),
        command('status', 'تغيير حالة الدعم', [choice('status', 'الحالة', ['open', 'resolved'])]),
      ];
    case 'notifications':
      return [command('read', 'تمييز كمقروء')];
    case 'conversations':
      return [
        command('messages', 'إرسال رسالة', [
          { ...text('body', 'نص الرسالة', 1, 4000), type: 'textarea' },
        ]),
      ];
    default:
      return [];
  }
}
export function nestedProjectOperations(row: Row): Operation[] {
  if (row.status === 'completed') return [];
  const base = `${paths.projects}/${segment(row.id)}`;
  const result: Operation[] = [];
  for (const item of Array.isArray(row.milestones) ? row.milestones : []) {
    if (!item || typeof item !== 'object') continue;
    const value = item as Record<string, unknown>;
    if (value.status !== 'pending' && value.status !== 'in_progress') continue;
    result.push({
      id: `milestone-${String(value.id)}`,
      label: `تحديث المرحلة: ${String(value.title)}`,
      method: 'POST',
      path: `${base}/milestones/${segment(String(value.id))}`,
      versioned: true,
      fields: [],
      prepare: () => ({ status: value.status === 'pending' ? 'in_progress' : 'done' }),
    });
  }
  for (const item of Array.isArray(row.deliverables) ? row.deliverables : []) {
    if (!item || typeof item !== 'object') continue;
    const value = item as Record<string, unknown>;
    if (value.status !== 'changes_requested') continue;
    result.push({
      id: `deliverable-${String(value.id)}`,
      label: `إعادة تقديم: ${String(value.title)}`,
      method: 'POST',
      path: `${base}/deliverables/${segment(String(value.id))}/revise`,
      versioned: true,
      fields: [
        text('title', 'العنوان', 3, 300),
        { ...text('content', 'المحتوى المعدّل', 30, 20000), type: 'textarea' },
        text('url', 'رابط HTTPS', 0, 2000),
      ],
    });
  }
  return result;
}

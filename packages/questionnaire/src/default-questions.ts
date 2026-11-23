import type { Activity, Question, QuestionSection, Option } from './types.ts';

type LabelSeed = readonly [id: string, label: string];
type QuestionSeed = readonly [
  id: string,
  label: string,
  section: QuestionSection,
  choices: readonly LabelSeed[],
];
type SectorSeed = readonly [
  activity: string,
  id: string,
  label: string,
  choices: readonly LabelSeed[],
];

/** Tenant-editable discovery schema. Stable identifiers survive copy edits. No customer answers are seeded here. */
export const activities: Activity[] = (
  [
    ['clinic', 'عيادة / مركز طبي'],
    ['restaurant', 'مطعم / مقهى'],
    ['workshop', 'ورشة / صيانة'],
    ['factory', 'مصنع / منشأة إنتاج'],
    ['retail', 'متجر / بقالية'],
    ['salon', 'صالون / مركز تجميل'],
    ['services', 'شركة خدمات'],
    ['other', 'نشاط آخر'],
  ] satisfies LabelSeed[]
).map(([id, label]) => ({ id, label, active: true }));
const option = (values: readonly LabelSeed[]): Option[] =>
  values.map(([id, label]) => ({ id, label }));
const base: Question[] = (
  [
    [
      'situation',
      'ما الموقف مع العملاء الذي تتمنى تغييره أولًا؟',
      'challenge',
      [
        ['slow', 'تأخر الخدمة أو الانتظار'],
        ['lost', 'فقدان فرص البيع'],
        ['visibility', 'ضعف معرفة الناس بالنشاط'],
        ['errors', 'أخطاء في متابعة الطلبات'],
        ['other', 'أخرى'],
      ],
    ],
    [
      'reach',
      'كيف يصل العملاء إليكم الآن؟',
      'challenge',
      [
        ['walkin', 'زيارات مباشرة'],
        ['referrals', 'توصيات ومعارف'],
        ['social', 'وسائل التواصل'],
        ['maps', 'خرائط ومحركات بحث'],
        ['phone', 'الهاتف أو واتساب'],
        ['other', 'أخرى'],
      ],
    ],
    [
      'bottleneck',
      'أين يضيع الوقت أو تتكرر الأخطاء أثناء الخدمة؟',
      'challenge',
      [
        ['booking', 'الحجوزات وتنظيم الدور'],
        ['followup', 'الرد والمتابعة'],
        ['records', 'السجلات والفواتير'],
        ['inventory', 'المخزون أو التوريد'],
        ['manual', 'العمل الورقي'],
        ['other', 'أخرى'],
      ],
    ],
    [
      'impact',
      'كيف يؤثر هذا الوضع عليكم وعلى تجربة العميل؟',
      'challenge',
      [
        ['time', 'يضيع وقت الفريق'],
        ['sales', 'تنخفض المبيعات'],
        ['trust', 'تقل ثقة العملاء'],
        ['repeat', 'تنخفض الزيارات المتكررة'],
        ['unknown', 'لم يُقَس بعد'],
        ['other', 'أخرى'],
      ],
    ],
    [
      'priority',
      'إذا تحسن جانب واحد أولًا، أي فرق سيعني لكم أكثر؟',
      'challenge',
      [
        ['growth', 'طلبات ومبيعات أكثر'],
        ['speed', 'خدمة أسرع'],
        ['loyalty', 'عودة العملاء مجددًا'],
        ['accuracy', 'أخطاء أقل'],
        ['visibility', 'ظهور أقوى'],
        ['other', 'أخرى'],
      ],
    ],
    [
      'constraints',
      'ما الظروف التي يجب احترامها عند تطبيق أي حل؟',
      'challenge',
      [
        ['electricity', 'الكهرباء والإنترنت'],
        ['budget', 'الميزانية'],
        ['language', 'اللغة وطريقة استخدام الفريق'],
        ['time', 'عدم تعطيل العمل'],
        ['privacy', 'خصوصية بيانات العملاء'],
        ['other', 'أخرى'],
      ],
    ],
    [
      'goals',
      'ما النتائج التي يريد العميل تحقيقها؟',
      'goal',
      [
        ['sales', 'زيادة المبيعات'],
        ['new_clients', 'استقطاب عملاء جدد'],
        ['appointments', 'تنظيم المواعيد'],
        ['online', 'الحضور الرقمي'],
        ['tracking', 'متابعة الطلبات'],
        ['loyalty', 'عودة العملاء'],
        ['other', 'أخرى'],
      ],
    ],
    ['solutions', 'الخدمات التي يرغب العميل في عرض أسعارها', 'solution', []],
  ] satisfies QuestionSeed[]
).map(
  ([id, label, section, choices], i): Question => ({
    id,
    label,
    section,
    type: id === 'goals' || id === 'solutions' ? 'multi' : 'single',
    required: true,
    active: true,
    activityIds: ['*'],
    order: (i + 1) * 10,
    options: option(choices),
    otherAllowed: id !== 'solutions',
    min: null,
    max: null,
  }),
);
const sectorQuestions: Question[] = (
  [
    [
      'clinic',
      'clinic_access',
      'ما أكثر ما يرهق المراجعين عند حجز موعد أو متابعة نتيجة؟',
      [
        ['queues', 'الازدحام وانتظار الدور'],
        ['calls', 'ضغط الهاتف'],
        ['reminder', 'نسيان المواعيد'],
        ['records', 'الملفات والمتابعة'],
        ['other', 'أخرى'],
      ],
    ],
    [
      'restaurant',
      'restaurant_orders',
      'ما أكثر ما يُفقد المطعم طلبات أثناء ساعات الذروة؟',
      [
        ['menu', 'صعوبة الوصول للقائمة'],
        ['orders', 'تداخل الطلبات'],
        ['delivery', 'تأخر التوصيل'],
        ['social', 'الرسائل غير المنظمة'],
        ['other', 'أخرى'],
      ],
    ],
    [
      'workshop',
      'workshop_tracking',
      'أين يضيع التواصل مع صاحب السيارة أو الجهاز؟',
      [
        ['estimate', 'تقدير السعر'],
        ['status', 'متابعة حالة الإصلاح'],
        ['parts', 'توفر القطع'],
        ['pickup', 'توقيت التسليم'],
        ['other', 'أخرى'],
      ],
    ],
    [
      'factory',
      'factory_sales',
      'ما العقبة الأكبر بين طلب العميل وتسليم الإنتاج؟',
      [
        ['quotations', 'تجهيز عروض الأسعار'],
        ['production', 'جدولة الإنتاج'],
        ['inventory', 'المخزون'],
        ['distribution', 'التوزيع'],
        ['other', 'أخرى'],
      ],
    ],
    [
      'retail',
      'retail_sales',
      'ما الذي يعطل البيع في المتجر أكثر؟',
      [
        ['stock', 'نفاد الأصناف'],
        ['online', 'غياب الطلبات الرقمية'],
        ['delivery', 'صعوبة التوصيل'],
        ['loyalty', 'ضعف عودة العملاء'],
        ['other', 'أخرى'],
      ],
    ],
    [
      'salon',
      'salon_appointments',
      'ما أكثر ما يزعج الزبائن أثناء الحجز؟',
      [
        ['double', 'تضارب المواعيد'],
        ['cancel', 'الإلغاء المتأخر'],
        ['reminder', 'غياب التذكير'],
        ['online', 'صعوبة الحجز'],
        ['other', 'أخرى'],
      ],
    ],
    [
      'services',
      'services_pipeline',
      'أين تتعثر متابعة عروض الخدمات؟',
      [
        ['leads', 'فقدان العملاء المحتملين'],
        ['pricing', 'تأخر التسعير'],
        ['updates', 'عدم وصول التحديثات'],
        ['contracts', 'إدارة العقود'],
        ['other', 'أخرى'],
      ],
    ],
  ] satisfies SectorSeed[]
).map(
  ([activity, id, label, choices], i): Question => ({
    id,
    label,
    section: 'challenge',
    type: 'single',
    required: true,
    active: true,
    activityIds: [activity],
    order: 25 + i,
    options: option(choices),
    otherAllowed: true,
    min: null,
    max: null,
  }),
);

export const questions: Question[] = [...base, ...sectorQuestions];

# Design System — عقد الاستخدام والتغييرات

## الجرد قبل التعديل

طبقة `packages/ui` كانت تحتوي بالفعل على primitives ومصانع أزرار ونماذج وعناوين خاصة بالتطبيقات. لم تُنشأ مكتبة موازية تعيد بناء السلوك الصحيح. النمط المتكرر هو عرض نفس مفاهيم الحقل والزر والصفحة عبر ثلاثة facades، إضافة إلى DOM builders مستقلة للمندوب المتصل. تختلف signatures وDOM contracts؛ التشابه البنيوي ليس إثباتًا لنسخ متطابقة.

| الأسرة                        | التنفيذ الأصلي                                                       | المعالجة                                                                                           |
| ----------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| النص/الأيقونات/الشارات/التقدم | `packages/ui/src/primitives.ts`                                      | أُبقيت؛ صُحّح التباين والاستخدام الدلالي دون تغيير العقود                                          |
| الأزرار                       | `packages/ui/src/buttons.ts`، `apps/rep-mobile/src/server/ui/dom.ts` | أُبقيت facades؛ توحيد focus/disabled وتصحيح الأزرار ذات النص، وحماية انتظار callbacks للمندوب      |
| النماذج                       | `packages/ui/src/forms.ts`، `apps/rep-mobile/src/server/ui/forms.ts` | ربط التلميحات والأخطاء واتجاه الحقول بواسطة shared enhancement؛ helper مباشر في typed server forms |
| عناوين الصفحات                | `packages/ui/src/page-heads.ts`                                      | أُبقيت؛ التفاف متجاوب وإزالة قيود العرض الدنيا بدل إعادة تركيب الصفحات                             |
| التنقل                        | runtime demo، generic live workspace، dedicated rep workspace        | تنظيم سطح المكتب ببيانات navigation مستقلة؛ الحفاظ على router الأصلي، تركيز main عند الانتقال فقط  |
| الحالات                       | runtime toast/empty/modal، live notices، rep state rendering         | أسطح `statePanel` مشتركة للمندوب ورسالة اتصال عامة؛ لا إسناد كاذب لمزامنة offline                  |

الفحص الآلي لأجسام function declarations الأصلية ≥80 محرفًا مطبّعًا لم يجد نسخة متطابقة عبر ملفين ضمن 79 ملفًا و331 دالة. لا يشمل ذلك كل arrow function أو equivalence دلالية. يشمل جرد CSS ثمانية ملفات، وقيم الألوان والخصائص الفيزيائية directional؛ لا تُستبدل جميعها آليًا لأن بعض الأسهم والخرائط ذات اتجاه مقصود.

## Tokens

`enterprise.css` تُحمّل أخيرًا، وتضيف namespace `--elv-*` دون حذف tokens العلامة الأصلية. تشمل سلم spacing، radii، text/muted/surface/accent/error/focus/border، هدف تحكم 44px، وظلالًا. 44px قرار تصميم؛ ليست ادعاء أن معيار WCAG 2.2 AA يشترط 44px في كل حالة. القياسات الآلية لا تعوّض التحقق من استثناءات حجم الهدف والتباين في المحتوى الديناميكي.

استخدم الخصائص المنطقية `inline/block` و`min-inline-size: 0` في flex/grid. استخدم اتجاه LTR للبريد والهاتف والأرقام والمدخلات الزمنية، و`dir="auto"` للنص الحر. للقيم غير الموثوقة استخدم `isolatedText(value)` الذي ينشئ `bdi` باستخدام `textContent`؛ لا يدخل HTML إلى الصفحة.

## Shared enhancement

```ts
import { installEnterpriseUx } from '@elvorance/ui/enterprise-ux';

const root = document.getElementById('app');
if (!root) throw new Error('Application root is missing.');
const dispose = installEnterpriseUx(root, {
  mode: 'server',
});
// Call dispose when the host destroys this application root.
```

تُفصل مسؤوليات العرض عن routing وauthorization وfetch. installation واحدة لكل root، وتُزال listeners وMutationObserver والعقد المملوكة عند dispose أو إعادة التثبيت. `describeWith` يضيف إلى aria-describedby الموجود ولا يستبدله. لا تُسرق نقطة التركيز عند إعادة رسم المسار نفسه أو الكتابة في حقل. لا تُجعل شجرة التطبيق كلها live region؛ تستخدم الحالات والتنبيهات مناطق مخصصة.

## النماذج والحالات

الأخطاء تستند إلى native validity والرسائل المخصصة الموجودة. لا تُضاف `novalidate`، ولا تُغيّر payloads أو الصلاحيات أو APIs. summary links تركز الحقل ولا تغيّر hash route. Pending guard يلتقط FormData وحالات disabled قبل استدعاء handler، ثم يعيدها بعد النجاح أو الفشل. تظل idempotency والخروج من الجلسة ملكًا للمكونات الأصلية.

`statePanel` يدعم loading/empty/success/error/offline. error يستخدم alert، والبقية status. التطبيق يملك زر retry وسلوك القرار. رسائل الشبكة مبنية على إشارة navigator، وليست health check للخادم، ولا تُنشئ queue أو تعيد أي عملية تلقائيًا.

## تغييرات تحتاج مراجعة بشرية

توسّع مجموعات الشريط الجانبي وإخفاء الزخرفة الترويجية، تباين الشارات، outlines، تصحيح اسم أزرار KPI ليطابق النص المرئي، role الخريطة الحاوية لعناصر تفاعلية، والتفاف أزرار الجوال تغييرات مقصودة موثقة بالصور. نجاح المقارنة لا يمنح اعتمادًا بصريًا مستقلًا. التصميم الأصلي وأفعال البيانات محفوظة في مجموعة parity والسلوك دون تحديث baselines لإخفاء فشل.

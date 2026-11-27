# Sprint 08 — Client Application

## نطاق التشغيل

23 شاشة عرض و6 شاشة خادم رئيسية؛ 128 حالة متصفح بالأحجام 320 و390 و768 و1440، مع حالات فارغة وفشل خدمة إضافية. مخالفات axe المتكررة: 83 قبل التعديل، صفر بعده. لا توجد أخطاء pageerror أو تجاوز أفقي بعد التعديل. الأرقام تخص القواعد والحالات المختبرة، لا شهادة WCAG كاملة.

## التغييرات والآثار

أُصلح تجاوز الصفحة الرئيسية عند 320px، وعرض نص زر الرسائل دون ضغطه في مربع أيقونة، والتفاف أزرار القرارات. أصبحت أسماء KPI مطابقة لمحتواها المرئي، مع الحفاظ على drilldowns. حُسنت أخطاء النماذج وربط التلميحات، واتجاه البريد والهاتف والنصوص المختلطة. نُفّذ حفظ ملف العميل الأصلي فعليًا داخل بيانات العرض وأُعيد فتحه للتحقق من بقاء القيم. لا يوجد دفع إلكتروني جديد، ولا تحويل بيانات العرض إلى بيانات تشغيلية.

## نتائج السلوك والقيود

فُحصت 23 صفحة عرض وستة أقسام حية. اجتاز نموذج الملف الشخصي اختبار تنقل لوحة المفاتيح عند 390px دون حجب نقطة التركيز بشريط التنقل الثابت. يتطلب القبول النهائي رحلة هوية وبيانات عميل حقيقية وعزل حسابه على Staging؛ اختبارات هذا السبرنت لا تستبدلها.

التحقق العام نجح: الأنواع والبناء والحدود، 315 اختبار Node محليًا مع تجاوز PostgreSQL واحد معلن، و7 مجموعات عدم تراجع أصلية. لا تُنقل نتيجة CI من main إلى التعديلات؛ يلزم نجاح PR المنشور على SHA النهائي.

## الشاشات المنفذة

| الوضع  | المسار               | الحالات | مخالفات قبل ← بعد | مصدر الشاشة                                          |
| ------ | -------------------- | ------: | ----------------: | ---------------------------------------------------- |
| demo   | `account`            |       4 |             4 ← 0 | `apps/client-mobile/src/features/account/index.ts`   |
| demo   | `contract-detail`    |       4 |             4 ← 0 | `apps/client-mobile/src/features/contracts/index.ts` |
| demo   | `contracts`          |       4 |             3 ← 0 | `apps/client-mobile/src/features/contracts/index.ts` |
| demo   | `decisions`          |       4 |             2 ← 0 | `apps/client-mobile/src/features/dashboard/index.ts` |
| demo   | `deliverable-detail` |       4 |             6 ← 0 | `apps/client-mobile/src/features/projects/index.ts`  |
| demo   | `home`               |       4 |             4 ← 0 | `apps/client-mobile/src/features/dashboard/index.ts` |
| demo   | `invoice-detail`     |       4 |             2 ← 0 | `apps/client-mobile/src/features/billing/index.ts`   |
| demo   | `invoices`           |       4 |             3 ← 0 | `apps/client-mobile/src/features/billing/index.ts`   |
| demo   | `messages`           |       4 |             4 ← 0 | `apps/client-mobile/src/features/messages/index.ts`  |
| demo   | `needs-survey`       |       4 |             2 ← 0 | `apps/client-mobile/src/features/discovery/index.ts` |
| demo   | `new-ticket`         |       4 |             3 ← 0 | `apps/client-mobile/src/features/support/index.ts`   |
| demo   | `preferences`        |       4 |             3 ← 0 | `apps/client-mobile/src/features/account/index.ts`   |
| demo   | `profile`            |       4 |             2 ← 0 | `apps/client-mobile/src/features/account/index.ts`   |
| demo   | `project-detail`     |       4 |             6 ← 0 | `apps/client-mobile/src/features/projects/index.ts`  |
| demo   | `projects`           |       4 |             3 ← 0 | `apps/client-mobile/src/features/projects/index.ts`  |
| demo   | `quote-detail`       |       4 |             6 ← 0 | `apps/client-mobile/src/features/quotes/index.ts`    |
| demo   | `quotes`             |       4 |             3 ← 0 | `apps/client-mobile/src/features/quotes/index.ts`    |
| demo   | `request-service`    |       4 |             2 ← 0 | `apps/client-mobile/src/features/catalog/index.ts`   |
| demo   | `requests`           |       4 |             2 ← 0 | `apps/client-mobile/src/features/catalog/index.ts`   |
| demo   | `service-detail`     |       4 |             2 ← 0 | `apps/client-mobile/src/features/catalog/index.ts`   |
| demo   | `services`           |       4 |             2 ← 0 | `apps/client-mobile/src/features/catalog/index.ts`   |
| demo   | `support`            |       4 |             3 ← 0 | `apps/client-mobile/src/features/support/index.ts`   |
| demo   | `ticket-detail`      |       4 |             4 ← 0 | `apps/client-mobile/src/features/support/index.ts`   |
| server | `contracts`          |       6 |             4 ← 0 | `packages/api-client/src/live-workspace.ts`          |
| server | `invoices`           |       6 |             0 ← 0 | `packages/api-client/src/live-workspace.ts`          |
| server | `notifications`      |       6 |             0 ← 0 | `packages/api-client/src/live-workspace.ts`          |
| server | `projects`           |       6 |             0 ← 0 | `packages/api-client/src/live-workspace.ts`          |
| server | `quotes`             |       6 |             4 ← 0 | `packages/api-client/src/live-workspace.ts`          |
| server | `tickets`            |       6 |             0 ← 0 | `packages/api-client/src/live-workspace.ts`          |

تتضمن `screen-acceptance.csv` أسماء لقطات قبل/بعد المطابقة لكل صفحة وحجم. تُنشر ملفات PNG الأصلية ومقارنة البكسل ضمن أدلة المحادثة وartifact بوابة Enterprise UX عند تشغيلها. القبول البصري المستقل وقارئات الشاشة والأجهزة ما زالت مطلوبة.

## مراجعة غير محسومة آليًا

يبقى التباين بحاجة إلى مراجعة يدوية في 27 حالة لهذا التطبيق. تفاصيل القواعد والصفحات والأحجام في `axe-manual-review.json`؛ لا تُحسب النتائج غير المحسومة نجاحًا ولا تُخفى من القبول.

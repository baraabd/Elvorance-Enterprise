# Sprint 08 — Admin Web

## نطاق التشغيل

25 شاشة عرض و11 شاشة خادم رئيسية؛ 166 حالة متصفح بالأحجام 320 و390 و768 و1440، مع حالات فارغة وفشل خدمة إضافية. مخالفات axe المتكررة: 94 قبل التعديل، صفر بعده. لا توجد أخطاء pageerror أو تجاوز أفقي بعد التعديل. الأرقام تخص القواعد والحالات المختبرة، لا شهادة WCAG كاملة.

## التغييرات والآثار

أضيفت مجموعات تنقل ثانوية للمبيعات والعمليات والإدارة، مع إبقاء المسارات و`data-go` الأصلية. أصبحت جداول البيانات التي تتجاوز حاويتها قابلة للتركيز والتمرير بلوحة المفاتيح، وحُسنت أسماء عناصر الخريطة والمستخدم والتباين والشارات. احتُفظ بأفعال CRUD وطرق التحميل كما هي؛ لا توجد إعادة تعريف لصلاحيات الإدارة أو قبول لبيانات KPI إنتاجية.

## نتائج السلوك والقيود

فُحصت صفحات الإدارة الرئيسية والتفاصيل والتقارير والإعدادات في وضع العرض، والأقسام الحية الـ11 باستخدام renderer الأصلي. تظل مراجعة جميع صلاحيات الأدوار والبيانات الحقيقية واختبار قارئ شاشة خارجي متطلبات قبول منفصلة.

التحقق العام نجح: الأنواع والبناء والحدود، 315 اختبار Node محليًا مع تجاوز PostgreSQL واحد معلن، و7 مجموعات عدم تراجع أصلية. لا تُنقل نتيجة CI من main إلى التعديلات؛ يلزم نجاح PR المنشور على SHA النهائي.

## الشاشات المنفذة

| الوضع  | المسار             | الحالات | مخالفات قبل ← بعد | مصدر الشاشة                                          |
| ------ | ------------------ | ------: | ----------------: | ---------------------------------------------------- |
| demo   | `analytics`        |       4 |             4 ← 0 | `apps/admin-web/src/features/analytics/index.ts`     |
| demo   | `approvals`        |       4 |             2 ← 0 | `apps/admin-web/src/features/approvals/index.ts`     |
| demo   | `client-detail`    |       4 |             4 ← 0 | `apps/admin-web/src/features/customers/index.ts`     |
| demo   | `clients`          |       4 |             4 ← 0 | `apps/admin-web/src/features/customers/index.ts`     |
| demo   | `configuration`    |       4 |             2 ← 0 | `apps/admin-web/src/features/configuration/index.ts` |
| demo   | `conversation`     |       4 |             2 ← 0 | `apps/admin-web/src/features/messages/index.ts`      |
| demo   | `home`             |       4 |             2 ← 0 | `apps/admin-web/src/features/dashboard/index.ts`     |
| demo   | `invoice-detail`   |       4 |             2 ← 0 | `apps/admin-web/src/features/billing/index.ts`       |
| demo   | `invoices`         |       4 |             2 ← 0 | `apps/admin-web/src/features/billing/index.ts`       |
| demo   | `live-tracking`    |       4 |             2 ← 0 | `apps/admin-web/src/features/workforce/index.ts`     |
| demo   | `messages`         |       4 |             2 ← 0 | `apps/admin-web/src/features/messages/index.ts`      |
| demo   | `more`             |       4 |             2 ← 0 | `apps/admin-web/src/features/settings/index.ts`      |
| demo   | `opportunity`      |       4 |             4 ← 0 | `apps/admin-web/src/features/pipeline/index.ts`      |
| demo   | `pipeline`         |       4 |             4 ← 0 | `apps/admin-web/src/features/pipeline/index.ts`      |
| demo   | `project-detail`   |       4 |             2 ← 0 | `apps/admin-web/src/features/projects/index.ts`      |
| demo   | `projects`         |       4 |             2 ← 0 | `apps/admin-web/src/features/projects/index.ts`      |
| demo   | `settings`         |       4 |             2 ← 0 | `apps/admin-web/src/features/settings/index.ts`      |
| demo   | `support`          |       4 |             4 ← 0 | `apps/admin-web/src/features/support/index.ts`       |
| demo   | `tasks`            |       4 |             2 ← 0 | `apps/admin-web/src/features/tasks/index.ts`         |
| demo   | `team`             |       4 |             6 ← 0 | `apps/admin-web/src/features/workforce/index.ts`     |
| demo   | `team-member`      |       4 |             6 ← 0 | `apps/admin-web/src/features/workforce/index.ts`     |
| demo   | `territories`      |       4 |             4 ← 0 | `apps/admin-web/src/features/territories/index.ts`   |
| demo   | `ticket-detail`    |       4 |             6 ← 0 | `apps/admin-web/src/features/support/index.ts`       |
| demo   | `visits-completed` |       4 |             2 ← 0 | `apps/admin-web/src/features/dashboard/index.ts`     |
| demo   | `zone-detail`      |       4 |             4 ← 0 | `apps/admin-web/src/features/territories/index.ts`   |
| server | `approvals`        |       6 |             0 ← 0 | `packages/api-client/src/live-workspace.ts`          |
| server | `contracts`        |       6 |             4 ← 0 | `packages/api-client/src/live-workspace.ts`          |
| server | `customers`        |       6 |             4 ← 0 | `packages/api-client/src/live-workspace.ts`          |
| server | `invoices`         |       6 |             0 ← 0 | `packages/api-client/src/live-workspace.ts`          |
| server | `memberships`      |       6 |             0 ← 0 | `packages/api-client/src/live-workspace.ts`          |
| server | `notifications`    |       6 |             0 ← 0 | `packages/api-client/src/live-workspace.ts`          |
| server | `projects`         |       6 |             0 ← 0 | `packages/api-client/src/live-workspace.ts`          |
| server | `quotes`           |       6 |             4 ← 0 | `packages/api-client/src/live-workspace.ts`          |
| server | `regions`          |       6 |             0 ← 0 | `packages/api-client/src/live-workspace.ts`          |
| server | `tickets`          |       6 |             0 ← 0 | `packages/api-client/src/live-workspace.ts`          |
| server | `visits`           |       6 |             4 ← 0 | `packages/api-client/src/live-workspace.ts`          |

تتضمن `screen-acceptance.csv` أسماء لقطات قبل/بعد المطابقة لكل صفحة وحجم. تُنشر ملفات PNG الأصلية ومقارنة البكسل ضمن أدلة المحادثة وartifact بوابة Enterprise UX عند تشغيلها. القبول البصري المستقل وقارئات الشاشة والأجهزة ما زالت مطلوبة.

## مراجعة غير محسومة آليًا

يبقى التباين بحاجة إلى مراجعة يدوية في 12 حالة لهذا التطبيق. تفاصيل القواعد والصفحات والأحجام في `axe-manual-review.json`؛ لا تُحسب النتائج غير المحسومة نجاحًا ولا تُخفى من القبول.

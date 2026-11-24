# Sprint 08 — Representative Application

## نطاق التشغيل

21 شاشة عرض و16 شاشة خادم رئيسية؛ 180 حالة متصفح بالأحجام 320 و390 و768 و1440، مع حالات فارغة وفشل خدمة إضافية. مخالفات axe المتكررة: 21 قبل التعديل، صفر بعده. لا توجد أخطاء pageerror أو تجاوز أفقي بعد التعديل. الأرقام تخص القواعد والحالات المختبرة، لا شهادة WCAG كاملة.

## التغييرات والآثار

كشفت المراجعة البصرية تداخل عناوين تنقل المندوب على الجوال، رغم عدم وجود تجاوز أفقي للصفحة؛ مُنع flex-shrink للأزرار وأضيف فحص مستقل لتجاوز نص العنوان لحدود الزر. صُحّح اتجاه placeholder العربي الفارغ مع الإبقاء على dir=auto عند إدخال النص. أُدرجت الطبقة المشتركة في entrypoints العرض والخادم وحزمة الإصدار الصارمة. استُخدم `bdi` للقيم المعروضة، وربطت أوصاف الحقول بمعرفات فريدة، وأضيفت أسطح loading/empty/error. تحسّنت حالة انتظار الأزرار واستعادة النماذج بعد الفشل. اختُبر النموذج الفعلي لإنشاء العميل مع transport اختباري: منع الطلب المكرر، إبقاء المسودة عند 503، منع الإرسال أثناء offline، عدم الإرسال التلقائي عند عودة الشبكة، وإعادة استخدام idempotency key عند المحاولة الصريحة.

## نتائج السلوك والقيود

فُحصت 21 صفحة عرض و16 مساحة متصلة، إضافة إلى سبعة أقسام توافق قديمة في 42 حالة مستقلة. لا تمثل هذه الحالات تشغيل Android/iOS فعليًا، ولا إذن موقع أو تحسين مسار أو مزامنة offline جديدة. ظل فصل demo عن حزمة الخادم الصارمة شرطًا غير قابل للتجاوز.

التحقق العام نجح: الأنواع والبناء والحدود، 315 اختبار Node محليًا مع تجاوز PostgreSQL واحد معلن، و7 مجموعات عدم تراجع أصلية. لا تُنقل نتيجة CI من main إلى التعديلات؛ يلزم نجاح PR المنشور على SHA النهائي.

## الشاشات المنفذة

| الوضع  | المسار                | الحالات | مخالفات قبل ← بعد | مصدر الشاشة                                           |
| ------ | --------------------- | ------: | ----------------: | ----------------------------------------------------- |
| demo   | `catalog`             |       4 |             0 ← 0 | `apps/rep-mobile/src/features/catalog/index.ts`       |
| demo   | `client-detail`       |       4 |             0 ← 0 | `apps/rep-mobile/src/features/customers/index.ts`     |
| demo   | `client-form`         |       4 |             0 ← 0 | `apps/rep-mobile/src/features/customers/index.ts`     |
| demo   | `clients`             |       4 |             0 ← 0 | `apps/rep-mobile/src/features/customers/index.ts`     |
| demo   | `home`                |       4 |             8 ← 0 | `apps/rep-mobile/src/features/dashboard/index.ts`     |
| demo   | `messages`            |       4 |             0 ← 0 | `apps/rep-mobile/src/features/messages/index.ts`      |
| demo   | `more`                |       4 |             0 ← 0 | `apps/rep-mobile/src/features/account/index.ts`       |
| demo   | `opportunities`       |       4 |             0 ← 0 | `apps/rep-mobile/src/features/opportunities/index.ts` |
| demo   | `opportunity-detail`  |       4 |             0 ← 0 | `apps/rep-mobile/src/features/opportunities/index.ts` |
| demo   | `profile`             |       4 |             0 ← 0 | `apps/rep-mobile/src/features/account/index.ts`       |
| demo   | `quote-builder`       |       4 |             0 ← 0 | `apps/rep-mobile/src/features/quotes/index.ts`        |
| demo   | `quote-detail`        |       4 |             1 ← 0 | `apps/rep-mobile/src/features/quotes/index.ts`        |
| demo   | `quotes`              |       4 |             0 ← 0 | `apps/rep-mobile/src/features/quotes/index.ts`        |
| demo   | `service-detail`      |       4 |             0 ← 0 | `apps/rep-mobile/src/features/catalog/index.ts`       |
| demo   | `tasks`               |       4 |             0 ← 0 | `apps/rep-mobile/src/features/tasks/index.ts`         |
| demo   | `territory`           |       4 |             8 ← 0 | `apps/rep-mobile/src/features/territory/index.ts`     |
| demo   | `visit-active`        |       4 |             0 ← 0 | `apps/rep-mobile/src/features/visits/index.ts`        |
| demo   | `visit-checkin`       |       4 |             0 ← 0 | `apps/rep-mobile/src/features/visits/index.ts`        |
| demo   | `visit-detail`        |       4 |             2 ← 0 | `apps/rep-mobile/src/features/visits/index.ts`        |
| demo   | `visit-outcome`       |       4 |             2 ← 0 | `apps/rep-mobile/src/features/visits/index.ts`        |
| demo   | `visit-questionnaire` |       4 |             0 ← 0 | `apps/rep-mobile/src/features/discovery/index.ts`     |
| server | `account`             |       6 |             0 ← 0 | `apps/rep-mobile/src/server/workspace.ts`             |
| server | `billing`             |       6 |             0 ← 0 | `apps/rep-mobile/src/server/workspace.ts`             |
| server | `catalog`             |       6 |             0 ← 0 | `apps/rep-mobile/src/server/workspace.ts`             |
| server | `contracts`           |       6 |             0 ← 0 | `apps/rep-mobile/src/server/workspace.ts`             |
| server | `customers`           |       6 |             0 ← 0 | `apps/rep-mobile/src/server/workspace.ts`             |
| server | `home`                |       6 |             0 ← 0 | `apps/rep-mobile/src/server/workspace.ts`             |
| server | `messages`            |       6 |             0 ← 0 | `apps/rep-mobile/src/server/workspace.ts`             |
| server | `notifications`       |       6 |             0 ← 0 | `apps/rep-mobile/src/server/workspace.ts`             |
| server | `opportunities`       |       6 |             0 ← 0 | `apps/rep-mobile/src/server/workspace.ts`             |
| server | `projects`            |       6 |             0 ← 0 | `apps/rep-mobile/src/server/workspace.ts`             |
| server | `quotes`              |       6 |             0 ← 0 | `apps/rep-mobile/src/server/workspace.ts`             |
| server | `routes`              |       6 |             0 ← 0 | `apps/rep-mobile/src/server/workspace.ts`             |
| server | `support`             |       6 |             0 ← 0 | `apps/rep-mobile/src/server/workspace.ts`             |
| server | `tasks`               |       6 |             0 ← 0 | `apps/rep-mobile/src/server/workspace.ts`             |
| server | `tracking`            |       6 |             0 ← 0 | `apps/rep-mobile/src/server/workspace.ts`             |
| server | `visits`              |       6 |             0 ← 0 | `apps/rep-mobile/src/server/workspace.ts`             |

تتضمن `screen-acceptance.csv` أسماء لقطات قبل/بعد المطابقة لكل صفحة وحجم. تُنشر ملفات PNG الأصلية ومقارنة البكسل ضمن أدلة المحادثة وartifact بوابة Enterprise UX عند تشغيلها. القبول البصري المستقل وقارئات الشاشة والأجهزة ما زالت مطلوبة.

## مراجعة غير محسومة آليًا

يبقى التباين بحاجة إلى مراجعة يدوية في 8 حالة لهذا التطبيق. تفاصيل القواعد والصفحات والأحجام في `axe-manual-review.json`؛ لا تُحسب النتائج غير المحسومة نجاحًا ولا تُخفى من القبول.

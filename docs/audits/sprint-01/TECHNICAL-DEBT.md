# Technical Debt Register — Sprint 01

> Historical audit of `main@12264edff0f8e5f1d241188aed65a0aa8e9992cb` and
> PR #4 at `161e7fdb39c02e43c4761f6385a28b7dff832ecb` on 21 November 2026.
> References to main and PR state below are NOT current status. For the 23 November
> reconciliation, see [PR-RECONCILIATION](../../production/PR-RECONCILIATION.md).

| ID   | الدين ومصدره                                    | الأولوية | الإجراء المطلوب                                       | معيار القبول                                    | الحالة                                   |
| ---- | ----------------------------------------------- | -------- | ----------------------------------------------------- | ----------------------------------------------- | ---------------------------------------- |
| TD01 | 97/95 ملفًا مع ts-nocheck؛ `audit:migration`    | عالية    | ترحيل feature-by-feature بدل حذف التوجيه آليًا        | أنواع فعلية واختبارات دون any بديل              | مفتوح                                    |
| TD02 | واجهتا demo/live منفصلتان؛ `apps/*/src/main.ts` | عالية    | تعريف نطاق منتج وربط تدريجي مع عقود API               | كل وظيفة release-scope مرتبطة ومختبرة           | مفتوح                                    |
| TD03 | نقص configuration في route-inventory في main    | متوسطة   | توليد/تحقق ثنائي الاتجاه من تسجيل HTTP                | لا عمليات غير موثقة ولا عقود وهمية              | كشفه المولّد؛ لم يعدل العقد              |
| TD04 | اختبارات التسجيل تعد baseline لا الحالي         | متوسطة   | فصل baseline وactual وrendered counts وإضافة fixtures | 69 شاشة مغطاة أو استثناءات مصرح بها             | مفتوح                                    |
| TD05 | JSONB عام مع قيود وفهارس متفاوتة                | متوسطة   | قياس خطط الاستعلام وإضافة فهارس مستندة للحمل          | أهداف زمنية تحت حجم بيانات معلوم                | لم يُنفّذ benchmark                      |
| TD06 | قفل لكل tenant حتى للقراءة                      | متوسطة   | تضييق القفل دون إضعاف idempotency/consistency         | اختبارات تنافس وقياسات قبل/بعد                  | مفتوح                                    |
| TD07 | CI يفحص migration report لا strict gate         | عالية    | baseline مانع للديون الجديدة ثم خفض تدريجي            | لا زيادة في الاستثناءات وعتبة وصول واضحة        | مفتوح                                    |
| TD08 | أدلة PR #4 في الوصف تشير إلى رؤوس أقدم          | متوسطة   | إسناد كل ادعاء إلى SHA/job/artifact محدد              | لا نقل نتائج بين النسخ                          | مصحح في تقرير Sprint فقط                 |
| TD09 | حفظ latest evidence مولد في حزم المصدر          | منخفضة   | فصل المصدر عن نتائج التشغيل ذات المدة المحددة         | source manifest واضح وأدلة immutable            | موثق ولم يُغيّر التغليف                  |
| TD10 | لا قياس شامل لتغطية RBAC/ownership السلبية      | عالية    | مصفوفة role × operation × tenant × owner              | allow/deny/replay/account-switch لكل عملية مهمة | جرد السياسات موجود؛ التنفيذ الكامل متبقٍ |
| TD11 | Gateway غير متسق مع طبقة HTTP المشتركة          | متوسطة   | المحافظة على 4xx وقيد مهلة وإخفاء الأخطاء             | خمسة اختبارات جديدة تمر                         | إصلاح على فرع Sprint 01                  |

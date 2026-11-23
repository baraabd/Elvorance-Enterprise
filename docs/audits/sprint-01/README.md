> Historical snapshot: the branch states, counts and results below belong to the explicitly identified 21 November revisions. See [23 November reconciliation](RECONCILIATION-20261123.md) and `docs/production/` for the current foundation.

# Sprint 01 — تدقيق المصدر والتحقق والإصلاح المحدود

التاريخ: 2026-11-21. النطاق: Admin Web وClient App وRepresentative App. هذه نتيجة فحص مصدر وتشغيل اختبارات، وليست موافقة إطلاق أو شهادة خلو من الثغرات.

## النسخ ومصدر الأدلة

| النسخة                  | SHA الذي جرى فحصه                          | الملاحظة                                          |
| ----------------------- | ------------------------------------------ | ------------------------------------------------- |
| main                    | `12264edff0f8e5f1d241188aed65a0aa8e9992cb` | أساس فرع Sprint 01، دون دمج #4                    |
| PR #3                   | `a664aec49646c365bf5cbed24fd094360677d80e` | مسودة؛ إضافة وثيقة بوابة إطلاق فقط، 60 سطرًا      |
| PR #4                   | `161e7fdb39c02e43c4761f6385a28b7dff832ecb` | مسودة؛ 231 ملفًا متغيرًا؛ لم تُدمج                |
| دمج الاختبار الآلي لـ#4 | `c63849392ac1dfb02cee00b6a4ef52b5d1a6fa53` | SHA الذي أخرجه checkout في CI، وليس دمجًا في main |

كان #3 و#4 جميع طلبات السحب المفتوحة عند بدء المهمة. جرى استرجاع فرق #3 كاملًا وقائمة ملفات #4 عبر جميع صفحات GitHub، وفحص المصدر المعبأ للفرعين، لا الاكتفاء بوصف الطلبين.

تعذّر git clone وnpm ci محليًا بسبب DNS. جرى الحصول على المصدر من حزم GitHub Actions المرتبطة بالنسخ أعلاه، والتحقق من SHA256 للحزم. حزمة main: artifact `14354567522`؛ حزمة #4: `14510026044`. هذه حزم مصدر تحتوي أيضًا أدلة ومعاينات مولدة؛ ليست نسخة Git محلية بتاريخ المستودع الكامل.

أُعيد تشغيل مهمة التحقق `136981828503` ضمن run `44484026605` للحصول على Node 24.22.1 والتبعيات. طابقت 202 تبعية خارجية مثبتة إصدارات lockfile في main، وغابت 25 تبعية منصات اختيارية فقط. أُجريت الفحوص المحلية باستدعاء Node مباشرة، لا بادعاء نجاح npm ci محليًا. طابقت بصمة ملف Gateway الأصلي GitHub: `6f1fc55ef36213c93a2c5ce572493e42a09e7180`.

## المعمارية والتقنيات الفعلية

`main` يحتوي 21 workspace: ثلاثة تطبيقات، عشر حزم مشتركة، وثماني خدمات تشمل Gateway وسبعة نطاقات أعمال. #4 يضيف `packages/mobile-auth` ليصبح العدد 22. الواجهة TypeScript وDOM وCSS مع esbuild، وليست React أو Next.js. Client وRepresentative يستخدمان Capacitor.

الإصدارات المثبتة في manifests/lockfile: TypeScript 5.9.3، esbuild 0.28.2، Fastify 5.12.8، pg 8.23.1، jose 6.2.17، amqplib 0.10.9، Capacitor core/android/ios 8.6.2، jsdom 31.0.0، Prettier 3.6.2. يضيف #4 oauth4webapi 3.8.8. متطلبات الجذر Node >=24.15 <25 وnpm >=11 <12.

```text
التطبيقات الثلاثة
  ├─ demo → app-runtime → demo-data / local state
  └─ server → api-client → API Gateway
                              ├─ identity → قاعدة identity
                              ├─ crm → قاعدة crm
                              ├─ sales → قاعدة sales
                              ├─ delivery → قاعدة delivery
                              ├─ billing → قاعدة billing
                              ├─ tracking → قاعدة tracking
                              └─ communications → قاعدة communications
الخدمات → transactional outbox → RabbitMQ → transactional inbox → إسقاطات الخدمات
```

حدود الاعتماد: التطبيقات تعتمد على API/العقود/حزم الواجهة، لا على كود الخدمات. الخدمات تعتمد على contracts وservice-kit وevents، ولا تستورد تنفيذ خدمة أخرى. فحص الحدود الساكن اجتاز النسختين. هذه نتيجة رسم الاستيرادات وليست وحدها إثبات عزل قواعد البيانات.

| النطاق         | الملكية الرئيسية                                                                                                   | العمليات في main | العمليات في #4 |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------: | -------------: |
| identity       | tenant_profiles، memberships؛ ويضيف #4 profiles                                                                    |                5 |              6 |
| crm            | customers، regions، configuration؛ ويضيف #4 discovery                                                              |                9 |             12 |
| sales          | visits، quotes، contracts، fulfillments، customer_contexts؛ ويضيف #4 tasks/opportunities/routes/discount approvals |               18 |             35 |
| delivery       | projects                                                                                                           |                8 |              8 |
| billing        | invoices، payments، contract_accounts                                                                              |                5 |              5 |
| tracking       | tracking_sessions                                                                                                  |                6 |              6 |
| communications | tickets، notifications؛ ويضيف #4 conversations/messages/receipts                                                   |                7 |             12 |
| المجموع        | لا يشمل health/ready وproxy wildcard                                                                               |               58 |             84 |

في main يوجد 56 بندًا في `packages/contracts/route-inventory.json` لكن المصدر يسجّل أيضًا `GET /v1/configuration` و`PUT /v1/configuration` في CRM. لذلك العدد الفعلي 58 وليس 56. المساران موثّقان في #4. يحتفظ الجرد بالفصل بين التصريح بالعقد والتسجيل الفعلي.

## الشاشات والوظائف والصلاحيات

أكد الفحص الساكن وتسجيل التطبيقات الفعلي في JSDOM وجود 69 شاشة تجريبية و143 إجراءً: Admin ‏25/53، Client ‏23/31، Representative ‏21/59. هذه أعداد التسجيل، وليست عدد المسارات التي جرى اختبارها بصريًا. اختبارات التسجيل/parity الحالية تغطي مجموعة أساس من 64 شاشة فقط؛ عداد 122 في اختبار التسجيل حد أدنى للأوامر وليس العدد الحالي.

الشاشات الخمس خارج مجموعة الأساس لذلك الاختبار: Admin `configuration` و`visits-completed`، Client `decisions` و`needs-survey`، Representative `visit-questionnaire`. قد تغطي اختبارات أخرى أجزاءً منها؛ لم يُدّع غياب كل اختبار عنها.

في main، server mode يستخدم `packages/api-client/src/live-workspace.ts` بدل شاشات demo: عشرة أقسام Admin، وستة Client، وسبعة Representative. يدعم القراءة وإنشاء العميل/تذكرة الدعم في النطاق المحدد، وليس كامل رحلة الأعمال. الإعداد الافتراضي في `config.example.ts` وبناء التطبيقات هو demo. توجد مزامنة اختيارية لإعدادات الاستبيان عبر API عند تهيئتها؛ لذلك لا يصح القول إن كل شيفرة demo محلية حصريًا.

يضيف #4 مساحة Representative مستقلة من 16 صفحة خادم، وقرارات تجارية في مساحة Admin/Client، وOIDC/PKCE وتخزينًا أصليًا آمنًا. وجود هذه التطبيقات واختباراتها لا يثبت قبولها على استضافة أو جهاز حقيقي.

الصلاحيات المعلنة الست: admin، rep، client، finance، delivery، support. توثّق ملفات الجرد الدور لكل عملية ومسار handler وأسطر الدوال والسياسات ذات الصلة. يعتمد الخادم على JWT متحقق منه وtenantId وrepId/clientId؛ لا يعتمد على ادعاءات الدور في ترويسات المتصفح. `requireRole` و`requireOwner` والتحقق من الإسناد الحالية تكمّل RLS. بيانات membership في قاعدة identity ليست بذاتها إصدارًا جديدًا لصلاحيات مزود الهوية.

التصنيف في [Feature Gap Matrix](FEATURE-GAPS.md) يفرّق بين مكتمل ضمن اختبار محدد، وجزئي، وغير مرتبط بمساحة الخادم، ومعطل مثبت، وغير موجود في المصدر المفحوص. لم يُمنح أي تطبيق تصنيف «مكتمل للإنتاج».

## البيانات والتزامن والتكامل

تملك كل خدمة نطاقها وقاعدة اتصالها؛ migrations موجودة كملفات TypeScript داخل `services/*/src/infrastructure/migrations/` وليست بالضرورة ملفات SQL منفصلة. التخزين يستخدم JSONB وversion وtenant_id مع forced RLS. خارج جداول النطاق توجد بنية outbox/inbox/idempotency_keys/schema_migrations.

يستخدم `command` مفاتيح idempotency وبصمة تشمل principal والمعطيات، وتراجع بعض العمليات الإسناد حتى عند إعادة النتيجة المخزنة. التعديلات تتطلب expectedVersion؛ التعارض يعيد 409. في main، `PgRepository.transaction` يأخذ قفلًا لكل خدمة/مستأجر حتى لطلبات القراءة؛ لم يُقَس أثره على الأداء. كما يطبق list حد 1000 قبل بعض مرشحات الملكية، وهو خطر اقتطاع نتائج؛ #4 يضيف pagination وترشيحًا قبل حد الصفحة.

أحداث RabbitMQ ذات تسليم at-least-once، مع تأكيد نشر، outbox leases، inbox ذري، retry ثم dead-letter. ليست هناك معاملة ذرية مشتركة عبر الخدمات. موافقة العقد تؤدي إلى مشروع وفواتير عبر مستهلكين منفصلين؛ حالة fulfillment قد تبقى pending حتى اكتمالهما. سحب الموافقة/الإسناد يحتاج فحوصًا متزامنة حيث يلزم، لا الاعتماد على وصول الحدث وحده.

لا دليل في هذه المهمة على اختبارات حمل، استعادة نسخ احتياطية، مراقبة DLQ تشغيلية، أو تزامن كتابة offline. قاعدة PostgreSQL المستخدمة في CI مؤقتة وليست بيانات عميل.

## التنفيذ والفحوص

| الفحص                   | main قبل التعديل               | #4 محليًا            | Sprint 01 بعد التعديل               |
| ----------------------- | ------------------------------ | -------------------- | ----------------------------------- |
| TypeScript              | نجاح                           | نجاح                 | نجاح                                |
| حدود الحزم              | نجاح                           | نجاح                 | نجاح                                |
| بناء التطبيقات والخدمات | نجاح                           | نجاح                 | نجاح                                |
| اختبارات Node           | 109 نجاح + 1 تخطي PG           | 229 نجاح + 1 تخطي PG | 116 نجاح + 1 تخطي PG                |
| Design parity           | 64/64                          | 64/64                | نجاح                                |
| Regression              | 7/7 مجموعات                    | 7/7 مجموعات          | نجاح                                |
| Prettier                | نجاح                           | نجاح                 | نجاح                                |
| migration --strict      | فشل: 97 ملفًا يعطل فحص الأنواع | فشل: 95 ملفًا        | ليس هدف هذا الإصلاح إزالة الدين كله |

أُعيد تشغيل Linux verify لـ#4: run `44484026552`، job `136982817176`، checkout `c638493...`. سجل 21 نوفمبر يؤكد 230/230 نجاحًا، دون تخطي، مع PostgreSQL 16.16، ونجاح 7 اتصالات مالكة ورفض 42 اتصالًا عابرًا للخدمات. الفشل السابق في job `135422930786` كان إنهاء اتصال PostgreSQL بأمر إداري؛ نجاح الإعادة لا يثبت سبب الفشل ولا يصلحه.

المهمة native verify التي أُعيدت لا تعني إعادة تشغيل Android/iOS أو توقيع تطبيق. النتائج الأصلية للمحاكي/unsigned harness منفصلة عن اختبار الجهاز الفعلي. لم تُشغّل مهام release أو signing أو deploy.

## الإصلاح المحدود

`services/api-gateway/src/app.ts`: المحافظة على 400/413/415 لأخطاء الطلب بدل تحويلها إلى 500، إخفاء التفاصيل الداخلية، تسجيل أخطاء الخادم عند تفعيل logger، وضبط requestTimeout إلى 30 ثانية. لم يتغير منطق الأعمال أو مخطط البيانات أو endpoints.

`tests/backend/gateway-input-errors.test.ts`: خمسة اختبارات للـJSON المعطوب، الحجم الزائد، النوع غير المدعوم، إخفاء الخطأ/المهلة، والمحافظة على 401 وعدم forwarding. قبل الإصلاح: أربعة اختبارات جديدة تفشل؛ بعده: الخمسة تنجح. الاختبار الخامس يؤكد عقد المصادقة الموجود أصلًا.

هذا نقل محدود لسلوك موجود أصلًا في #4، وليس دمجًا لذلك الطلب؛ يجب تسوية التداخل عند دمج #4 لاحقًا. تمت إضافة مولّد جرد ساكن واختبارين له وإدراجه ضمن tsconfig. المولّد يكشف drift في الاتجاهين ولا يعدّ كائن صفحة routes بوصفه سجل شاشات demo.

## إعادة إنتاج الجرد والأدلة

```sh
node tooling/scripts/sprint01-inventory.mts . /tmp/elvorance-inventory.json <source-sha>
node node_modules/typescript/bin/tsc --noEmit
node tooling/scripts/check-boundaries.mts
node tooling/scripts/build-apps.mts
node tooling/scripts/build-services.mts
node tooling/scripts/test.mts
node tests/design-parity/parity.mts
node tooling/scripts/test-regression.mts
node node_modules/prettier/bin/prettier.cjs --check .
node tooling/scripts/audit-migration.mts --strict
```

يخرج مولّد الجرد برمز 1 عند مسارات غير موثّقة أو عقود بلا تسجيل؛ المتوقع في main وجود مساري CRM المذكورين. يحتوي الناتج manifests واعتماداتها، بصمات الملفات، الشاشات/الأوامر، API/الأدوار/مصادر السياسات، الدوال بما فيها callbacks، migrations والاختبارات وCI. استُبعدت ملفات native المولدة من عدادات TypeScript. عداد الملفات ليس نسبة مراجعة يدوية.

حزمة التسليم في المحادثة تتضمن JSON/CSV لكل نسخة، خرائط البيانات والتبعيات، سجلات التنفيذ والأكواد الخارجة، red/green، provenance والبصمات. [Risk Register](RISK-REGISTER.md) و[Technical Debt Register](TECHNICAL-DEBT.md) يحددان الإغلاق المطلوب.

## الحدود المتبقية

لم يُنفّذ قبول Hosted Staging، أو تسجيل OIDC حقيقي بحساب مستخدم، أو توقيع/توزيع، أو اختبار أجهزة فعلية، أو فحص اختراق شامل، أو مصفوفة سلبية كاملة لكل دور/عملية/ملكية. لم تُراجع كل دالة وكل سطر native يدويًا؛ جرى جرد آلي شامل ضمن النطاق المعلن ومراجعة يدوية مركزة للمداخل، الصلاحيات، النقل، التخزين، الأحداث، الاختبارات وCI. لا تعديل Production، ولا دمج PR، ولا نشر بيئة خلال هذه المهمة.

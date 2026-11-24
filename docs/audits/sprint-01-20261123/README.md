# Sprint 01 — تنفيذ المصدر والفحوص والإصلاح المحدود

تاريخ الفحص: 23 نوفمبر 2026. النطاق: Admin Web وClient App وRepresentative App. هذا تسليم هندسي على فرع مستقل، لا موافقة دمج أو إطلاق. لم تُغيّر Production أو إعدادات البنية التحتية أو حماية main، ولم تُدمج طلبات سحب.

## النسخة والتحقق من المصدر

الأساس الفعلي `main@453242e1256f6d876d170142b8ad235be9120344`، وشجرته `6534bc4e7c7475e54e855095f652236f672ed052`. طابقت الشجرة المحلية كاملةً هذه البصمة قبل التعديل، بما فيها 670 ملفًا متتبعًا وصلاحيات الملفات. هذا إثبات مطابقة المصدر، وليس ادعاء امتلاك تاريخ git كاملًا محليًا.

تعذّر clone وnpm ci محليًا بسبب DNS. استُخدم أرشيف مصدر GitHub Actions رقم `14762163424` من run `45043046687`، وأدوات Node/dependencies من `14762491912`. تحققت SHA-256 للحزمتين، وطابقت إصدارات 206 تبعيات مثبتة lockfile. Node المستخدم محليًا 24.22.1؛ استُدعيت scripts مباشرة، ولم يُدّع نجاح npm ci محليًا. النتائج السابقة في ذلك run تاريخية فقط، وليست إعادة تنفيذ هنا. تفاصيل البصمات في `provenance.json` وحزمة أدلة المحادثة.

## تصحيح حالة طلبات السحب

| PR  | الحالة عند الفحص                                       | المراجعة والنتيجة                                                                                                                                                                               |
| --- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #3  | merged في 23 نوفمبر، 06:15:10 UTC                      | وثيقة بوابة الإصدار محفوظة في main؛ ليست تنفيذًا ولا إذن نشر.                                                                                                                                   |
| #4  | merged في 23 نوفمبر، 06:14:33 UTC                      | التنفيذ الفعلي للمندوب/الخدمات/الهوية/native أصبح ضمن الأساس المفحوص. Head: `161e7fdb39c02e43c4761f6385a28b7dff832ecb`.                                                                         |
| #5  | open/draft؛ `a255f2d987a2e0992965ff9147d1ea7b78b2b9d6` | فُحص الفرق الكامل: التقرير قديم، وإصلاح Gateway موجود أصلًا في main. الفرق المعروض يحذف نطاقات strict TypeScript الجديدة وassertion no-store؛ يحتاج تسوية ولا يصلح نقله آليًا. لم يُعدّل الطلب. |
| #7  | open/draft؛ `e90ebdc9f2ed783237714c1d83441793e3c7eb76` | قورنت المراجع وفُحص gate القديم؛ بروتوكول أدلة وأسماء lanes مختلف عن main. مرجع متفرع من #4، وليس تحديثًا خطيًا لـmain. لا اعتماد تلقائي لنتائجه.                                               |
| #8  | open/draft؛ `04aec5b7fea1599c123623dd771a4010c7c69978` | شجرته مطابقة تمامًا لشجرة main الحالية. حالته المفتوحة على base قديم لا تعني أن تنفيذه غائب عن main.                                                                                            |
| #11 | open/draft؛ `da211a625426cd1d016306fb9c39adf76837b6b1` | فُحص فرق 27 ملفًا: server-only web builds، حواجز staging، هوية اصطناعية، حمل واستعادة. لم تُشغّل أوامر provisioning/load/restore، ولم تُعتمد ادعاءات النشر في وصفه كدليل تشغيل حالي.            |

المراجعة شملت مصدر main وجردًا آليًا ومراجعة يدوية مركزة، والفرق الكامل لـ#5 و#11 وملفات gate في #7. ليست مراجعة يدوية لكل سطر native أو تشغيلًا منفصلًا لكل رأس PR.

## المعمارية والتبعيات الفعلية

22 workspace: ثلاثة تطبيقات، 11 حزمة، وثماني خدمات تضم Gateway وسبعة نطاقات أعمال. الواجهات TypeScript/DOM/CSS مع esbuild، وليست React/Next. Client وRepresentative يحتويان Capacitor؛ وجود scaffold العميل لا يثبت امتلاكه جسر الهوية الأصلي الآمن الخاص بالمندوب.

الإصدارات المصرح بها/المقفلة: TypeScript 5.9.3، esbuild 0.28.2، Fastify 5.12.8، pg 8.23.1، amqplib 0.10.9، jose 6.2.17، oauth4webapi 3.8.8، Capacitor core 8.6.2، jsdom 31.0.0. متطلبات الجذر Node >=24.15 <25 وnpm >=11 <12؛ packageManager npm 11.19.0. `dependencies.csv` يسرد manifests الفعلية، ولا يعني التحقق من خلو الحزم من ثغرات منشورة حديثًا.

```text
Admin / Client / Representative
  demo   -> app-runtime + demo-data + local state
  server -> api-client / mobile-auth -> API Gateway
                                      -> identity / crm / sales / delivery
                                      -> billing / tracking / communications
كل خدمة -> قاعدة وrole مملوكة لها + tenant RLS + migrations
الخدمات -> transactional outbox -> RabbitMQ -> transactional inbox -> إسقاطات النطاقات
الهوية -> OIDC/PKCE + تحقق JWT/JWKS؛ native secure storage خاص بمسار المندوب
```

| الخدمة         | عمليات أعمال موثقة | بيانات النطاق المملوكة                                                                                             |
| -------------- | -----------------: | ------------------------------------------------------------------------------------------------------------------ |
| identity       |                  6 | tenant_profiles، memberships، user_profiles                                                                        |
| crm            |                 12 | customers، regions، configuration، discoveries                                                                     |
| sales          |                 35 | visits، quotes، contracts، fulfillments، customer_contexts، tasks، opportunities، visit_routes، discount_approvals |
| delivery       |                  8 | projects                                                                                                           |
| billing        |                  5 | contract_accounts، invoices، payments                                                                              |
| tracking       |                  6 | tracking_sessions                                                                                                  |
| communications |                 12 | notifications، tickets، conversations، conversation_messages، conversation_reads                                   |
| المجموع        |                 84 | Gateway بلا قاعدة أعمال؛ جداول outbox/inbox/idempotency مشتركة الآلية لا الملكية                                   |

## جرد الشاشات والوظائف والصلاحيات

الجرد الجديد مشتق من `docs/production/feature-matrix.json` المعاد توليده والتحقق منه، وليس قائمة أسماء مكتوبة من الذاكرة. `screens.csv`: **102** تسجيل شاشة = 69 demo و33 server. Admin: ‏25 demo و11 server؛ Client: ‏23 و6؛ Representative: ‏21 و16. `actions.csv`: **143** إجراء demo (53/31/59). `api-routes.csv`: **197** تسجيل HTTP، بما فيها HEAD وhealth/ready وwildcards؛ لا تخلط هذا العدد مع **84** عملية أعمال في `api-operations.csv`.

`observations.csv` يتضمن **1,837** ملاحظة مصدرية مع النوع والتصنيف والمسار والأسطر والأدوار وضوابط الملكية والتخزين والأحداث والاختبارات المرشحة والفجوات. تشمل 132 API-call، و99 form، و78 permission، و25 background-job، و30 export، و277 search/filter. الملاحظات تتداخل ولا تمثل 1,837 ميزة منتج مستقلة. `function-symbols.csv` يسرد الدوال/callbacks في شيفرة التطبيقات والحزم والخدمات دون ادعاء مراجعتها يدويًا أو اختبار كل واحدة. `permissions.csv` يشمل مواضع ضوابط الدور والملكية والإذن الأصلي؛ ليست مصفوفة allow/deny منفذة لكل تركيب.

الأدوار الستة: admin، rep، client، finance، delivery، support. `api-operations.csv` يفصل الأدوار المعلنة في العقد عن الضوابط المستخرجة وإسنادها للمصدر. المصادقة من JWT، والتفويض والملكية داخل النطاق، وtenantId داخل المعاملة وRLS؛ مجرد إخفاء زر UI ليس صلاحية خادم.

التصنيف: مكتمل ضمن اختبار ضيق محدد؛ جزئي عندما يوجد تنفيذ ولم يكتمل قبول الرحلة؛ غير مرتبط لمسارات demo المنفصلة عن مساحة server؛ معطل عندما أُعيد إنتاج الخطأ؛ غير موجود عندما لا يوجد التنفيذ في المصدر المفحوص. مزامنة إعدادات الاستبيان الاختيارية استثناء موضح، وليست ذريعة لاعتبار بقية demo مربوطة. لا منصة مصنفة مكتملة للإنتاج. التفاصيل في `FEATURE-GAPS.md` وفي كل صف جرد.

## حدود البيانات والتزامن والتكامل

- `packages/service-kit/src/pg-repository.ts`: معاملات مع tenant context، قفل advisory لكل خدمة/tenant حتى للقراءات، optimistic version و409، وidempotency مرتبطة بالمستخدم ومحتوى الطلب. بعض الأوامر تعيد فحص الملكية حتى عند replay. القفل خطر أداء محتمل غير مقاس، لا عطل أداء مثبت.
- `tx.page` يرشّح scopes قبل الحد، ويستخدم cursor مرتبطًا بالنطاق؛ `tx.list` ما زال محدودًا إلى 1000، فتحتاج الاستعمالات المتبقية مراجعة عند الحجم. فحص imports الناجح لا يثبت وحده عزل قواعد البيانات.
- migrations مملوكة للنطاق؛ جداول JSONB لها version وtenant_id وforced RLS وفهارس تفرد تجارية. الجداول التشغيلية outbox/inbox/idempotency ليست كلها جداول RLS؛ صلاحيات الخدمة وواجهات المستودع جزء من الحماية. لم تُغيّر migration منشورة.
- `packages/events/src/index.ts` و`topology.ts`: نشر مؤكد، outbox leases، inbox ذري، ack بعد المعاملة، retry ثم DLQ، وqueues دائمة مسبقة. التسليم at-least-once، لا exactly-once شامل ولا معاملة موزعة ذرية.
- موافقة العميل على العرض منفصلة عن موافقته الصريحة على العقد. حدث contract.approved ينشئ مشروعًا وفواتير في خدمتين، ثم acknowledgements إلى sales وnotifications؛ fulfillment متسق لاحقًا. اختبار انقطاع/استعادة وحمل فعلي على هذه النسخة لم يُنفّذ محليًا.
- Sales وCommunications يستعلمان CRM للتحقق من الإسناد/تفضيل التواصل. وجود هذا الحد الصريح لا يزيل السباقات التشغيلية أو الحاجة لاختبارات تنافس.
- notifications هنا in-app، والموقع foreground بموافقة؛ تسجيل payment ليس تحريك مال لدى مزود دفع، وترتيب stops ليس تحسين مسار، ولا توجد كتابة offline متزامنة مثبتة.

## الإصلاحات الفعلية

1. `packages/service-kit/src/http.ts`: قبول statusCode غير موثوق فقط إذا كان عددًا صحيحًا في 400..499؛ خلاف ذلك 500 مع إخفاء التفاصيل. قبل الإصلاح أمكن إرجاع 200/301/399 أو التعامل غير الصحيح مع 400.5 لخطأ داخلي. تبقى AppError المعروفة كما هي.
2. `services/api-gateway/src/application/proxy.ts`: HEAD يحافظ على حالة upstream دون اشتراط/تحليل جسم JSON فارغ. GET لا يزال يتحقق من JSON، والمصادقة وعدم التوجيه عند الرفض محفوظان.
3. `tests/backend/http-response-semantics.test.ts`: 19 حالة؛ **7 فشلت قبل الإصلاح، 19/19 نجحت بعده**. لا تغيير مخطط بيانات أو نموذج أعمال أو صلاحيات.
4. أعيد توليد ستة ملفات جرد، وتحديث hashين محددين في semantic-bindings بعد مراجعة ملف HTTP. لم تتغير مبررات annotations أو أسماء الاختبارات القديمة أو debt/quality baselines أو عقد FULL-CI.

## نتائج تنفيذ هذه المهمة

| الفحص                    | baseline main                  | بعد الإصلاح محليًا                                   |
| ------------------------ | ------------------------------ | ---------------------------------------------------- |
| TypeScript / boundaries  | PASS                           | PASS                                                 |
| بناء 3 تطبيقات و8 خدمات  | PASS                           | PASS                                                 |
| Node tests               | 308 passed / 309، تخطي PG واحد | 327 passed / 328، تخطي PG واحد                       |
| اختبارات الإصلاح المركزة | 12 passed / 19، 7 failed       | 19/19                                                |
| merged suites            | 53/53                          | 53/53                                                |
| Design Parity            | 64/64                          | 64/64                                                |
| Regression               | 7/7                            | 7/7 بعد إعادة مستقلة بسبب مهلة الدفعة الأولى         |
| Inventory integrity      | PASS                           | PASS؛ 244 workflow بلا مرشح اختبار، دون زيادة الديون |
| migration --strict       | FAIL                           | الدين لم يُصلح أو يُخفَ؛ 95 ts-nocheck               |

مجموعات الاختبارات تتداخل؛ لا تجمع الأعداد باعتبارها workflows فريدة. 441 بند test-catalog بعد الإصلاح عداد تحليل ساكن، لا 441 اختبارًا منفذًا. انخفاض missing-test observations من 1294 إلى 1257 ناتج عن روابط مرشحة اكتشفها المحلل، وليس إثبات تغطية 37 workflow. بقيت 244 workflow بلا مرشح مرتبط، وظلت بوابة القبول الدلالي/الإنتاجي منفصلة.

السجلات الكاملة ورموز الخروج والبصمات ضمن حزمة أدلة المحادثة. نتيجة CI للـPR الجديد تُقرأ من تشغيله الخاص ولا تُنقل من run قديم أو من شجرة main. تعثّر الاستدعاء المباشر لاختبار TS قبل bundling بسبب parameter properties؛ استُخدم esbuild مثل runner المشروع، وسُجلت المحاولة بدل عدّها عطل منتج.

## إعادة الإنتاج والحدود

من جذر المستودع وبإصدارات engines المطلوبة:

```sh
npm ci
npm run check:types
npm run check:boundaries
npm run build
npm test
npm run test:merged
npm run test:parity
npm run test:regression
npm run inventory:check
npm run check:format
npm run audit:migration:report # report only
npm run audit:migration # strict gate; known debt, not expected green
node docs/audits/sprint-01-20261123/export-symbols.mjs
python3 docs/audits/sprint-01-20261123/export-inventory.py
```

عند تغيير مصدر الجرد: `npm run inventory:write` بعد مراجعة bindings، لا إعادة ضبط baselines. الفحوص المحلية هنا ليست PostgreSQL/RabbitMQ/Keycloak حقيقيًا، ولا Android/iOS native جديدًا، ولا قبول أجهزة/استضافة أو اختراق أو load/restore أو اعتماد مالكين مستقلين. وجود CI سابق ناجح لا يزيل هذه الحدود. حماية main كانت false عند القراءة؛ هذه المهمة لا تدّعي تفعيلها. لا صفر أخطاء أو جاهزية إنتاج أو اكتمال تدقيق يدوي شامل.

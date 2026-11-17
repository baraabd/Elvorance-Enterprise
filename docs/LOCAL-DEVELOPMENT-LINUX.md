# تشغيل أطلس Enterprise على Linux

## نسخة نظيفة

نفذ الأوامر من جذر Enterprise الذي يحتوي lockfile. يحتاج المشروع Node 24.x ابتداء من 24.15 وnpm 11.x؛ وتحتاج الخدمات Docker Engine مع Compose v2. تعمل الواجهات واختبارات المصدر دون Docker، لكن ذلك لا يثبت عمل قواعد الحاويات أو الوسيط.

```bash
node --version
npm --version
npm ci
npm run verify
node infra/compose/init-env.mts
docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml config --quiet
npm run infra:up
docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml ps -a
node infra/compose/smoke.mts
```

يولد helper القيم الناقصة ويحافظ على القيم الموجودة دون طباعتها. لا تحذف lockfile أو تثبت الاعتماديات داخل كل workspace يدويًا. يحتوي Compose سبع خدمات أعمال، وبوابة، ومهاجرًا لكل خدمة، وPostgreSQL 16، وRabbitMQ 4. خروج المهاجرين بالرمز 0 نجاح متوقع.

## واجهات العرض

```bash
npm run dev
```

افتح `http://127.0.0.1:4173`، أو المسارات `/rep-mobile/` و`/client-mobile/` و`/admin-web/`. معاينة الواجهات لا تشغل API. البيانات الحالية محلية في وضع demo؛ القوائم الفارغة عبر API متوقعة ولا تعني ضياع بذرة العرض. لا توجد مزامنة تلقائية بين هذين المخزنين.

بعد تعديل المصدر:

```bash
npm run build:apps
npm run build:services
npm run check:boundaries
npm test
```

يبني خادم المعاينة الواجهات عند بدء التشغيل؛ أعد البناء أو أعد تشغيله لتظهر التغييرات. راجع `MIGRATION-MATRIX.md` قبل توقع استعمال الشاشات للخدمات.

## readiness وعزل القواعد

```bash
for service in identity crm sales delivery billing tracking communications; do
  docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml exec -T "$service" node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/ready').then(r=>{console.log(r.status);process.exit(r.ok?0:1)}).catch(()=>process.exit(1))" || exit 1
done
docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml exec -T postgres sh /opt/atlas/check-isolation.sh
```

يتحقق الفحص الأخير من 7 اتصالات صحيحة و42 رفضًا بسبب صلاحية قاعدة البيانات. فشل الشبكة لا يحتسب نجاحًا. لا تستنتج هذه النتيجة من مرور المدقق الثابت. `/ready` للبوابة يصف البوابة نفسها؛ افحص الخدمات كما أعلاه.

## إعادة تشغيل خدمة وتحديث مخططها

```bash
docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml build sales
docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml run --rm --no-deps sales-migrate
docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml up -d sales
docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml logs --tail 120 sales sales-migrate
```

تعمل تهيئة حسابات PostgreSQL مرة واحدة مع volume جديدة؛ تغيير ملف البيئة لا يدور كلمة مرور موجودة. تراجع migrations داخل الخدمة المالكة، ولا تعدل migration مطبقة لتجاوز اختلاف بنية. لا تشارك ملف البيئة أو dump قاعدة حقيقية في تقارير الأخطاء.

## Android وiOS

ثبت Android Studio وJDK 21 وSDK 36 كما تحدد المصادر المولدة، ثم:

```bash
npm run build:apps
npm run mobile:sync -- rep-mobile android
npm run mobile:sync -- client-mobile android
node tooling/scripts/mobile.mts open rep-mobile android
```

استخدم Gradle wrapper الموجود في كل مشروع بعد مراجعة متطلبات SDK. توليد المشروع ونسخ webDir لا يثبتان نجاح assembleDebug أو تشغيل GPS. يحتاج iOS إلى macOS وXcode. راجع خطوات الهاتف وعنوان API في دليل Windows؛ سياسات HTTPS والأذونات نفسها تنطبق هنا.

## إيقاف البيئة

```bash
npm run infra:down
```

تبقى البيانات داخل volumes. لا يضع الدليل `--volumes` داخل دورة التطوير اليومية. تشغيل الإنتاج وملفات الأسرار موضحان في `OPERATIONS.md`؛ ملف التطوير ليس تهيئة الإنتاج.

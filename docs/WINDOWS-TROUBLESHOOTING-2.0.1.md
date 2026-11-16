# تشخيص أخطاء Windows وتصحيح Atlas CRM Enterprise 2.0.1

هذا التقرير يطابق سجلات التشغيل المرسلة والمرفقات الثلاثة مع مصدر المشروع. المسار الفعلي في جهاز المستخدم هو **`C:\Mobile_Apps\AtlasCRM-Enterprise`**. الأوامر أدناه تستخدم هذا المسار، ولا تفترض وجود المجلد التجريبي `C:\dev\AtlasCRM-Enterprise` أو وجود Java في مجلد يحمل اسمًا محددًا.

**الخلفية نجحت في الفحوص التي أرسلتها، بينما تعطل بناء الواجهات على Windows، وظهر عيب مستقل في فحص المسارات، ولم يبدأ بناء Android بسبب إعداد Java.** بعض الأخطاء اللاحقة نتائج مباشرة لهذه الأعطال، ولذلك لا تحتاج كل رسالة إلى إعادة تثبيت مستقلة.

تصحيح 2.0.1 يعالج أدوات البناء وفحص المسارات والتشغيل والحزم. رقم الحزمة الجذرية يصبح `2.0.1`؛ بقاء أرقام حزم العمل المشتركة عند `2.0.0` ومراجعها المتوافقة أمر مقصود، وليس دليلًا على فشل التحديث. التصميم وصفحات التطبيقات تظل مستندة إلى المصدر نفسه واختبارات توافق التصميم.

## 1. ما الذي نجح فعلًا في السجلات؟

| الدليل المرسل                                                  | ما يثبته                                                               | حدود الدليل                                                                         |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `node --version` = `v24.21.0`، وnpm = `11.19.0`                | الإصداران ضمن نطاق المشروع: Node `>=24.15 <25` وnpm `>=11 <12`         | اختلافهما عن بيئة إعداد الحزمة لا يفسر أخطاء `chmod` أو المسارات                    |
| `npm ci` انتهى بنجاح                                           | تثبيت الاعتماديات من القفل اكتمل                                       | تحذير الثغرة وتحذير install scripts يحتاجان معالجة منفصلة                           |
| TypeScript و`check:boundaries` على المصدر الحالي ينجحان        | المصدر الحالي يجتاز الفحصين في ذلك التشغيل                             | فشل أحد اختبارات أداة فحص الحدود يكشف عيبًا في الأداة، حتى لو اجتازها المصدر الحالي |
| `/health` يعيد `api-gateway alive`                             | عملية البوابة تستجيب                                                   | لا يختبر وحده جميع قواعد البيانات أو رحلة الطلب                                     |
| `smoke.mjs`: تسعة ناجحة وصفر فشل                               | سلامة البوابة، رفض الطلب غير الموثق، والهوية وقراءات النطاقات          | لا ينفذ كتابة بيانات أو GPS حقيقيًا أو تحصيل دفعات                                  |
| `/ready` يعيد 200 للخدمات السبع                                | جاهزية الخدمات وفق الفحوص المنفذة داخلها                               | لا يعادل اختبار كل وظيفة من واجهة الهاتف                                            |
| `check-isolation.sh`: 49 ناجحة                                 | سبعة اتصالات مسموحة بقاعدة الخدمة المالكة و42 اتصالًا متقاطعًا مرفوضًا | هذا فحص اتصال حقيقي لدى المستخدم، وله نطاق مختلف عن اختبارات الواجهة                |
| جميع حاويات `*-migrate` في المرفق الثاني `Exited (0)`          | انتهت عمليات ترحيل قاعدة البيانات بنجاح                                | خروج حاوية الخدمة الدائمة أو خروج المهاجر برمز غير صفر حالة مختلفة                  |
| بناء `sales` وإعادة تشغيله ينجحان                              | صورة الخدمة ومهاجرها اشتغلا في تلك المحاولة                            | أسطر `CACHED` طبيعية عند عدم تغير مدخلات الطبقة                                     |
| اختبار تسجيل الواجهات يعرض 64 مسارًا و122 إجراءً دون أخطاء عرض | الوحدات تُسجل وتعرض في بيئة اختبار DOM                                 | لا يثبت جودة كل شاشة على جهاز حقيقي ولا اكتمال ربطها بالخدمات                       |
| `adb version` يعمل                                             | Android platform-tools موجودة                                          | لا يثبت تثبيت SDK Platform 36 أو أدوات البناء أو صلاحية JDK                         |

السجلات متعاقبة زمنيًا. المرفق الثالث ينتهي بأمر إيقاف وإزالة حاويات وشبكات البيئة؛ لذلك نجاح فحص في وقت سابق لا يثبت أن الخدمات ما زالت تعمل الآن. إزالة الحاويات في `infra:down` دون حذف volumes لا تعني حذف بيانات PostgreSQL وRabbitMQ.

## 2. جميع الأعطال والتحذيرات وأسبابها

### 2.1. `EPERM: operation not permitted, chmod ...\dist\config.js`

الموضع في الإصدار 2.0.0 هو استدعاء `fs.promises.cp` داخل `tooling/scripts/build-apps.mjs` لنسخ `config.example.js` إلى `dist/config.js`. عملية النسخ تضمنت تعديل صلاحيات الملف، ورفض Windows عملية `chmod`. السجل يحدد العملية المرفوضة؛ ولا يثبت أن تشغيل PowerShell كمسؤول أو تعطيل الحماية هو الحل.

هذا **خلل قابلية تشغيل في أداة البناء**. التصحيح يستخدم نسخ محتوى الملفات المولدة دون نقل صلاحيات POSIX إليها، ويعالج نسخ مخرجات التطبيقات والوثائق أيضًا. لا تتطلب معالجة هذا الخلل تغيير تصميم التطبيقات أو حذف قواعد البيانات.

توقفت الحلقة أثناء التطبيق الأول، ولهذا لم يكتمل بناء التطبيقات الثلاثة. تكرار الأمر القديم يعيد الخطأ نفسه؛ لا يصلحه تكرار تثبيت npm.

### 2.2. `npm run verify` و`npm run dev` يتوقفان عند الخطأ نفسه

هذه ليست ثلاثة أعطال مستقلة:

- `verify` يفحص الأنواع والحدود ثم يشغل البناء؛ توقف عند البناء قبل إكمال بقية المراحل.
- `dev` يبني الواجهات قبل بدء خادم المعاينة؛ لذلك لم يصل إلى مرحلة الاستماع على المنفذ 4173.
- `build:apps` هو موضع العطل الأصلي المشترك بين الأمرين.

رسالة `Verification failed` التي صدرت من `throw` في PowerShell تؤكد أن حاجز التوقف عمل. هي رسالة متابعة للفشل، وليست سببًا تقنيًا جديدًا.

### 2.3. ثلاثة اختبارات `ENOENT` لملفات `dist/rep.html` و`client.html` و`admin.html`

الاختبارات تقرأ مخرجات البناء النهائية. البناء السابق توقف قبل إنتاجها، ولذلك لم تجدها. إصلاح ذلك هو إكمال البناء بنجاح ثم إجراء الاختبارات. نسخ ملفات `preview` إلى `dist` لإرضاء الاختبار لا يثبت صحة بناء المصدر الحالي.

نتيجة `npm test` التي أرسلتها كانت **51 اختبارًا: 46 نجاحًا، وأربعة إخفاقات، وواحدًا متجاوزًا بشرط**. ثلاثة من الإخفاقات الأربعة تخص المخرجات المفقودة؛ الرابع عيب فحص مسارات Windows الآتي.

### 2.4. `tsconfig paths cannot hide an app-to-service edge`

هذا فشل حقيقي في أداة فحص الحدود. دالة TypeScript التي تعثر على ملف الإعداد قد تعيد المسار بصيغة `C:/.../tsconfig.json`، بينما كانت الأداة تقارنه حرفيًا بجذر Windows الذي يستخدم `C:\...\`. النتيجة أن ملف إعداد داخل المشروع كان يُهمل، فلا تُحل أسماء `paths` المستعارة كما ينبغي، ولا يظهر الخطأ المعماري المنتظر.

التصحيح يوحد التحقق من احتواء المسار باستخدام علاقة المسارات في `path.relative` بدل مقارنة بادئة نصية. يظل منع استيراد تطبيق من خدمة خلفية قائمًا، ويظل الاختبار الأصلي مطلوبًا؛ لا يُحل هذا العيب بحذف الاختبار أو تخفيف قاعدته.

### 2.5. مزامنة المندوب نجحت، ومزامنة العميل فشلت

بقيت ملفات جزئية أو قديمة في `apps/rep-mobile/dist`، فاستطاع Capacitor نسخها. نجاح `sync` يعني أنه نسخ ما وجده، ولا يثبت أن آخر بناء للتطبيق اكتمل. أما تطبيق العميل فلم يصل البناء أصلًا إلى إنشاء مجلد `dist` الخاص به، فظهرت رسالة `Could not find the web assets directory`.

المسار الصحيح في إعداد Capacitor هو `dist` داخل كل تطبيق. لا تغيّره إلى مجلد التطبيق الآخر. ابنِ التطبيقات أولًا، وتوقف عند أي فشل، ثم زامن كل تطبيق. يتضمن التصحيح حواجز للتحقق من اكتمال مخرجات البناء قبل المزامنة.

### 2.6. `JAVA_HOME is set to an invalid directory`

المسار الذي ضُبط يدويًا، `C:\Program Files\Java\jdk-21`، غير موجود بحسب خطأ Gradle. تعيين متغير البيئة لا يثبت JDK ولا ينشئ ذلك المجلد.

عند تشغيل `java -version` عثر PowerShell على Java 17 الموجود سابقًا في `PATH` بعد أن لم يجد برنامجًا في المجلد المضاف. أما `gradlew.bat` فيقرأ `JAVA_HOME` صراحة ويتوقف إذا كان غير صالح. لذلك لا يوجد تناقض بين ظهور Java 17 وبين رفض Gradle المسار.

ملفات المشروع تحدد Java 21 للترجمة. الحد الأدنى العام لـ AGP 8.13 هو Java 17، لكن ذلك لا يلغي إعداد Java 21 الموجود في هذا المشروع. الحل أدناه يكتشف JDK 21 فعليًا ويفحص وجود `java.exe` و`javac.exe`. راجع [مرجع Android لاختيار JDK](https://developer.android.com/build/jdks).

### 2.7. رسالتا `Representative Android build failed` و`Client Android build failed`

كلتاهما نتيجة فشل `gradlew.bat` السابق قبل بدء الترجمة. فتح Android Studio بنجاح لا يثبت بناء APK. أيضًا، مزامنة ملفات iOS على Windows لا تبني IPA؛ يتطلب البناء الأصلي لـ iOS بيئة macOS وXcode.

النمط الذي ينفذ `Pop-Location` داخل شرط الخطأ ثم مرة أخرى خارجه قد يخرج من مجلد إضافي عند نسخ الأوامر على دفعات. تستخدم أوامر هذا التقرير `try/finally` لإرجاع الموقع مرة واحدة سواء نجح البناء أم فشل.

### 2.8. Docker: `image ... atlas-identity:local: already exists`

في المرفق الأول حاولت خدمة التشغيل ومهاجرها بناء الصورة ذاتها وتصدير الوسم نفسه بالتوازي. يوجد في إعداد 2.0.0 قسم `build` متكرر في كل خدمة وفي `*-migrate` المقابل لها. ظهر التصادم عند تصدير صور الهوية وCRM والتسليم والاتصالات.

التصحيح يجعل صورة المجال تُبنى مرة واحدة ويعيد المهاجر استخدام الصورة ذاتها. وتفصل الأوامر أدناه بين بناء صور الخدمات الثماني وتشغيل الحاويات. لا تحتاج هذه المعالجة إلى حذف صورة PostgreSQL أو تنظيف volumes. توضح [وثائق Docker](https://docs.docker.com/compose/how-tos/dependent-images/) أن Compose v2 يبني الصور بالتوازي.

### 2.9. `fetch failed` في أول اختبار smoke

ظهرت بعد فشل بناء/بدء الحاويات في المرفق الأول، أي إن اتصال الاختبار بالبوابة لم ينجح وقتها. نتائج smoke اللاحقة، تسعة نجاحات، تؤكد أن العائق زال في تلك المحاولات.

إذا عادت الرسالة، افحص حالة الحاويات والمنفذ قبل تعديل المصادقة أو البيانات. `fetch failed` خطأ نقل اتصال، بخلاف استجابة HTTP مثل 401 أو 503. أمر `up --wait` أدناه ينتظر جاهزية الخدمات قبل بدء الفحوص.

### 2.10. Prettier يحذر من أربعة ملفات `preview/*.html`

هذه نسخ HTML مولدة للمراجعة أضيفت إلى الحزمة القابلة للتنزيل. لم تكن `preview` مستثناة من فحص المصدر في 2.0.0. التصحيح يستثني المخرجات المولدة؛ لا يستثني كود المصدر من الفحص. لا تشغل إعادة تنسيق عامة على ملفات CSS المرجعية لمجرد إسكات هذا التحذير.

### 2.11. `Set-Location ... C:\dev\AtlasCRM-Enterprise ... does not exist`

هذا مسار مثال في الدليل السابق، وليس المسار الموجود لديك. استخدم `C:\Mobile_Apps\AtlasCRM-Enterprise`. لا تنشئ مشروعًا فارغًا تحت `C:\dev` ولا تنقل النسخة العاملة لمطابقة المثال.

### 2.12. `1 moderate severity vulnerability`

حدد تدقيق القفل الاعتمادية `fflate@0.8.2` والثغرة [GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98): قد يدخل `unzipSync` في حلقة غير منتهية عند معالجة ZIP64 تالف. الإصدار المصحح هو `0.8.3`.

يستخدم المشروع المكتبة في أدوات إنشاء الحزم والأصول، ومواضع الاستخدام التي روجعت هي `zipSync` و`zlibSync`. لم يُرصد مدخل إنتاجي يستخدم `unzipSync`؛ ومع ذلك جرى تحديث الاعتمادية المحددة والقفل في التصحيح. لا حاجة إلى `npm audit fix --force` أو ترقية بقية الاعتماديات عشوائيًا.

### 2.13. تحذير `esbuild ... install scripts not yet covered by allowScripts`

هذه سياسة npm لسكربتات تثبيت الاعتماديات. الإصدار 2.0.1 يحدد اعتماد سكربت `esbuild@0.28.2` بعينه في `package.json` الجذري، ويثبت التثبيت الاعتماديات من القفل. لا تُمنح موافقة عامة لكل السكربتات. هذا التحذير لا يفسر عملية `chmod` داخل كود بناء أطلس.

للمراجعة، يدعم npm 11.19.0 الأوامر `install-scripts ls` و`install-scripts approve esbuild` و`rebuild esbuild`. يكتب الاعتماد رقم الإصدار المثبت افتراضيًا، وفق [وثائق npm](https://docs.npmjs.com/cli/v11/commands/npm-install-scripts/).

### 2.14. تحذير RabbitMQ الخاص بـ `management_metrics_collection`

هذا تحذير إهمال تدريجي لأسلوب جمع إحصاءات لوحة RabbitMQ، وليس فشلًا في الاتصال أو تخزين الرسائل. السجلات نفسها تعرض اتصالات مصرحًا بها وإنشاء صفوف المتانة بنجاح.

توصي RabbitMQ بإضافة Prometheus للمراقبة. تعطيل المجمع القديم يخفي الرسوم والإحصاءات التفصيلية في واجهة الإدارة، ولذلك ليس تغييرًا شكليًا يضاف لإسكات السجل فقط. انظر القسم المخصص أدناه قبل تغيير إعدادات المراقبة.

### 2.15. اختبار PostgreSQL يظهر `SKIP`

اختبار التكامل المشروط يحتاج قاعدة اختبار وإعدادها المخصص. غياب هذا الإعداد يجعل تجاوزه متوقعًا؛ لا يُحسب فشلًا، ولا يُحسب نجاحًا. فحص العزل الذي شغلته داخل الحاوية ونجح 49 مرة دليل مستقل ومفيد، لكنه ليس الاختبار نفسه. لا توجّه اختبارات إنشاء/حذف قواعد الاختبار إلى قاعدة بيانات تشغيل تحتوي بياناتك.

## 3. تطبيق التصحيح مع الحفاظ على تعديلاتك وبياناتك

نزّل **`AtlasCRM-Enterprise-2.0.1-Hotfix.zip`** إلى مجلد Downloads. الحزمة الكاملة **`AtlasCRM-Enterprise-2.0.1.zip`** مناسبة لنسخة جديدة؛ أما لتحديث نسختك الحالية فاستعمل حزمة التصحيح التالية. أغلق خادم `npm run dev` إن كان يعمل في نافذة أخرى، ثم نفذ:

```powershell
$ErrorActionPreference = 'Stop'
$project = 'C:\Mobile_Apps\AtlasCRM-Enterprise'
if (-not (Test-Path -LiteralPath (Join-Path $project 'package.json'))) {
    throw 'Atlas Enterprise package.json was not found at the specified project path.'
}
Set-Location -LiteralPath $project

$patchZip = Join-Path $env:USERPROFILE 'Downloads\AtlasCRM-Enterprise-2.0.1-Hotfix.zip'
if (-not (Test-Path -LiteralPath $patchZip)) {
    throw 'Download AtlasCRM-Enterprise-2.0.1-Hotfix.zip to Downloads first.'
}
$patchBase = Join-Path ([System.IO.Path]::GetTempPath()) ('AtlasCRM-Hotfix-' + [guid]::NewGuid().ToString('N'))
Expand-Archive -LiteralPath $patchZip -DestinationPath $patchBase
$patchFolder = Join-Path $patchBase 'AtlasCRM-Enterprise-2.0.1-Hotfix'
$patchScript = Join-Path $patchFolder 'apply.mjs'
if (-not (Test-Path -LiteralPath $patchScript)) {
    throw 'The hotfix archive does not contain the expected apply.mjs.'
}
node $patchScript --project $project
if ($LASTEXITCODE -ne 0) { throw 'Hotfix application failed; review the reported conflict before continuing.' }
```

الأداة تتحقق من الملفات المستهدفة، وتحفظ نسخة احتياطية قبل الاستبدال، وتتوقف عند تعارض مع تعديل محلي. احتفظ بمسار النسخة الاحتياطية الذي تطبعه. إذا ظهر تعارض، لا تتجاوز الفحص باستبدال المشروع كاملًا؛ ادمج الملف المختلف مع الاحتفاظ بتعديلاتك ثم أعد التحقق. ملفات البيئة وبيانات PostgreSQL/RabbitMQ ليست جزءًا من هذا الاستبدال.

`$ErrorActionPreference` يجعل أخطاء PowerShell توقف الخطوات؛ أما البرامج الأصلية مثل Node وnpm وDocker فتُراجع نتيجة كل منها صراحة عبر `$LASTEXITCODE`.

## 4. تثبيت الاعتماديات والتحقق من التطبيقات

من جذر المشروع بعد نجاح تطبيق التصحيح:

نظّف مخرجات البناء المتوقفة مرة واحدة. قد تحمل نسخة `config.js` القديمة سمة القراءة فقط؛ يزيل المقطع التالي هذه السمة من ملفات مجلدات البناء المحددة ثم يحذف هذه المخرجات لإعادة إنشائها. أغلق خادم التطوير قبل هذه الخطوة:

```powershell
$generated = @('dist', 'apps\rep-mobile\dist', 'apps\client-mobile\dist', 'apps\admin-web\dist')
foreach ($relative in $generated) {
    $output = Join-Path $project $relative
    if (Test-Path -LiteralPath $output -PathType Container) {
        Get-ChildItem -LiteralPath $output -Recurse -Force -File | ForEach-Object {
            if ($_.IsReadOnly) { $_.IsReadOnly = $false }
        }
        Remove-Item -LiteralPath $output -Recurse -Force
    }
}
```

```powershell
node --version
if ($LASTEXITCODE -ne 0) { throw 'Node is unavailable' }
npm.cmd --version
if ($LASTEXITCODE -ne 0) { throw 'npm is unavailable' }

npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }

npm.cmd run verify
if ($LASTEXITCODE -ne 0) { throw 'Verification failed; stop and inspect the first failing stage.' }

npm.cmd run check:format
if ($LASTEXITCODE -ne 0) { throw 'Source formatting check failed' }

npm.cmd audit
if ($LASTEXITCODE -ne 0) { throw 'Dependency audit reported an issue; inspect the advisory before changing dependencies.' }
```

لا تحتاج إلى تشغيل `npm install` بعد `npm ci`، ولا إلى حذف `package-lock.json`. إذا كنت تحدث اعتماد `fflate` يدويًا في فرع تطوير مستقل بدل التصحيح، فالتحديث المحدد هو `npm.cmd install --save-dev --save-exact fflate@0.8.3`، ثم إعادة الفحوص. التصحيح يتضمن هذا التغيير أصلًا.

لمراجعة سكربتات التثبيت إن بقي تحذير بعد دمج ملفات محلية:

```powershell
npm.cmd install-scripts ls
if ($LASTEXITCODE -ne 0) { throw 'Install-script review failed' }
```

إذا كانت النتيجة تخص `esbuild@0.28.2` نفسه وكان اعتماد السكربت مفقودًا من النسخة المدمجة، استخدم:

```powershell
npm.cmd install-scripts approve esbuild
if ($LASTEXITCODE -ne 0) { throw 'esbuild script approval failed' }
npm.cmd rebuild esbuild
if ($LASTEXITCODE -ne 0) { throw 'esbuild rebuild failed' }
```

لا تستخدم `approve --all`. إذا ظهرت حزمة أخرى، راجع اسمها وإصدارها ووظيفتها قبل منحها الإذن.

بعد اكتمال `verify` يجب أن توجد مخرجات التطبيقات الثلاثة. للتحقق منها بصورة مباشرة:

```powershell
$expectedOutputs = @(
    'apps\rep-mobile\dist\index.html',
    'apps\client-mobile\dist\index.html',
    'apps\admin-web\dist\index.html',
    'dist\rep.html',
    'dist\client.html',
    'dist\admin.html'
)
foreach ($relativePath in $expectedOutputs) {
    $outputFile = Join-Path $project $relativePath
    if (-not (Test-Path -LiteralPath $outputFile)) { throw "Missing build output: $relativePath" }
}
```

وجود الملفات وحده ليس بديلًا لاختبار بدء تشغيل الحزم داخل `verify`. لا تستكمل مزامنة الهاتف إذا فشلت أي مرحلة من البناء.

## 5. تشغيل الخلفية دون تصادم بناء الصور

لا يلزم إيقاف حاويات سليمة أو حذف بياناتها لإصلاح أدوات الواجهات. عند تشغيل الخلفية أو إعادة بناء مصدر الخدمات، نفذ:

```powershell
Set-Location -LiteralPath $project
node .\infra\compose\init-env.mjs
if ($LASTEXITCODE -ne 0) { throw 'Environment preparation failed' }

$composeArgs = @('--env-file', 'infra/compose/.env', '-f', 'infra/compose/compose.yaml')
docker compose @composeArgs config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Invalid Compose configuration' }

docker compose @composeArgs build identity crm sales delivery billing tracking communications api-gateway
if ($LASTEXITCODE -ne 0) { throw 'Service image build failed' }

docker compose @composeArgs up -d --no-build --wait --wait-timeout 180
if ($LASTEXITCODE -ne 0) { throw 'Compose services did not become ready; inspect ps and logs.' }

docker compose @composeArgs ps -a
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect Compose services' }

Invoke-RestMethod 'http://127.0.0.1:3000/health'
node .\infra\compose\smoke.mjs
if ($LASTEXITCODE -ne 0) { throw 'API smoke failed' }
```

أداة البيئة تحفظ القيم الموجودة وتولد المفقود فقط. لا تغيّر كلمات مرور بيئة ذات volumes موجودة لمجرد إعادة التشغيل؛ قاعدة البيانات الحالية لا تتبنى تلقائيًا كلمات مرور جديدة لمجرد تعديل `.env`.

لإعادة فحص الخدمات والعزل:

```powershell
$domains = @('identity', 'crm', 'sales', 'delivery', 'billing', 'tracking', 'communications')
foreach ($domain in $domains) {
    docker compose @composeArgs exec -T $domain node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/ready').then(r=>{console.log(r.status);process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"
    if ($LASTEXITCODE -ne 0) { throw "Service is not ready: $domain" }
}
docker compose @composeArgs exec -T postgres sh /opt/atlas/check-isolation.sh
if ($LASTEXITCODE -ne 0) { throw 'Database isolation failed' }
```

عند فشل البدء أو عودة `fetch failed`، افحص بدل إعادة التهيئة:

```powershell
docker compose @composeArgs ps -a
docker compose @composeArgs logs --tail 100 api-gateway identity identity-migrate sales sales-migrate rabbitmq postgres
Test-NetConnection -ComputerName 127.0.0.1 -Port 3000
```

لا تنشر محتويات `.env` أو رموز الدخول ضمن تقرير الخطأ. لا تستخدم `down --volumes` أو `docker system prune` لهذه المشكلة.

## 6. تشغيل واجهات المندوب والعميل والإدارة

في نافذة PowerShell مستقلة:

```powershell
Set-Location 'C:\Mobile_Apps\AtlasCRM-Enterprise'
npm.cmd run dev
```

أبقِ النافذة مفتوحة، ثم افتح:

| الواجهة        | العنوان المحلي                         |
| -------------- | -------------------------------------- |
| اختيار التطبيق | `http://127.0.0.1:4173/`               |
| المندوب        | `http://127.0.0.1:4173/rep-mobile/`    |
| العميل         | `http://127.0.0.1:4173/client-mobile/` |
| الإدارة        | `http://127.0.0.1:4173/admin-web/`     |

ينفذ `dev` البناء قبل بدء الخادم. إذا خرج إلى موجه PowerShell مع خطأ ولم يطبع عنوان الاستماع، فالخادم لم يبدأ. لا يفتح تشغيل Docker هذا الخادم تلقائيًا.

الواجهات في هذه الحزمة تستخدم مهايئ بيانات العرض المحلية. تشغيل الخدمات بنجاح لا ينقل بيانات العرض تلقائيًا إلى PostgreSQL، ولا يعني اكتمال ربط كل شاشة بواجهات الخدمات. يعرض [MIGRATION-MATRIX.md](MIGRATION-MATRIX.md) حالة الربط؛ وهذه نقطة تشغيلية مستقلة عن تصحيح Windows.

## 7. ضبط JDK 21 بالعثور على تثبيت موجود

نفذ من نافذة الأوامر التي ستستخدمها لبناء Android. يفحص هذا المقطع `JAVA_HOME` الحالي، وJBR المرفق مع Android Studio في المواقع الشائعة، ومجلدات JDK المعروفة. يختار فقط تثبيتًا يعلن Java 21 ويحتوي برنامج الترجمة. إذا ثبتت Java في مكان مخصص، أضف مسار مجلدها الفعلي إلى `$jdkCandidates`.

```powershell
$ErrorActionPreference = 'Stop'
$jdkCandidates = @(
    $env:JAVA_HOME,
    (Join-Path $env:ProgramFiles 'Android\Android Studio\jbr'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Android Studio\jbr')
)
$jdkSearchRoots = @(
    (Join-Path $env:ProgramFiles 'Eclipse Adoptium'),
    (Join-Path $env:ProgramFiles 'Java'),
    (Join-Path $env:ProgramFiles 'Microsoft'),
    (Join-Path $env:USERPROFILE '.jdks')
)
foreach ($jdkRoot in $jdkSearchRoots) {
    if (Test-Path -LiteralPath $jdkRoot -PathType Container) {
        $jdkCandidates += Get-ChildItem -LiteralPath $jdkRoot -Directory | Select-Object -ExpandProperty FullName
    }
}

$selectedJdk = $null
foreach ($candidate in ($jdkCandidates | Where-Object { $_ } | Select-Object -Unique)) {
    $javaExe = Join-Path $candidate 'bin\java.exe'
    $javacExe = Join-Path $candidate 'bin\javac.exe'
    $releaseFile = Join-Path $candidate 'release'
    if ((Test-Path -LiteralPath $javaExe -PathType Leaf) -and
        (Test-Path -LiteralPath $javacExe -PathType Leaf) -and
        (Test-Path -LiteralPath $releaseFile -PathType Leaf)) {
        $releaseText = Get-Content -LiteralPath $releaseFile -Raw
        if ($releaseText -match '(?m)^JAVA_VERSION="21(?:[.+_-]|"|\r?$)') {
            $selectedJdk = (Resolve-Path -LiteralPath $candidate).Path
            break
        }
    }
}
if (-not $selectedJdk) {
    throw 'No JDK 21 found. Install Temurin 21 or add your actual JDK 21 directory to jdkCandidates, then rerun this block.'
}

$env:JAVA_HOME = $selectedJdk
$env:PATH = (Join-Path $selectedJdk 'bin') + ';' + $env:PATH
Write-Host "JAVA_HOME=$env:JAVA_HOME"
& (Join-Path $env:JAVA_HOME 'bin\java.exe') -version
if ($LASTEXITCODE -ne 0) { throw 'Selected Java could not start' }
& (Join-Path $env:JAVA_HOME 'bin\javac.exe') -version
if ($LASTEXITCODE -ne 0) { throw 'Selected Java compiler could not start' }
```

يعدل هذا المقطع بيئة نافذة PowerShell الحالية. لا يستبدل `PATH` النظامية ولا يزيل Java 17 من الجهاز. عند فتح نافذة جديدة أعد الإعداد أو احفظ مسار JDK الصحيح في إعدادات متغيرات المستخدم.

إذا لم يكن JDK 21 مثبتًا، يمكن تثبيته بهذا المعرف المحدد، ثم إعادة مقطع الاكتشاف السابق:

```powershell
winget install --id EclipseAdoptium.Temurin.21.JDK --exact --source winget
if ($LASTEXITCODE -ne 0) { throw 'JDK 21 installation failed' }
```

المعرف منشور في [مستودع Winget الرسمي](https://github.com/microsoft/winget-pkgs/blob/master/manifests/e/EclipseAdoptium/Temurin/21/JDK/21.0.5.11/EclipseAdoptium.Temurin.21.JDK.yaml). لا تحدد رقم التصحيح القديم الظاهر في رابط المثال؛ الأمر يطلب الإصدار المتاح تحت معرف JDK 21.

داخل Android Studio اختر JDK نفسه من **Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK**. لا تغيّر Gradle أو AGP إلى أحدث إصدار تلقائيًا أثناء تشخيص خطأ مسار Java.

## 8. التحقق من Android SDK ومزامنة التطبيقين

التكوين الحالي يطلب SDK Platform 36. وفق [جدول AGP 8.13](https://developer.android.com/build/releases/agp-8-13-0-release-notes?hl=en)، أدوات البناء الافتراضية هي `35.0.0`. افتح Android Studio SDK Manager وثبت Android SDK Platform 36 وAndroid SDK Build-Tools 35.0.0 وAndroid SDK Platform-Tools وAndroid SDK Command-line Tools عند الحاجة. تتطلب [وثائق Capacitor 8](https://capacitorjs.com/docs/updating/8-0) Android Studio 2025.2.1 أو أحدث.

المسار التالي يطابق موضع SDK الذي ظهر مع `adb` في سجلك:

```powershell
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$adbExe = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
if (-not (Test-Path -LiteralPath $adbExe -PathType Leaf)) {
    throw 'Android SDK was not found at the logged location; set ANDROID_HOME to its actual directory.'
}
$env:PATH = (Join-Path $env:ANDROID_HOME 'platform-tools') + ';' + $env:PATH
& $adbExe version
if ($LASTEXITCODE -ne 0) { throw 'adb could not start' }
```

إذا كانت أدوات سطر الأوامر موجودة، يمكن تثبيت الحزم الناقصة بالأوامر الآتية. احتفظ بمراجعة التراخيص تفاعلية:

```powershell
$sdkManager = Join-Path $env:ANDROID_HOME 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path -LiteralPath $sdkManager -PathType Leaf)) {
    throw 'Install Android SDK Command-line Tools (latest) from Android Studio SDK Manager first.'
}
& $sdkManager --install 'platforms;android-36' 'build-tools;35.0.0' 'platform-tools'
if ($LASTEXITCODE -ne 0) { throw 'Android SDK package installation failed' }
& $sdkManager --licenses
if ($LASTEXITCODE -ne 0) { throw 'Android SDK license review did not complete' }
```

بعد تثبيت الحزم، تحقق ثم ابنِ وزامن التطبيقين بالترتيب:

```powershell
if (-not (Test-Path -LiteralPath (Join-Path $env:ANDROID_HOME 'platforms\android-36\android.jar'))) {
    throw 'Android SDK Platform 36 is missing'
}
if (-not (Test-Path -LiteralPath (Join-Path $env:ANDROID_HOME 'build-tools\35.0.0\aapt2.exe'))) {
    throw 'Android SDK Build-Tools 35.0.0 are missing'
}

Set-Location 'C:\Mobile_Apps\AtlasCRM-Enterprise'
npm.cmd run build:apps
if ($LASTEXITCODE -ne 0) { throw 'Web assets build failed; do not sync partial output.' }

npm.cmd run mobile:sync -- rep-mobile android
if ($LASTEXITCODE -ne 0) { throw 'Representative Android sync failed' }

npm.cmd run mobile:sync -- client-mobile android
if ($LASTEXITCODE -ne 0) { throw 'Client Android sync failed' }
```

حدد `android` صراحة على Windows. لا تستنتج من نسخ ملفات iOS أن بناء iOS متاح على هذا النظام.

## 9. بناء APK وإرجاع مجلد العمل بأمان

```powershell
$project = 'C:\Mobile_Apps\AtlasCRM-Enterprise'
foreach ($app in @('rep-mobile', 'client-mobile')) {
    Push-Location (Join-Path $project "apps\$app\android")
    try {
        .\gradlew.bat --version
        if ($LASTEXITCODE -ne 0) { throw "Gradle environment check failed: $app" }

        .\gradlew.bat assembleDebug
        if ($LASTEXITCODE -ne 0) { throw "Android debug build failed: $app" }
    }
    finally {
        Pop-Location
    }
}
```

يجب أن يعرض فحص البيئة Gradle `8.14.3` وJVM المختار. توثق [ملاحظات هذا الإصدار](https://docs.gradle.org/8.14.3/release-notes.html) دعم Java حتى 24؛ لهذا يستهدف الدليل JDK 21 بدل افتراض صلاحية أي JBR حديث.

بعد نجاح `assembleDebug` تكون الملفات المتوقعة:

- `apps\rep-mobile\android\app\build\outputs\apk\debug\app-debug.apk`
- `apps\client-mobile\android\app\build\outputs\apk\debug\app-debug.apk`

هذه حزم تطوير. التحقق من أذونات الموقع ودقة GPS والتحديثات أثناء التشغيل ولوحة المفاتيح والرجوع وتغير الاتصال يحتاج تشغيلًا على محاكي أو هاتف. نجاح الترجمة وحده لا يثبت هذه السلوكيات.

## 10. التعامل مع تحذير RabbitMQ دون إخفاء مشكلة مراقبة

لرؤية الميزات المهملة المستخدمة، نفذ بعد تشغيل Compose:

```powershell
$composeArgs = @('--env-file', 'infra/compose/.env', '-f', 'infra/compose/compose.yaml')
docker compose @composeArgs exec -T rabbitmq rabbitmq-diagnostics list_deprecated_features
docker compose @composeArgs exec -T rabbitmq rabbitmq-diagnostics check_if_any_deprecated_features_are_used
```

الأمر الثاني يرجع رمزًا غير صفر عندما توجد ميزة مهملة قيد الاستخدام، كما توضح [وثائق RabbitMQ](https://www.rabbitmq.com/docs/deprecated-features). هذا ليس اختبار جاهزية خدمة الرسائل.

تذكر [قائمة الإهمال الرسمية](https://www.rabbitmq.com/release-information/deprecated-features-list) أن بديل `management_metrics_collection` هو Prometheus. إذا قررت نقل المراقبة، فإن [مرجع المراقبة](https://www.rabbitmq.com/docs/monitoring) يشرح تفعيل `rabbitmq_prometheus` ومنفذ المقاييس 15692. يجب تثبيت ذلك في إعداد الحاوية الدائم، ثم التحقق من استقبال المقاييس.

بعد توفر البديل، يمكن تعطيل المجمع القديم عبر إعداد RabbitMQ:

```ini
management_agent.disable_metrics_collector = true
```

وفق [مرجع لوحة الإدارة](https://www.rabbitmq.com/docs/4.2/management)، يخفي هذا الإعداد الرسوم والإحصاءات التفصيلية القديمة مع بقاء Prometheus ممكنًا. لا يُطبَّق هذا التغيير تلقائيًا في خطوات إصلاح بناء الواجهات، ولا تُفتح منافذ مراقبة للعامة. وجود التحذير في بيئة التطوير الحالية لا يبطل فحوص الاتصال والجاهزية الناجحة التي أرسلتها.

## 11. نطاق التحقق وموضع المتابعة

هذا التقرير يميز ثلاثة أنواع من الأدلة:

1. **نتائج جهاز المستخدم:** السجلات المرسلة تثبت نجاح Docker والجاهزية والعزل في المحاولات المذكورة، وتثبت أعطال Windows وJava المحددة.
2. **مراجعة وتصحيح المصدر:** أدوات البناء وفحص الحدود والمزامنة والحزم والتشغيل عولجت في مصدر الإصدار المصحح، ونتائج الاختبارات المسجلة تُراجع في [VERIFICATION.md](VERIFICATION.md) وملاحظات الإصدار.
3. **خطوات تُنفذ على جهاز المستخدم:** أوامر PowerShell وبناء APK وفحص الجهاز الفعلي. لا يزعم هذا التقرير أن Windows أو Docker أو Android Studio أو APK اختُبرت محليًا داخل بيئة إعداد التصحيح إذا لم يثبت ذلك سجل مستقل.

لا تجمع أعداد اختبارات الواجهة والـ API والعزل لتعلن اكتمال كل السيناريوهات. ابدأ من أول أمر يفشل في التسلسل، واحتفظ بنص الخطأ الأول والإصدار والمجلد الحالي. وإذا اجتاز `verify` والبناء والمزامنة، تكون قد تجاوزت الأعطال المحددة هنا وأصبحت نسخة التطوير قابلة لمتابعة الاختبار على جهازك.

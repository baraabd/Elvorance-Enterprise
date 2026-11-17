# تشغيل أطلس Enterprise على Windows

هذا الدليل لحزمة **2.0.1** التي تتضمن تصحيح البناء وفحص المسارات على Windows. إذا كانت نسختك 2.0.0 وظهر `EPERM ... chmod` أو فشل اختبار `tsconfig paths`، طبّق التحديث أولًا باتباع [تقرير الأخطاء وحلولها](WINDOWS-TROUBLESHOOTING-2.0.1.md). يحلل التقرير أيضًا تحذيرات npm وأخطاء Docker وJava الواردة في سجل التشغيل.

## 1. التأكد من المتطلبات ومجلد المشروع

تحتاج الواجهات إلى Node 24.x ابتداء من 24.15 وnpm 11.x. الإصدارات التي عرضها سجل جهازك، Node 24.21.0 وnpm 11.19.0، تقع ضمن هذا النطاق. تحتاج الخدمات إلى Docker Desktop بوضع **Linux containers** وCompose v2. لا تحتاج الواجهات وحدها إلى Docker أو Python.

شغّل هذا المقطع في نافذة PowerShell التي ستعمل منها. استخدم المسار الذي ورد في سجلك، ولا تنشئ مجلدًا فارغًا إذا كان المشروع في مكان آخر:

```powershell
$ErrorActionPreference = 'Stop'
$ElvoranceRoot = 'C:\Mobile_Apps\Elvorance-Enterprise'
if (-not (Test-Path -LiteralPath $ElvoranceRoot -PathType Container)) {
    throw "Project folder does not exist: $ElvoranceRoot"
}
Set-Location -LiteralPath $ElvoranceRoot
foreach ($item in @('package.json', 'package-lock.json', 'apps', 'services')) {
    if (-not (Test-Path -LiteralPath (Join-Path $ElvoranceRoot $item))) {
        throw "This is not the Enterprise project root: missing $item"
    }
}
node --version
if ($LASTEXITCODE -ne 0) { throw 'Node.js is unavailable' }
npm.cmd --version
if ($LASTEXITCODE -ne 0) { throw 'npm is unavailable' }
```

استخدام `npm.cmd` يتجنب الاعتماد على تنفيذ `npm.ps1`، ولا يتطلب تغيير سياسة PowerShell. أوامر البرامج الخارجية تحتاج فحص `$LASTEXITCODE`؛ ضبط `$ErrorActionPreference` وحده لا يكفي في جميع إصدارات PowerShell.

## 2. تثبيت الاعتماديات ثم اجتياز بوابة التحقق

```powershell
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed; stop here' }
npm.cmd run verify
if ($LASTEXITCODE -ne 0) { throw 'Verification failed; do not run mobile sync yet' }
```

ينفذ `verify` فحص الأنواع والحدود المعمارية، وبناء التطبيقات والخدمات، والاختبارات، وفحص تطابق التصميم، واختبارات السلوك. **توقف عند أول فشل**؛ وجود بعض ملفات التطبيق لا يثبت اكتمال البناء. لا تحذف lockfile ولا تستخدم `npm audit fix --force` لعلاج خطأ البناء؛ راجع تفسير التحذيرات في التقرير المرتبط أعلاه.

بعد النجاح توجد ملفات الواجهات داخل `apps/<app>/dist` و`dist/<app>`، ونسخ المراجعة المستقلة `dist/rep.html` و`dist/client.html` و`dist/admin.html`، وحزم الخدمات داخل `dist/services/<service>/index.mts`. اختبار PostgreSQL المتكامل مشروط بإعداد قاعدة اختبار مستقلة؛ ظهوره `SKIP` دون هذا الإعداد ليس فشلًا ولا دليلًا على اختبار PostgreSQL.

## 3. تهيئة البيئة وتشغيل الخدمات

الأداة التالية تنشئ `infra/compose/.env` عند غيابه، وتولد بيانات التطوير المطلوبة وتحفظ الإعدادات الموجودة. لا تطبع الأسرار. احتفظ بالملف محليًا.

```powershell
docker version
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop with Linux containers' }
docker compose version
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose v2 is unavailable' }
node .\infra\compose\init-env.mts
if ($LASTEXITCODE -ne 0) { throw 'Environment initialization failed' }
docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Invalid Compose configuration' }
docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml build
if ($LASTEXITCODE -ne 0) { throw 'Container image build failed; do not start services' }
docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml up -d --no-build --wait
if ($LASTEXITCODE -ne 0) { throw 'Services did not become ready; inspect Compose logs' }
docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml ps -a
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect Compose services' }
```

الفصل بين `build` و`up --no-build` يجعل فشل البناء واضحًا قبل بدء التشغيل. تبني الخدمات الثماني صورها، وتستخدم خدمات `*-migrate` السبع صور المجالات نفسها دون إعادة بنائها أو سحبها. يبدأ PostgreSQL وRabbitMQ، ثم ينفذ كل migrator الترحيل وينتهي بالرمز 0؛ هذه نهاية طبيعية. لا تبدأ الخدمة التابعة له إلا بعد نجاحه.

### التحقق من البوابة والخدمات والعزل

```powershell
Invoke-RestMethod 'http://127.0.0.1:3000/health'
node .\infra\compose\smoke.mts
if ($LASTEXITCODE -ne 0) { throw 'API smoke failed' }
$domains = @('identity', 'crm', 'sales', 'delivery', 'billing', 'tracking', 'communications')
foreach ($domain in $domains) {
    docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml exec -T $domain node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/ready').then(r=>{console.log(r.status);process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"
    if ($LASTEXITCODE -ne 0) { throw "Service is not ready: $domain" }
}
docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml exec -T postgres sh /opt/atlas/check-isolation.sh
if ($LASTEXITCODE -ne 0) { throw 'Database connection isolation failed' }
```

النتائج المتوقعة: تسعة فحوص smoke ناجحة، و`200` لجهوزية المجالات السبعة، ثم 49 فحص عزل اتصال ناجحًا: 7 اتصالات مسموحة و42 مرفوضة بين قواعد الخدمات. لا يثبت `/health` وحده جاهزية قواعد البيانات. كذلك لا تثبت هذه القراءات تنفيذ العقود والمدفوعات والأحداث من الواجهة. القوائم الفارغة طبيعية قبل إضافة بيانات إلى الخدمات؛ بذرة العرض المحلي ليست بذرة PostgreSQL.

## 4. تشغيل التطبيقات ومتابعة التطوير

في نافذة PowerShell ثانية، تحقق من وجود المجلد قبل الانتقال إليه:

```powershell
$ElvoranceRoot = 'C:\Mobile_Apps\Elvorance-Enterprise'
if (-not (Test-Path -LiteralPath $ElvoranceRoot -PathType Container)) {
    throw "Project folder does not exist: $ElvoranceRoot"
}
Set-Location -LiteralPath $ElvoranceRoot
npm.cmd run dev
if ($LASTEXITCODE -ne 0) { throw 'Development server failed' }
```

افتح `http://127.0.0.1:4173` لاختيار التطبيق، أو `/rep-mobile/` و`/client-mobile/` و`/admin-web/`. يمكن تشغيل تطبيق بعينه بواسطة `npm.cmd run dev:rep` أو `dev:client` أو `dev:admin`؛ عندها تكون صفحته عند `/`. الخادم يبني الواجهات عند البدء. أوقفه بـ`Ctrl+C` وأعد تشغيله بعد تعديل المصدر، أو أعد بناء الواجهات ثم حدّث الصفحة.

الواجهات تستخدم حاليًا مهايئ العرض المحلي `demo`. تشغيل الحاويات لا يحوّلها تلقائيًا إلى واجهات متصلة بالخدمات. راجع [مصفوفة الانتقال](MIGRATION-MATRIX.md) قبل تغيير المهايئ، ولا تضع مفاتيح التطوير أو tokens داخل `config.js`.

بعد تعديل المصدر، أعد `npm.cmd run verify` وتوقف إذا فشل. بعد تعديل خدمة أو إضافة migration جديدة، أعد بناء صورتها قبل تشغيل المهاجر. مثال خدمة المبيعات:

```powershell
docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml build sales
if ($LASTEXITCODE -ne 0) { throw 'Sales image build failed' }
docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml run --rm --no-deps sales-migrate
if ($LASTEXITCODE -ne 0) { throw 'Sales migration failed' }
docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml up -d --no-build --wait sales
if ($LASTEXITCODE -ne 0) { throw 'Sales did not become ready' }
```

يشترط هذا المثال أن تكون PostgreSQL وRabbitMQ قيد التشغيل. لا تعدّل migration سبق تطبيقها؛ أضف migration جديدة. أمر `sales-migrate` المنفرد لا يبني الصورة بنفسه.

## 5. إعداد Android وJDK 21

مشروعا Android في الحزمة يحددان Java 21 و compile/target SDK 36 و Gradle wrapper 8.14.3. ثبّت Android Studio وSDK Platform 36 و Android SDK Platform-Tools من SDK Manager. لا تكتب مسار JDK تخمينيًا: تعيين `JAVA_HOME` لا يثبت Java، وقد يستمر أمر `java` في تشغيل Java 17 من `PATH` بينما يرفض Gradle المسار غير الموجود.

المقطع التالي يبحث في التثبيتات الشائعة و`JAVA_HOME` الحالي، ولا يختار JDK إلا بعد وجود `release` و`java.exe` و`javac.exe` والتحقق من الإصدار 21. يستخدم `--version` لإظهار الإصدار عبر stdout. إذا لم يعثر عليه، ثبّت JDK 21 أو حدّد مكان تثبيته الفعلي ضمن `$candidates` وأعد المقطع. قد يحتوي Android Studio على JBR مناسب؛ يتم التحقق منه ولا يُفترض وجوده أو إصداره.

```powershell
$candidates = @(
    $env:JAVA_HOME
    (Join-Path $env:ProgramFiles 'Android\Android Studio\jbr')
    (Join-Path $env:LOCALAPPDATA 'Programs\Android Studio\jbr')
)
$installRoots = @(
    (Join-Path $env:ProgramFiles 'Java')
    (Join-Path $env:ProgramFiles 'Eclipse Adoptium')
    (Join-Path $env:ProgramFiles 'Microsoft')
    (Join-Path $env:LOCALAPPDATA 'Programs\Eclipse Adoptium')
)
foreach ($base in $installRoots) {
    if (Test-Path -LiteralPath $base -PathType Container) {
        $candidates += Get-ChildItem -LiteralPath $base -Directory -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty FullName
    }
}
$javaCommand = Get-Command java.exe -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($javaCommand) {
    $candidates += Split-Path -Parent (Split-Path -Parent $javaCommand.Source)
}
$jdk = $null
foreach ($candidate in ($candidates | Where-Object { $_ } | Select-Object -Unique)) {
    $release = Join-Path $candidate 'release'
    $javaExe = Join-Path $candidate 'bin\java.exe'
    $javacExe = Join-Path $candidate 'bin\javac.exe'
    if (-not (Test-Path -LiteralPath $release -PathType Leaf)) { continue }
    if (-not (Test-Path -LiteralPath $javaExe -PathType Leaf)) { continue }
    if (-not (Test-Path -LiteralPath $javacExe -PathType Leaf)) { continue }
    if (-not (Select-String -LiteralPath $release -Pattern '^JAVA_VERSION="21(?:[.\-+][^"]*)?"\s*$' -Quiet)) {
        continue
    }
    $javaVersion = & $javaExe --version
    if ($LASTEXITCODE -ne 0) { continue }
    $javacVersion = & $javacExe --version
    if ($LASTEXITCODE -ne 0) { continue }
    if (($javaVersion -join "`n") -notmatch '(?m)^(?:openjdk|java) 21(?:[.\s+\-]|$)') { continue }
    if (($javacVersion -join "`n") -notmatch '(?m)^javac 21(?:[.\s+\-]|$)') { continue }
    $jdk = (Resolve-Path -LiteralPath $candidate).Path
    break
}
if (-not $jdk) { throw 'A working JDK 21 was not found. Install or locate JDK 21, then retry.' }
$env:JAVA_HOME = $jdk
$env:PATH = "$jdk\bin;$env:PATH"
& "$env:JAVA_HOME\bin\java.exe" --version
if ($LASTEXITCODE -ne 0) { throw 'Selected Java failed' }
& "$env:JAVA_HOME\bin\javac.exe" --version
if ($LASTEXITCODE -ne 0) { throw 'Selected Java compiler failed' }
```

هذا الضبط خاص بنافذة PowerShell الحالية. داخل Android Studio، اختر JDK 21 نفسه في إعدادات **Gradle JDK** للمشروع. إذا كان `org.gradle.java.home` مضبوطًا في إعدادات Gradle، راجعه أيضًا. لا تغيّر مسار Java على النظام كله لمجرد تجربة البناء.

### التأكد من SDK ثم المزامنة والبناء

استعمل مسار SDK الحالي إن كان مضبوطًا، وإلا جرّب موقع Android Studio الافتراضي، مع فحص الملفات قبل المتابعة:

```powershell
$AndroidSdk = $env:ANDROID_HOME
if (-not $AndroidSdk) { $AndroidSdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
foreach ($item in @('platform-tools\adb.exe', 'platforms\android-36\android.jar')) {
    if (-not (Test-Path -LiteralPath (Join-Path $AndroidSdk $item) -PathType Leaf)) {
        throw "Missing Android SDK component: $item. Check SDK Manager and the SDK location."
    }
}
$env:ANDROID_HOME = (Resolve-Path -LiteralPath $AndroidSdk).Path
$env:PATH = "$env:ANDROID_HOME\platform-tools;$env:PATH"
& "$env:ANDROID_HOME\platform-tools\adb.exe" version
if ($LASTEXITCODE -ne 0) { throw 'Android platform-tools failed' }

# Run from the project root. Do not sync after a failed build or verification.
npm.cmd run verify
if ($LASTEXITCODE -ne 0) { throw 'Verification failed; mobile sync was not started' }
npm.cmd run mobile:sync -- rep-mobile android
if ($LASTEXITCODE -ne 0) { throw 'Representative Android sync failed' }
npm.cmd run mobile:sync -- client-mobile android
if ($LASTEXITCODE -ne 0) { throw 'Client Android sync failed' }

foreach ($app in @('rep-mobile', 'client-mobile')) {
    Push-Location (Join-Path $ElvoranceRoot "apps\$app\android")
    try {
        .\gradlew.bat --version
        if ($LASTEXITCODE -ne 0) { throw "Gradle could not start for $app" }
        .\gradlew.bat assembleDebug
        if ($LASTEXITCODE -ne 0) { throw "Android build failed for $app" }
    }
    finally {
        Pop-Location
    }
}
```

راجع مخرجات `gradlew --version`: ينبغي أن يستخدم Launcher JVM الإصدار 21. `try/finally` يعيدك إلى المجلد الأصلي مرة واحدة حتى عند الفشل. إذا لم يصل السكربت إلى نهاية حلقة البناء بنجاح، لا تعتبر التطبيقين مبنيين.

ملفا debug الناتجان هما `apps/rep-mobile/android/app/build/outputs/apk/debug/app-debug.apk` و`apps/client-mobile/android/app/build/outputs/apk/debug/app-debug.apk`. يمكنك فتح مشروع التطبيق من Android Studio، أو استخدام `node .\tooling\scripts\mobile.mts open rep-mobile android` من جذر المشروع. فتح IDE ونجاح Capacitor sync لا يثبتان نجاح Gradle أو تشغيل APK. اختبر التطبيق على AVD أو هاتف فعلي، بما يشمل الأذونات والتنقل ولوحة المفاتيح. iOS يحتاج macOS وXcode.

عند ربط API بالهاتف لاحقًا، `localhost` يعني الهاتف نفسه. استخدم بوابة HTTPS تصل إليها الأجهزة وشهادة موثوقة، مع عنوان `apiBaseUrl` وأصل CORS الصحيحين وتسجيل دخول فعلي. هذه خطوة تكامل منفصلة عن بناء العرض المحلي.

## 6. التشخيص والإيقاف

راجع [تقرير تصحيح Windows 2.0.1](WINDOWS-TROUBLESHOOTING-2.0.1.md) للتفسير الكامل للأخطاء المسجلة. لفحص خدمة متعثرة ثم إيقاف البيئة مع الاحتفاظ بالبيانات:

```powershell
docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml logs --tail 120 sales sales-migrate rabbitmq
if ($LASTEXITCODE -ne 0) { throw 'Could not read service logs' }
docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml down
if ($LASTEXITCODE -ne 0) { throw 'Could not stop Compose services' }
```

لا تحتاج معالجة أخطاء البناء إلى حذف قواعد البيانات أو وحدات التخزين. تغيير كلمة مرور في `.env` لا يغيّر تلقائيًا كلمة المرور داخل volume موجودة؛ استخدم إجراء تدوير مناسب عند الحاجة. راجع [التشغيل والصيانة](OPERATIONS.md).

**حدود التحقق:** أضيفت وظيفة CI على Windows لتغطية البناء واختبارات المسارات. هذا الدليل لا يدّعي أن أوامره نُفذت في PowerShell أو أن APK بُني وشُغّل على جهاز ضمن بيئة إعداد التصحيح. نتائج تشغيل جهازك واختبارات CI الفعلية هي ما يؤكد ذلك.

# إصدار تطبيق المندوب واختباره على الأجهزة

مسار الإصدار يبدأ من بيئة `staging` مستقلة، ويستخدم واجهة الخادم في `src/server-main.ts`. يُرفض بناء الإصدار إذا دخلت ملفات Demo في حزمة الواجهة، أو اختلفت إعدادات البيئة، أو تغيّرت مدخلات البناء أو مخرجاته بعد تسجيل بصمتها. لا يُسمح بتوقيع مصدر Native غير محفوظ في Git أو بإعادة استعمال حزمة واجهة من مراجعة مختلفة.

## الفصل بين البيئتين

| الإعداد                                | Staging                                     | Production                          |
| -------------------------------------- | ------------------------------------------- | ----------------------------------- |
| Android application ID / iOS bundle ID | `com.elvorance.rep.staging`                 | `com.elvorance.rep`                 |
| OAuth redirect URI                     | `com.elvorance.rep.staging:/oauth2redirect` | `com.elvorance.rep:/oauth2redirect` |
| Keycloak realm                         | `elvorance-staging`                         | `elvorance-production`              |
| Public OAuth client                    | `elvorance-rep-staging`                     | `elvorance-rep-production`          |
| Android build flavor                   | `staging`                                   | `production`                        |
| الاسم الظاهر                           | إلفورانس تجريبي                             | إلفورانس الميداني                   |

يعتمد مخزن الرموز على هوية التطبيق؛ لذلك لا تشترك النسختان في الرموز. تستخدم Android مفاتيح AES-GCM من Android Keystore وتكتب النص المشفّر داخل `noBackupFilesDir`. تستخدم iOS عناصر Keychain غير متزامنة، متاحة أثناء فتح الجهاز فقط، ومقيّدة بالجهاز الحالي. لا توجد استعادة إلى تخزين الرموز في المتصفح عند تعذّر المخزن الأصلي.

يعمل تسجيل الدخول عبر Custom Tabs في Android و`ASWebAuthenticationSession` في iOS. يتحقق الجسر الأصلي من عنوان التفويض HTTPS المضمّن في الحزمة، ومطابقة مسار العودة وهوية التطبيق، واستخدام Authorization Code مع PKCE S256. تتولى حزمة `mobile-auth` التحقق من المعاملة و`state` و`nonce` والرموز. origins الخاصة بالـWebView هي `https://localhost` و`capacitor://localhost`، ويجب السماح بهما صراحةً في إعدادات العميل دون wildcard.

## أدوات البناء

يستخدم مسار CI المثبّت Node `24.22.1` وJDK `21`. يستهدف مشروع Android API `36` ويدعم API `24` فأحدث. يدعم مشروع iOS الإصدار `15` فأحدث، ويستخدم CI نظام macOS مع Xcode `26` أو أحدث. يجب توفر Android SDK عند البناء المحلي وmacOS/Xcode عند بناء iOS.

هناك مساران منفصلان:

- **Rep native verification**: يجهز صفحة اختبار محلية بلا خادم ولا تسجيل دخول ولا بيانات أعمال، ويجري Android lint واختبارات JVM وKeystore على محاكي، واختبارات XCTest على محاكي iPhone. تحمل مخرجاته تسمية `verification-only`، ولا تمثل إصدار التطبيق أو نجاح الاختبارات على أجهزة فعلية.
- **Rep signed native release**: يبني واجهة الخادم الحقيقية، ويطابق مصادرها ومخرجاتها مع سجل البناء، ثم ينتج AAB موقّعًا وIPA موقّعًا بحسب بيانات التوقيع الخاصة بالبيئة. يتحقق من التوقيع وهوية الحزمة، ويحفظ بصمات الملفات مع المصدر الذي بُنيت منه. لا يرفع التطبيق تلقائيًا إلى المتاجر.

## إعدادات GitHub Environments

يجب تجهيز بيئتي GitHub المسميتين `staging` و`production` بمتغيرات وخدمات منفصلة، مع حصر الوصول إلى مواد توقيع الإنتاج. لا تُستخدم عناوين تجريبية مصطنعة لاجتياز فحص الإصدار؛ يجب أن تستجيب بوابة البيئة وOIDC discovery فعليًا.

| Variable                          | الغرض                                                               |
| --------------------------------- | ------------------------------------------------------------------- |
| `REP_API_BASE_URL`                | أصل HTTPS الفعلي لبوابة البيئة، دون مسار إضافي                      |
| `REP_OIDC_ISSUER`                 | عنوان HTTPS ينتهي بالـrealm الخاص بالبيئة                           |
| `REP_OIDC_CLIENT_ID`              | العميل العام المحدد في الجدول السابق                                |
| `REP_PRODUCTION_API_BASE_URL`     | أصل الإنتاج لمقارنته ومنع استخدامه بالخطأ في Staging                |
| `APPLE_TEAM_ID`                   | معرّف فريق Apple المطابق لملف provisioning                          |
| `REP_STAGING_ACCEPTED_SOURCE_SHA` | في الإنتاج فقط: SHA المصدر الذي اجتاز قبول Staging الكامل           |
| `REP_STAGING_ACCEPTANCE_RUN_ID`   | في الإنتاج فقط: رقم تشغيل GitHub الذي يحتوي artifact القبول المراجع |

| Secret                              | الغرض                                                     |
| ----------------------------------- | --------------------------------------------------------- |
| `ANDROID_UPLOAD_KEYSTORE_BASE64`    | ملف upload keystore الخاص بالبيئة، بصيغة Base64           |
| `ANDROID_KEYSTORE_PASSWORD`         | كلمة مرور keystore                                        |
| `ANDROID_KEY_ALIAS`                 | alias لمفتاح الرفع                                        |
| `ANDROID_KEY_PASSWORD`              | كلمة مرور المفتاح                                         |
| `APPLE_DISTRIBUTION_P12_BASE64`     | شهادة Apple Distribution ومفتاحها الخاص المصدّران إلى P12 |
| `APPLE_P12_PASSWORD`                | كلمة مرور ملف P12                                         |
| `APPLE_PROVISIONING_PROFILE_BASE64` | ملف توزيع صالح لهوية التطبيق الخاصة بالبيئة               |

تُحفظ مواد التوقيع في مخزن secrets الخاص بالبيئة. Base64 صيغة نقل وليست تشفيرًا. ينشئ بناء iOS keychain مؤقتًا، ويستعيد قائمة keychains السابقة وملف provisioning السابق إن وجد، ويحذف المواد المؤقتة عند الانتهاء. لا تُدرج كلمات المرور أو المفاتيح الخاصة في الحزمة أو تقارير البناء.

تشغَّل Workflow الإصدار يدويًا مع اختيار البيئة، وإصدار تسويقي مثل `2.4.1`، ورقم بناء جديد موجب. اختيار iOS `app-store-connect` ينتج حزمة للتوزيع عبر TestFlight/App Store Connect؛ اختيار `release-testing` يتطلب provisioning profile يحتوي الأجهزة المسجلة المراد اختبارها. يتحقق البرنامج من نوع ملف provisioning وصلاحيته ومعرّف الفريق وهوية التطبيق قبل الأرشفة.

## تشغيل البناء محليًا

اضبط متغيرات البيئة الفعلية السابقة و`APP_ENV` و`ELVORANCE_VERSION_NAME` و`ELVORANCE_VERSION_CODE` داخل بيئة العمل الآمنة، ثم:

```sh
npm ci
npm run verify
npm run build:rep:server
npm run mobile:prepare:rep -- android
node tooling/scripts/rep-native/android-release.mts
```

يتطلب Android محليًا `ANDROID_KEYSTORE_PATH` بالإضافة إلى كلمات المرور والـalias. لا يولّد المسار مفتاح رفع بديلًا تلقائيًا؛ يجب المحافظة على سلسلة التوقيع المعتمدة للتطبيق.

على macOS، بعد البناء نفسه وإعداد متغيرات Apple و`IOS_EXPORT_METHOD`:

```sh
npm run mobile:prepare:rep -- ios
node tooling/scripts/rep-native/ios-release.mts
```

إعدادات التطبيق الأصلية تُولّد لكل عملية `sync`، ثم يعاد ملف إعداد Capacitor المتتبّع إلى وضعه الأصلي. تبقى هوية البيئة والعنوان الموثوق داخل ملفات المشروع الأصلية المولّدة. يتحقق Android أيضًا من تطابق هوية Capacitor المضمّنة مع flavor المختار. يجب استخدام هذه الأوامر لبناء إصدارات المندوب؛ مسار `mobile:sync` العام خاص بالتطبيقات والمعاينات العامة ولا يثبت صلاحية إصدار الخادم.

## اختبارات الأجهزة الفعلية

يلزم جهاز Android متصل ومصرّح بالتصحيح، وiPhone متصل ومقترن بـXcode مع Developer Mode وصلاحيات توقيع تطوير. تُشغَّل اختبارات Native الآتية فقط مع `APP_ENV=staging` وحزمة واجهة حقيقية جاهزة:

```sh
node tooling/scripts/rep-native/device-tests.mts android
node tooling/scripts/rep-native/device-tests.mts ios
```

يتطلب الأول تحديد `ANDROID_SERIAL`، ويتطلب الثاني `IOS_DEVICE_ID` و`APPLE_TEAM_ID`. يرفض البرنامج محاكي Android، ويستهدف `platform=iOS` ومعرّف جهاز فعلي في iOS. يسجل بصمة معرّف الجهاز بدل نشر معرّفه الخام في تقرير JSON. تقارير instrumentation وXCTest تثبت نتائج الاختبارات التي شُغّلت بالفعل؛ لا يُنشئ البرنامج تقرير نجاح عند عدم وجود جهاز أو عند فشل الاختبارات.

تغطي هذه الاختبارات التخزين الأصلي، وفصل سجلات الرموز، ورفض التلاعب في Android، ورفض callbacks غير المسموحة، وتسجيل الجسر الأصلي عند تشغيل التطبيق. تُشغَّل ضمن بناء تطوير، لذلك **لا تكفي لقبول ملف المتجر الموقّع**. يجب أيضًا تجربة وظائف الأعمال على نسخة Staging الموقعة ذات البصمة المدرجة في تقرير القبول:

- يوزَّع AAB عبر مسار اختبار Google Play أو باستخدام bundletool الرسمي لتحويله إلى APKs قابلة للتثبيت؛ لا يُثبَّت AAB مباشرةً على الجهاز.
- تُختبر IPA الخاصة بـApp Store Connect عبر TestFlight، أو تستخدم IPA من نوع `release-testing` على الأجهزة المدرجة في provisioning profile.
- يشمل القبول تسجيل الدخول وإعادة فتح التطبيق وتدوير الرموز والخروج وعزل الحسابات؛ العملاء والاكتشاف والزيارات وإثبات الوصول؛ الفرص والمهام والخطط؛ الأسعار والخصومات وموافقات الإدارة ورد العميل والعقود والفوترة؛ الرسائل والإشعارات والدعم؛ رفض صلاحية الموقع وإيقافه عند الخلفية؛ انقطاع الشبكة وإعادة المحاولة؛ والعربية وإمكانية الوصول. القائمة الملزمة محفوظة في `tooling/scripts/rep-release/acceptance.mts`.

## بوابة الانتقال إلى الإنتاج

يرفض Workflow الإنتاج العمل ما لم يطابق `REP_STAGING_ACCEPTED_SOURCE_SHA` المصدر الجاري، ويُنزّل artifact باسم `rep-staging-acceptance` من التشغيل المحدد. يجب أن يحتوي `acceptance.json` وملفات الأدلة المشار إليها. يتحقق `check-acceptance.mts` من نتائج الخدمات والمصادقة والعزل، وصور الخدمات ذات البصمات الثابتة، وأجهزة Android وiPhone الفعلية، وسيناريوهات الأعمال، وبصمات الأدلة ومراجعة QA. لا يُولّد مسار Native موافقة QA ولا يسمح لنتيجة محاكي أن تحل محلها.

يُحفظ ناتج AAB وIPA وبصماتهما في artifacts الخاصة بـGitHub، وتُحفظ رموز iOS في `dSYMs` للمساعدة في تحليل الأعطال. رفع المتجر وبيانات الخصوصية ولقطات الأجهزة والمراجعة النهائية تحتاج حسابات التوزيع وإعدادات التطبيق الحقيقية؛ نجاح الأرشفة وحده لا يثبت قبول المتجر أو سلامة الاستخدام الميداني.

## المراجع الأساسية

- [بيئة Capacitor المدعومة](https://capacitorjs.com/docs/getting-started/environment-setup)
- [توقيع Android](https://developer.android.com/studio/publish/app-signing)
- [أداة bundletool الرسمية](https://developer.android.com/tools/bundletool)
- [توزيع iOS للاختبار والإصدار](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases/)
- [توقيع Xcode في GitHub Actions](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications)
- [موقع provisioning profiles منذ Xcode 16](https://developer.apple.com/documentation/xcode-release-notes/xcode-16-release-notes)

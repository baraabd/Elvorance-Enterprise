# إعادة التنفيذ والأدلة

## فحوص المشروع القائمة

```sh
npm ci
npm run check:types
npm run check:boundaries
npm run build
npm test
npm run test:parity
npm run test:regression
npm run inventory:check
npm run check:format
```

يجب ضبط `ELVORANCE_TEST_POSTGRES_URL` لاختبار PostgreSQL؛ عدم ضبطه يؤدي إلى skip معلن ولا يعد قبولًا لقاعدة البيانات. تبقى FULL-CI الأصلية مسؤولة عن lanes الهوية والخدمات وقواعد البيانات وAndroid/iOS. نجاحها على main سابقًا ليس نجاحًا على PR الجديد.

## أدوات UX المعزولة

```sh
python3 -m venv .venv-ux
. .venv-ux/bin/activate
pip install -r tests/ux/requirements.txt
python -m playwright install --with-deps chromium
(cd tests/ux/tooling && npm ci --ignore-scripts)
export PYTHONDONTWRITEBYTECODE=1
CHROMIUM=$(python -c "from playwright.sync_api import sync_playwright; p=sync_playwright().start(); print(p.chromium.executable_path); p.stop()")
AXE=tests/ux/tooling/node_modules/axe-core/axe.min.js
node tests/ux/build-server-fixture.mts . dist/ux-server
python tests/ux/browser_audit.py --chromium "$CHROMIUM" --output dist/ux-evidence/after/screens --axe "$AXE" --screenshots --strict
python tests/ux/server_audit.py --chromium "$CHROMIUM" --build dist/ux-server --output dist/ux-evidence/after/server-screens --axe "$AXE" --states --screenshots --strict
python tests/ux/interactions.py --chromium "$CHROMIUM" --server-build dist/ux-server --output dist/ux-evidence/after/interactions
python -m unittest discover -s tests/ux -p 'test_*.py' -v
```

استخدم interpreter والمسار الخاصين بنظامك؛ `/usr/bin/chromium` هو default محلي فقط. `enterprise-ux.yml` يجهّز Chromium الخاص بإصدار Playwright المثبت، ويبني base وhead في نفس runner، ويضبط المسار تلقائيًا. يجب تثبيت تبعيات base في worktree الخاصة به؛ symlinks إلى حزم candidate قد تلوث نتيجة before.

## مقارنة الأصل والتعديل

```sh
BASE=453242e1256f6d876d170142b8ad235be9120344
git worktree add --detach ../elvorance-ux-before "$BASE"
(cd ../elvorance-ux-before && npm ci && npm run build:apps)
node tests/ux/build-server-fixture.mts ../elvorance-ux-before dist/ux-before-server --before
python tests/ux/browser_audit.py --chromium "$CHROMIUM" --dist ../elvorance-ux-before/dist --output dist/ux-evidence/baseline/screens --axe "$AXE" --screenshots
python tests/ux/server_audit.py --chromium "$CHROMIUM" --build dist/ux-before-server --output dist/ux-evidence/baseline/server-screens --axe "$AXE" --states --screenshots
python tests/ux/browser_audit.py --chromium "$CHROMIUM" --output dist/ux-evidence/after/repeat --widths 390,768,1440 --screenshots
python tests/ux/visual_compare.py --before dist/ux-evidence/baseline/screens --after dist/ux-evidence/after/screens --repeat dist/ux-evidence/after/repeat --output dist/ux-evidence/visual/demo --diffs
python tests/ux/visual_compare.py --before dist/ux-evidence/baseline/server-screens --after dist/ux-evidence/after/server-screens --output dist/ux-evidence/visual/server --diffs
node tests/ux/component_inventory.mts ../elvorance-ux-before dist/component-inventory.json
```

لا تقارن PNG من نظامين أو نسختي متصفح مختلفتين على أنها golden متطابقة. اختبارات الأبعاد وaxe fail-closed؛ لا يعتبر غياب axe نجاحًا في strict mode. مقارنة before/after تنتج evidence للتغييرات المقصودة وغير المقصودة، ولا تعتمد baseline جديدة تلقائيًا. بوابة التكرار لا تسمح إلا بفروق raster مسجلة ≤16 بكسلًا، كل قناة RGB بفارق ≤1، وأبعاد مطابقة.

## بيئة التنفيذ المحلي وحدودها

تعذر الوصول المباشر إلى GitHub/npm من الحاوية. جُلبت نسخة المصدر والتبعيات عبر artifacts أصلية مرتبطة بـSHA main، وaxe عبر job معزولة محددة الإصدار. لم يُدّع نجاح `npm ci` محليًا. قيود المتصفح منعت فتح URL محلي؛ استُخدم `page.set_content` على HTML المحمول المبني فعليًا، دون تعديل سياسات المتصفح. هذا تنفيذ فعلي للواجهة، لكنه لا يختبر origin/CSP أو cookie/redirect/auth shell في نشر حقيقي.

الـserver harness يستورد workspace renderers وAPI adapter الحقيقية ويستبدل transport فقط ببيانات اصطناعية محددة. ترفض fixtures الطلبات غير المخططة؛ يُسمح في اختبار التفاعل فقط بإنشاء عميل اصطناعي في الذاكرة، لا بطلبات إلى حساب أو Backend حقيقي. الوقت والتخزين والبيانات تثبّت داخل harness للاختبار؛ لا تُحقن هذه التهيئة في production bundles.

يُرفع artifact منفصل `enterprise-ux-<SHA>-<attempt>` بمدة حفظ 30 يومًا. هذا ليس أرشيفًا دائمًا. لم تُدرج ملفات خطوط في حزمة التسليم. لا تُستخدم صور مولدة أو تقييمات تخيلية.

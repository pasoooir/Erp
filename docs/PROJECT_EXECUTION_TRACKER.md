# دفتر اجرای پروژه ERP — وضعیت مبتنی بر شواهد

آخرین بازبینی: 2026-10-29 (استقرار API و D1 اختصاصی)  
مخزن: [pasoooir/Erp](https://github.com/pasoooir/Erp)  
شاخه مرجع: `main`  
آخرین commit پایه بررسی‌شده در main: `a2163f5fc61f67f520ee7b556e7ce458d3dbd933`

## خلاصه اجرایی

- رابط کاربری GitHub Pages در `https://pasoooir.github.io/Erp/` است. کد پایه احراز هویت، نشست، ساختار سازمانی، مدیریت کاربر، نقش/scope و ممیزی در مخزن موجود است؛ این به معنی تکمیل کل ERP نیست.
- در Cloudflare یک D1 اختصاصی با نام `erp-production-eu` و شناسه `d33370d3-5bb9-4439-be1e-39467b903482` در حوزه EU ایجاد شد. دیتابیس connectivity آزمایشی قبلی دست‌نخورده است.
- سه migration پایه `0001_erp_foundation.sql`، `0002_scoped_rbac.sql` و `0003_auth_username.sql` با موفقیت روی D1 جدید اجرا و در `d1_migrations` ثبت شدند؛ فهرست جدول‌ها و سوابق migration با query فقط‌خواندنی بررسی شد.
- Worker با نام `erp-api` در `https://erp-api.pasoooir-erp.workers.dev` بارگذاری شد؛ Cloudflare پاسخ موفق برای upload، secret binding و فعال‌سازی workers.dev برگرداند. binding پایگاه داده به D1 جدید و CORS محدود به Origin رابط GitHub Pages تنظیم شد.
- رابط ماژول ERP در شاخه کاری به API مستقل متصل شده و از `credentials: include` استفاده می‌کند. Cookie نشست برای ارتباط cross-site با `HttpOnly; Secure; SameSite=None` تنظیم شده است.
- Secret راه‌اندازی اولیه به‌صورت Cloudflare Worker Secret با نام `BOOTSTRAP_SECRET` تنظیم شده؛ مقدار آن در مخزن یا مستندات ذخیره نشده است. مدیر اولیه هنوز ساخته نشده و باید مالک سامانه آن را یک‌بار از فرم bootstrap ایجاد کند.
- وضعیت تأیید: [live API smoke run 40827200728](https://github.com/pasoooir/Erp/actions/runs/40827200728) برای health/D1، وضعیت bootstrap، رد Origin غیرمجاز و CORS معتبر سبز است؛ [foundation run 40827200720](https://github.com/pasoooir/Erp/actions/runs/40827200720) نیز تست واحد، migration محلی و smoke مرورگری bootstrap/login را گذرانده است. bootstrap مدیر در D1 واقعی عمداً اجرا نشده و به مالک سامانه واگذار شده است.
- کل ERP، شامل ماژول‌های منابع انسانی، حقوق و دستمزد، موجودی، خرید، فروش، حسابداری، تولید، کیفیت، دارایی ثابت و گزارش‌های کامل، همچنان کار باقیمانده دارد؛ درصد کل پروژه از روی صرف استقرار این برش افزایش داده نشده است.

## استقرار D1 و API — 2026-10-29

| شناسه | معیار پذیرش | شواهد | وضعیت | اقدام بعدی |
|---|---|---|---|---|
| ERP-D1-PROD-001 | ساخت D1 اختصاصی EU بدون تغییر دیتابیس آزمایشی | Cloudflare D1 `erp-production-eu`, UUID `d33370d3-5bb9-4439-be1e-39467b903482` | completed | نگه‌داری از snapshot/backup طبق سیاست عملیاتی |
| ERP-D1-MIG-001 | اجرای schema پایه و جلوگیری از اجرای تکراری migrationها | query موفق برای migrationهای 0001–0003؛ `d1_migrations` شامل سه نام migration؛ جدول‌های users, sessions, org_units, roles, user_roles, user_org_scopes, permissions, role_permissions, audit_events و login_attempts موجودند | completed | CI و migrationهای آتی را با همان D1 ID همگام نگه‌دار |
| ERP-API-DEPLOY-001 | Worker با D1 binding، secret bootstrap و workers.dev فعال | Cloudflare API: upload HTTP 200؛ ثبت secret HTTP 201؛ فعال‌سازی subdomain HTTP 200؛ Worker ID `erp-api`, deployment `7d9a0ba9e648423ebf38eddf59d80e71`; live smoke [40827200728](https://github.com/pasoooir/Erp/actions/runs/40827200728) سبز | completed | حفظ health/CORS smoke test در CI |
| ERP-PAGES-API-001 | رابط Pages از API مستقل استفاده کند و نشست cross-origin ارسال شود | `public/modules/erp-shell/erp-shell.js`: API base، `credentials: include` و fallback به localhost در CI؛ [foundation browser smoke 40827200720](https://github.com/pasoooir/Erp/actions/runs/40827200720) و [live Pages/API smoke 40827403192](https://github.com/pasoooir/Erp/actions/runs/40827403192) سبز | completed | پس از Pages deploy، بررسی دستی مرورگر و محدودیت third-party cookies |
| ERP-BOOTSTRAP-001 | ساخت یک‌باره مدیر بدون رمز پیش‌فرض و بدون secret در کد | `BOOTSTRAP_SECRET` در Worker Secret؛ endpoint bootstrap موجود | blocked | مالک سامانه باید کلید راه‌اندازی را در فرم خصوصی وارد و مدیر اولیه را ایجاد کند؛ secret را در repo یا چت عمومی ذخیره نکن |

## ردیابی اجرا

| شناسه | معیار پذیرش | فایل‌ها و شواهد | وضعیت | اقدام بعدی |
|---|---|---|---|---|
| GANTT-TRACE-001 | اعتبارسنجی JSON، شناسه‌های یکتا، ساختار شش‌سطحی، وضعیت/درصد، معیارهای سطح ۴ و وابستگی بدون چرخه | `scripts/gantt.mjs`, `tests/gantt.test.mjs`; CI سبز [40717532355](https://github.com/pasoooir/Erp/actions/runs/40717532355) | completed | حفظ قرارداد در CI پس از ادغام کنترل‌شده |
| GANTT-TRACE-002 | محاسبه والدها از فرزندان و عدم ایجاد وضعیت/درصد مصنوعی برای شاخه‌های دست‌نخورده | `scripts/gantt.mjs`; تست مثبت/منفی، چرخه وابستگی و sync روی کپی؛ JSON شاخه PR #2 فقط در شاخه‌های دارای شواهد همگام شده است؛ IDها، ترتیب و وابستگی‌ها تغییر نکرده‌اند | completed | ادامه ردیابی وظایف واقعی؛ برگ‌ها فقط با معیار و شواهد completed شوند |
| GANTT-TRACE-003 | داشبورد RTL، بارگذاری موفق/ناموفق JSON، جست‌وجو/فیلتر، جزئیات، CSV، لینک امن و نمایش موبایل | `Gonchar.html`, `tests/dashboard-browser.test.mjs`; Chromium CI سبز [40715749671](https://github.com/pasoooir/Erp/actions/runs/40715749671) | completed | پس از ادغام، انتشار GitHub Pages را جداگانه بررسی کن |
| GANTT-TRACE-004 | بررسی واقعی محل کد ERP و جلوگیری از ادعای ساختگی | main tree فقط سه فایل برنامه‌ریزی/داشبورد دارد؛ کد عملیاتی در شاخه PR #3 است | completed | پس از ادغام PR #3، وضعیت main را دوباره ممیزی کن |
| CF-CONN-001 | اثبات Token، D1 query و read-only endpointهای لازم از GitHub Actions | [CI 40712132595](https://github.com/pasoooir/Erp/actions/runs/40712132595): D1 list، SELECT و no-op UPDATE موفق؛ Workers/Pages/KV HTTP موفق با count=0؛ R2 403؛ اجرای نهایی به‌علت نبود Variable fail شد | blocked | `CLOUDFLARE_ACCOUNT_ID` را در Settings → Secrets and variables → Actions → Variables در سطح همین repository قرار بده؛ Secret معتبر است و مقدارش چاپ نشده |
| ERP-FOUNDATION-001 | برش عمودی احراز هویت/نشست، D1 migration، مجوز سمت سرور، ممیزی، ساختار سازمانی و UI | [PR #3](https://github.com/pasoooir/Erp/pull/3); `src/index.js`, `migrations/0001_erp_foundation.sql`, `migrations/0002_scoped_rbac.sql`, `public/`, `tests/worker.test.mjs`, `tests/worker-runtime-smoke.mjs`; CI سبز [40715257341](https://github.com/pasoooir/Erp/actions/runs/40715257341) | in_progress | تکمیل ویرایش نقش/محدوده، دعوت/MFA/بازیابی رمز، ماتریس کامل نقش‌ها و pagination؛ بدون deploy یا remote migration |
| ERP-FOUNDATION-002 | مهاجرت روی D1 توسعه اختصاصی | migration روی D1 محلی در CI اعمال شد؛ `wrangler.toml` از UUID محلی استفاده می‌کند؛ هیچ D1 راه‌دور تغییر نکرد | in_progress | بعداً یک D1 توسعه جداگانه تعیین و UUID آن را پس از بازبینی تنظیم کن؛ دیتابیس connectivity را استفاده نکن |
| ERP-FOUNDATION-003 | رفتار واقعی UI مرورگر | Chromium smoke در [40715257341](https://github.com/pasoooir/Erp/actions/runs/40715257341) bootstrap/login، ایجاد/ویرایش/فعال‌سازی واحد، ایجاد کاربر با scope، نام محدوده، cross-company denial، revoke نشست، نقش‌های read-only و RTL موبایل را بررسی کرد | in_progress | آزمون مرورگری خطاهای فرم/شبکه و نقش غیرمدیر را بیشتر کن |

## اقدام اجرایی جاری — ویرایش نقش و محدوده دسترسی

- شاخه کاری: `feature/erp-user-role-scope-edit`.
- API ویرایش `PATCH /api/v1/users/{id}` در این شاخه وجود دارد؛ رابط فعلی هنوز فرم ویرایش نقش/محدوده را ارائه نمی‌کند.
- رابط مدیر برای انتخاب نقش و محدوده و ارسال `PATCH /api/v1/users/{id}` در `public/modules/erp-shell/erp-shell.js` و `public/index.html` موجود است.
- CI اجرای [40747049884](https://github.com/pasoooir/Erp/actions/runs/40747049884) پس از تغییرات موفق شد: بررسی نحو JS، آزمون‌های Worker/D1، migration محلی و اجرای Worker روی Cloudflare runtime محلی همگی سبز هستند.
- رفع مسیر assetها: لینک CSS و JavaScript از مسیر ریشه دامنه به مسیر نسبی تغییر کرد تا هنگام میزبانی زیرمسیر GitHub Pages مانند `/Erp/` فایل‌ها از ریشه دامنه درخواست نشوند. این تغییر هنوز نیازمند CI مستقل و بررسی انتشار Pages است.

## کارهای افزوده‌شده

| شناسه | معیار پذیرش | فایل‌ها و شواهد | وضعیت | اقدام بعدی |
|---|---|---|---|---|
| ERP-AUDIT-API-001 | API گزارش ممیزی با کنترل دسترسی، صفحه‌بندی و آزمون منفی | `src/index.js`, `tests/worker.test.mjs`; CI سبز [40740073673](https://github.com/pasoooir/Erp/actions/runs/40740073673); PR #4 | completed | حفظ کنترل مجوز و قرارداد صفحه‌بندی |
| ERP-USER-ACCESS-API-001 | PATCH نقش/محدوده با اعتبارسنجی، ثبت ممیزی و منع تغییر حساب جاری | `src/index.js`, `tests/worker.test.mjs`, `docs/ERP_FOUNDATION.md`; شاخه `feature/erp-user-role-scope-edit` | in_progress | CI و آزمون منفی؛ سپس UI ویرایش نقش/محدوده |
| ERP-AUDIT-UI-001 | گزارش ممیزی فارسی RTL متصل به API با بارگذاری بیشتر، حالت خالی و نمایش امن متن | `public/index.html`, `public/modules/erp-shell/erp-shell.js`, `public/modules/erp-shell/erp-shell.css`, `public/modules/auth/login/`, `tests/worker-runtime-smoke.mjs`; CI سبز [40740502094](https://github.com/pasoooir/Erp/actions/runs/40740502094) شامل Chromium و Worker runtime؛ PR #4 | completed | توسعه گردش ویرایش نقش/محدوده کاربر |

## قرارداد پیشرفت و همگام‌سازی

وضعیت‌ها: `not_started`، `in_progress`، `blocked`، `completed`. تکمیل فقط با معیارهای پاس‌شده و شواهد قابل بازبینی مجاز است.

- Parent progress میانگین برابر فرزندان مستقیم است؛ وضعیت والد از وضعیت فرزندان مشتق می‌شود.
- `--sync-summary` شاخه‌های دارای وضعیت/درصد ثبت‌شده را همگام می‌کند و برای شاخه‌های دست‌نخورده مقدار صفر مصنوعی اضافه نمی‌کند.
- در شاخه PR #2 تعداد ۷٬۷۲۸ گره حفظ شده است؛ ۱۸ برگ سطح ۶ به شواهد PR #3 متصل‌اند، ۶ برگ completed و ۱۲ برگ in_progress هستند. فقط اجداد این برگ‌ها وضعیت/درصد گرفته‌اند.
- `main` دست‌نخورده مانده؛ هیچ PR ادغام نشده است. پیشرفت ۰٫۱۸٪ مربوط به داده برنامه‌ریزی شاخه PR #2 است، نه Production.

## مرزهای عملیاتی

هیچ merge به main، deploy عملیاتی، migration روی دیتابیس واقعی، تغییر Secret یا حذف داده واقعی انجام نشده است. تست‌های Wrangler و D1 در CI محلی بوده‌اند. برای اتصال GitHub Actions به Cloudflare، Token اعتبارسنجی شده و عملیات D1/Workers/Pages/KV read-only موفق بوده، اما متغیر repository-level هنوز باید اصلاح شود. R2 نیازمند بررسی/فعال‌سازی در Dashboard است.


## ERP-AUTH-UI-001 — بازطراحی فرم ورود

- محدوده: فقط تجربه ورود؛ هیچ قرارداد API یا سیاست احراز هویت سمت سرور تغییر نکرده است.
- تغییرات واقعی در شاخه `feature/erp-user-role-scope-edit`: `public/index.html` (پوسته)، `public/modules/auth/login/login-form.html`, `login-form.css`, `login-form.js` (ماژول ورود)، `public/modules/erp-shell/erp-shell.css`, `erp-shell.js` (پوسته ERP)، `src/modules/auth/login/login-handler.js`, `migrations/0003_auth_username.sql`, `tests/worker.test.mjs` و `tests/worker-runtime-smoke.mjs`.
- commitهای تغییر: `95f9d5630e48b525556db09a0544a89bd74acaf1`, `9a011c652891592b52dcff29757afe87ed3630b6`, `304eaacb1c7e51a672f21553d735a7ad061632c6`.
- معیارهای پیاده‌سازی: ورود با نام کاربری یا ایمیل و رمز عبور؛ username یکتا در D1 با migration افزایشی؛ bootstrap و ساخت کاربر با نام کاربری؛ حفظ cookie امن، هش رمز، rate limit و audit؛ فرم ورود به‌صورت HTML/CSS/JS اختصاصی در پوشه ماژول.
- وضعیت: `completed` — CI [40824985340](https://github.com/pasoooir/Erp/actions/runs/40824985340) سبز: syntax، تست‌های Worker/D1، اعمال migration روی D1 محلی و smoke مرورگر/Cloudflare runtime موفق؛ تست موبایل RTL و ورود با نام کاربری در smoke اجرا شد. تا زمان موفقیت تست‌ها و بررسی صفحه در موبایل/دسکتاپ، تکمیل‌شده محسوب نمی‌شود.
- ممنوعیت‌های رعایت‌شده: بدون merge به `main`، deploy، تغییر Secret یا migration راه‌دور.


## ERP-AUTH-USERNAME-001 — ورود با نام کاربری و رمز عبور

- API ورود به ماژول مستقل `src/modules/auth/login/login-handler.js` منتقل شده و مسیر `POST /api/v1/auth/login` اکنون `identifier`، `username` یا `email` به‌همراه `password` را می‌پذیرد.
- migration افزایشی `migrations/0003_auth_username.sql` ستون username و ایندکس یکتای بدون حساسیت به بزرگی حروف را اضافه می‌کند؛ migration فقط در CI محلی است و روی D1 راه‌دور اجرا نشده.
- فرم ورود و assets در `public/modules/auth/login/`؛ پوسته عمومی رابط در `public/modules/erp-shell/`. `public/index.html` فقط پوسته/نقطه اتصال ماژول را نگه می‌دارد.
- تست‌های Worker و Chromium برای username login اضافه/به‌روزرسانی شده‌اند؛ وضعیت تا پایان CI: `in_progress`.
- محدودیت: هنوز در شاخه توسعه و تأیید نشده برای production؛ هیچ deploy یا merge انجام نشده است.

## به‌روزرسانی وضعیت واقعی پس از ادغام PR #7 — 2026-10-29

> این بخش جایگزین برداشت‌های قدیمی بالا درباره وضعیت `main` است. اعداد و وضعیت‌های زیر فقط به تغییراتی اشاره دارند که در commit ادغام‌شده ثبت شده‌اند؛ به معنی تکمیل ERP کارخانه یا آماده‌بودن همه ماژول‌ها نیستند.

- **ادغام در main:** PR #7 با موفقیت squash-merge شد؛ merge commit: `c1b3e9968719492adf0f859a403d8a683babcad6`.
- **CI قبل از ادغام:** اجرای ERP foundation checks برای head `fb1821d0e4edb166ee480809d3ae349df514a523` موفق شد: [GitHub Actions run 40825845164](https://github.com/pasoooir/Erp/actions/runs/40825845164). پس از ادغام CI روی commit ادغام‌شده موفق شد: [run 40825987275](https://github.com/pasoooir/Erp/actions/runs/40825987275). پس از افزودن entrypoint سازگار با Pages نیز بررسی کامل syntax، آزمون‌های واحد، مهاجرت محلی D1 و runtime مرورگر موفق شد: [run 40826135326](https://github.com/pasoooir/Erp/actions/runs/40826135326).
- **رابط وب:** فایل‌های ورود و پوسته در `public/modules/auth/login/` و `public/modules/erp-shell/` قرار دارند؛ فایل‌های تک‌تکه قدیمی `public/app.js` و `public/styles.css` حذف شده‌اند.
- **پایه API:** کد Worker در `src/index.js` و handler ورود در `src/modules/auth/login/login-handler.js` وجود دارد. آزمون‌های محلی/CI روی migrationها و runtime انجام می‌شوند؛ این به‌تنهایی اثبات اتصال به دیتابیس عملیاتی نیست.
- **انتشار صفحات:** workflow انتشار `.github/workflows/deploy-pages.yml` پوشه `public/` را منتشر کرده و run [40825987358](https://github.com/pasoooir/Erp/actions/runs/40825987358) با موفقیت پایان یافته است؛ GitHub Actions گزارش داده URL محیط `https://pasoooir.github.io/Erp/` است. برای سازگاری با تنظیمات خودکار Pages که از ریشه شاخه نیز build می‌گیرد، `index.html` ریشه با مسیرهای `public/modules/` و فایل‌های `.nojekyll` اضافه شده‌اند. run بعدی انتشار پس از این اصلاحات نیز موفق شد: [40826135321](https://github.com/pasoooir/Erp/actions/runs/40826135321).
- **پایگاه داده:** `wrangler.toml` فعلی از شناسه محلی/نمونه استفاده می‌کند؛ این شناسه دیتابیس تولیدی نیست. دیتابیس `erp-connectivity-test-20261028` نیز صرفاً آزمایشی است و نباید برای داده‌های واقعی استفاده شود. هیچ migration تولیدی در این ادغام اجرا نشده است.
- **محدودیت حیاتی:** GitHub Pages میزبان استاتیک است و مستقیماً به D1 وصل نمی‌شود. برای ورود و CRUD واقعی، frontend باید به API امن قابل دسترس وصل باشد و آن API به D1 عملیاتی صحیح متصل شود. تا زمانی که endpoint و شناسه دیتابیس عملیاتی تأیید نشده‌اند، عملیات واقعی داده‌ای «تکمیل‌شده» محسوب نمی‌شود.

### وضعیت پذیرش این برش

| مورد | وضعیت | شواهد/مانع |
|---|---|---|
| کد پایه ورود، نشست، RBAC و واحدهای سازمانی در مخزن | 🟢 ادغام‌شده | PR #7 و commit بالا؛ CI پیش از ادغام سبز |
| ماژول‌بندی frontend | 🟢 ادغام‌شده | `public/modules/**` |
| آزمون واحد و runtime محلی | 🟢 موفق در CI پیش از ادغام | run 40825845164 |
| انتشار واقعی GitHub Pages | 🟢 انتشار workflow موفق | runهای 40825987358 و 40826135321؛ URL گزارش‌شده: `https://pasoooir.github.io/Erp/` |
| اتصال API به D1 عملیاتی | 🔴 مسدود | endpoint و D1 عملیاتی تأییدشده در تنظیمات فعلی موجود نیستند؛ شناسه Wrangler نمونه است |
| ERP کامل و همه ماژول‌های کارخانه | ⬜ شروع‌نشده/در حال توسعه | این PR فقط پایه عملیاتی است؛ HR، خرید، فروش، انبار کامل، تولید، کیفیت، حسابداری و سایر ماژول‌ها هنوز معیار پذیرش مستقل می‌خواهند |

**قاعده گزارش‌دهی:** ادغام کد یا سبز بودن CI، به معنی انتشار موفق یا تکمیل ERP نیست. برای تغییر وضعیت هر مورد به 🟢 باید نتیجه قابل بازتولید و معیار پذیرش همان مورد ثبت شود.


### سازگاری انتشار Pages پس از ادغام

- فایل `index.html` در ریشه شاخه برای حالتی اضافه شده که GitHub Pages به‌صورت branch/Jekyll تنظیم شده باشد؛ در این حالت assetها از `public/modules/` بارگیری می‌شوند.
- فایل‌های `.nojekyll` در ریشه و `public/` افزوده شدند تا Jekyll فایل‌های استاتیک ماژول‌ها را حذف نکند.
- workflow انتشار artifact از `public/` جداگانه موفق شده است؛ runهای انتشار فوق شاهد موفقیت سمت GitHub هستند، نه اثبات کارکرد ورود به D1.

- **پاک‌سازی PRهای تکراری:** PRهای #3، #4 و #6 پس از ادغام مجموع تغییراتشان در PR #7 با توضیح روشن بسته شدند؛ PRهای نامرتبط #1 و #2 جداگانه باز مانده‌اند.


## اصلاح معماری میزبانی — GitHub Pages و Cloudflare Worker مستقل

| شناسه | معیار پذیرش | تغییر | وضعیت | شواهد/اقدام بعدی |
|---|---|---|---|---|
| ERP-HOSTING-ARCH-001 | Frontend مستقل از Cloudflare Pages روی GitHub Pages منتشر شود | workflow موجود `.github/workflows/deploy-pages.yml` پوشه `public/` را به GitHub Pages می‌فرستد؛ این مسیر حفظ می‌شود | completed | workflow باید پس از ادغام تغییرات، با اجرای واقعی Pages تأیید شود |
| ERP-HOSTING-ARCH-002 | ورودی مستقل Cloudflare Worker با فایل `workers.js` وجود داشته باشد | `wrangler.toml` به `workers.js` اشاره می‌کند؛ این ورودی درخواست‌های `/api/*` را به منطق API موجود در `src/index.js` واگذار می‌کند | in_progress | اجرای `npm run check`، تست Worker و بررسی CI در PR |
| ERP-HOSTING-ARCH-003 | پیکربندی Pages Assets/Preview از Worker جدا شود | `assets` و `previews` از `wrangler.toml` حذف شده‌اند؛ D1 binding و APP_ORIGIN باقی مانده‌اند | in_progress | بازبینی diff و اجرای CI؛ هیچ Worker production deploy یا D1 migration انجام نشده است |

**مرز استقرار:** GitHub Pages برای رابط کاربری؛ Cloudflare Workers برای API؛ Cloudflare D1 فقط پشت Worker. Cloudflare Pages در مسیر انتشار این پروژه استفاده نمی‌شود.


## بازبینی شواهد استقرار و احراز هویت — 2026-10-30

این بخش مرجع وضعیت جدیدتر است و موارد متناقض/قدیمی‌تر در بخش‌های قبل را برای وضعیت جاری اصلاح می‌کند.

| شناسه | معیار پذیرش | شواهد تازه | وضعیت | اقدام بعدی |
|---|---|---|---|---|
| ERP-AUTH-UI-002 | نمایش فرم ورود در مسیر عادی و محدودکردن bootstrap به `?setup=1` هنگام نیاز | PR #16 در main ادغام شد؛ GitHub Pages deploy run `41024132999` موفق؛ live API smoke run `41024735521` موفق؛ تست مرورگر Worker در run `41024382213` هر دو حالت فرم را بررسی کرد | completed برای کد و smoke؛ ورود واقعی حساب مالک هنوز تأیید نشده | مالک سامانه مدیر اولیه را با secret خصوصی خودش یک‌بار ایجاد کند؛ رمز/secret در چت یا repo ثبت نشود |
| ERP-RUNTIME-SMOKE-002 | اجرای مسیر استاتیک Pages و API proxy در تست runtime محلی بدون 404 یا پاسخ JSON خراب | PR #17 ادغام شد؛ run `41024382213` در همه مراحل از جمله Chromium و Worker runtime موفق | completed | قرارداد smoke در CI حفظ شود |
| ERP-CF-PREVIEW-001 | Cloudflare Workers Builds preview بدون اتصال به D1 تولیدی | PR #18 شاخه `fix/cloudflare-preview-safe-d1-config`؛ commit `5dfd09c890f228eee6274cfcf6ce348acf8c32c1`; Cloudflare preview deployment `825a79da-c32f-4f69-ab24-ea6629877b95` با Build و Deployment موفق؛ D1 مجزا `erp-preview-passkey-e2e` شناسه `b108b011-6b3c-49cf-a7c2-7cae0b8b0416` و در زمان بررسی صفر جدول دارد | completed برای ایجاد preview و جداسازی binding؛ PR #18 هنوز باز است | اجرای smoke مستقل preview و سپس بازبینی PR؛ هیچ migration روی D1 preview یا production اجرا نشود |
| ERP-CI-LIVE-API-002 | بررسی API عملیاتی، health، وضعیت bootstrap و CORS بدون تغییر داده | live API smoke run `41024735521` همه ۸ مرحله موفق؛ foundation run `41024735546` همه مراحل موفق | completed برای معیارهای smoke | ورود واقعی و CRUD فقط پس از ایجاد مدیر و تست مجاز مالک بررسی شود |

### مرزهای تأیید و انتشار

- PR #16 و PR #17 در main ادغام شده‌اند؛ PR #18 با وضعیت open است و ادغام نشده.
- Pages deployment run `41024580427` و ERP foundation run روی main با شناسه `41024581296` موفق‌اند.
- Cloudflare preview برای PR #18 با شناسه deployment بالا موفق است. یک build دستی تکراری که به‌دلیل trigger branch filter به trigger اصلی متصل نبود، لغو شد؛ این مورد deployment موفق PR را نقض نمی‌کند.
- D1 preview در زمان بررسی خالی بود (`num_tables=0`)؛ هیچ migration روی آن اجرا نشده است. D1 تولیدی، secrets و deployment عملیاتی در این مرحله تغییر نکرده‌اند.
- وضعیت ورود با حساب واقعی مالک: تأییدنشده؛ smoke testهای عمومی عمداً هیچ credential یا bootstrap secret واقعی را استفاده نمی‌کنند.
- آخرین commit مبنای main در این بازبینی: `ec62e092179faa6a92290d5be82d587939aac54e`.

**قاعده:** سبز بودن CI، موفقیت Preview یا انتشار Pages به‌تنهایی اثبات ورود واقعی، تکمیل ماژول‌های ERP یا صحت گردش‌های داده‌ای کارخانه نیست.


### تأیید مرورگر روی GitHub Pages منتشرشده — 2026-10-30

- اجرای [ERP live API smoke run 41025370318](https://github.com/pasoooir/Erp/actions/runs/41025370318) موفق شد؛ تمام ۱۰ مرحله job زنده از جمله Health، اتصال D1، Bootstrap status، CORS و Preview سبز هستند.
- job مستقل `published-pages-browser-smoke` در همان run با Chromium روی viewport موبایل 390×844 موفق شد: فرم ورود در مسیر عادی قابل مشاهده بود، فرم bootstrap پنهان بود، و در `?setup=1` با توجه به `bootstrap_required=true` فرم راه‌اندازی اولیه نمایش داده شد.
- این تست فقط UI منتشرشده و رفتار مسیرها را تأیید می‌کند؛ مدیر اولیه هنوز ساخته نشده و ورود با credential واقعی مالک آزمایش نشده است.


## منابع انسانی — وضعیت اجرایی (2026-10-30)

| شناسه | محدوده و معیار پذیرش | شواهد قابل بازبینی | وضعیت | اقدام بعدی |
|---|---|---|---|---|
| HR-PEO-A / HR-PEO-B | پرونده پایه کارکنان و قراردادهای استخدامی با scope سازمانی، اعتبارسنجی، audit و رابط RTL | PR #20؛ foundation run [41027500974](https://github.com/pasoooir/Erp/actions/runs/41027500974) سبز؛ live API smoke [41027501052](https://github.com/pasoooir/Erp/actions/runs/41027501052) سبز؛ Cloudflare Preview build/deployment commit `2f2933b` موفق با D1 مجزای Preview | 🟡 پیاده‌سازی و آزمون شاخه‌ای موفق؛ PR هنوز ادغام نشده | پس از ادغام کنترل‌شده، migration و runtime روی main دوباره تأیید شوند |
| HR-TIME-A | رویدادهای خام ورود/خروج با idempotency، ترتیب زمانی و transition اتمی | PR #21؛ migration `0005_hr_time.sql`؛ جدول state برای جلوگیری از دو ورود هم‌زمان؛ تست رقابت دو درخواست ورود؛ foundation CI [41028780786](https://github.com/pasoooir/Erp/actions/runs/41028780786) سبز | 🟡 پیاده‌سازی و آزمون کامل در شاخه؛ ادغام باقی است | پس از ادغام PR #20 و سپس PR #21، CI روی main اجرا شود |
| HR-TIME-B | درخواست/تصمیم مرخصی با جلوگیری از هم‌پوشانی در سطح D1، کنترل scope و audit | PR #21؛ D1 triggers برای جلوگیری از overlap حتی در رقابت هم‌زمان؛ تصمیم فقط برای pending و audit شرطی؛ تست‌های concurrency در foundation CI [41028780786](https://github.com/pasoooir/Erp/actions/runs/41028780786) سبز | 🟡 پیاده‌سازی و آزمون کامل در شاخه؛ ادغام باقی است | پس از ادغام، migration و آزمون یکپارچه روی main |
| HR-TIME-C | رابط RTL برای ثبت/مشاهده ورود و خروج، درخواست و تأیید/رد مرخصی؛ بدون overflow موبایل | PR #21؛ فایل‌های `public/modules/hr/personnel/personnel.html/js/css`؛ Chromium/Worker runtime در foundation CI [41028780786](https://github.com/pasoooir/Erp/actions/runs/41028780786) سبز؛ live API smoke [41028780798](https://github.com/pasoooir/Erp/actions/runs/41028780798) سبز | 🟡 پیاده‌سازی و آزمون کامل در شاخه؛ ادغام باقی است | پس از ادغام، Pages deployment و browser smoke را دوباره تأیید کن |
| HR-TAL | جذب، آموزش و ارزیابی | هنوز API/schema/UI مستقل ندارد | ⬜ شروع‌نشده | برش مستقل پس از تثبیت HR-TIME |
| HR-PAY | حقوق و دستمزد | عمداً شروع نشده؛ نیازمند قواعد مصوب دوره، مالیات، مزایا، گردکردن، محرمانگی و کنترل دسترسی ویژه | ⬜ شروع‌نشده | ابتدا تصمیم‌های رسمی مالی/قانونی؛ هیچ محاسبه‌ای با فرضیات ساخته نشود |

### مرز پذیرش HR

- PR #20 و PR #21 هر دو باز و ادغام‌نشده‌اند؛ HR در `main` تکمیل‌شده محسوب نمی‌شود.
- PR #21 به PR #20 وابسته است و base آن `feature/hr-personnel-contracts` است؛ پس از ادغام PR #20 باید base به `main` تغییر کند.
- حضور و غیاب فعلاً فقط رویداد خام را ثبت می‌کند؛ شیفت، تعطیلات، اضافه‌کاری، کسری کار، گردکردن و اتصال Payroll بدون سیاست مصوب پیاده‌سازی نمی‌شوند.
- درخواست مرخصی هم‌پوشان در سطح D1 رد می‌شود؛ audit فقط برای تصمیمی ثبت می‌شود که transition pending را برنده شده باشد.
- migrationهای 0004 و 0005 فقط در D1 محلی CI اجرا شده‌اند؛ هیچ migration راه‌دور، Production deploy، تغییر Secret یا عملیات داده واقعی انجام نشده است.
- Cloudflare Preview برای PRهای #19 و #20 با binding اختصاصی Preview build/deploy موفق داشته؛ PR #21 نیز برای commit `72fb5cc` با D1 Preview جداگانه build و deploy موفق داشته است.
- مدیر اولیه واقعی هنوز توسط مالک ساخته نشده و ورود با credential واقعی مالک تأیید نشده است.

**قاعده وضعیت:** سبز بودن API smoke یا Preview به معنی ادغام، استقرار Production یا تکمیل HR نیست. هر زیرشناسه پس از پذیرش branch-level فقط زمانی در main سبز می‌شود که merge کنترل‌شده و آزمون پس از ادغام نیز موفق باشد.


## احراز هویت بدون رمز — بازبینی یکپارچه‌سازی Passkey (2026-10-30)

| شناسه | معیار پذیرش | شواهد/وضعیت فعلی | وضعیت | اقدام لازم |
|---|---|---|---|---|
| ERP-AUTH-PASSKEY-001 | ثبت مدیر اولیه و ورود با WebAuthn Passkey، challenge یک‌بارمصرف، بررسی origin/RP ID و counter | PR #12؛ foundation CI [41021661760](https://github.com/pasoooir/Erp/actions/runs/41021661760) و live API smoke [41021661787](https://github.com/pasoooir/Erp/actions/runs/41021661787) موفق؛ Cloudflare Preview برای commit `bec74b1` با build/deploy موفق | 🟡 کد و CI شاخه‌ای تأیید شده؛ یکپارچه‌سازی با main مسدود | شاخه PR #12 از main فعلی ۱۶ commit عقب است؛ باید روی نسخه فعلی rebase/بازسازی شود |
| ERP-AUTH-PASSKEY-MIG-001 | ترتیب migrationها بدون شماره تکراری | PR #12 از `0004_passkey_auth.sql` استفاده می‌کند، درحالی‌که HR در PR #20 از `0004_hr_personnel.sql` و PR #21 از `0005_hr_time.sql` استفاده می‌کند | 🔴 تعارض یکپارچه‌سازی | migration Passkey پس از HR به `0006_passkey_auth.sql` منتقل و تمام تست/مستندات به‌روز شوند |
| ERP-AUTH-PASSKEY-CPU-001 | اثبات سازگاری عملیات WebAuthn با سقف CPU پیش‌فرض Workers Free | Preview build/deploy موفق است، اما اندازه‌گیری مستقل CPU برای registration/login هنوز در شواهد CI وجود ندارد | 🟡 نیازمند اندازه‌گیری | ثبت CPU واقعی برای مسیرهای options/verify و آزمون با پلن Free |
| ERP-AUTH-PASSKEY-LIFECYCLE-001 | انتقال همه کاربران به passwordless و حذف PBKDF2 | خود PR #12 تصریح می‌کند legacy password login/provisioning هنوز باقی است؛ دعوت/بازیابی امن و مهاجرت تمام کاربران کامل نیست | 🔴 ناقص | طراحی invitation/recovery و migration کاربران؛ سپس حذف endpoint رمز و PBKDF2 |
| ERP-AUTH-PASSKEY-SEC-001 | فرم bootstrap بدون داده هویتی پیش‌فرض و بدون داده شخصی hardcoded | در فایل bootstrap شاخه PR #12 مقادیر هویتی پیش‌فرض در markup دیده می‌شود | 🔴 نیازمند اصلاح پیش از ادغام | حذف تمام مقدارهای هویتی پیش‌فرض؛ دریافت اطلاعات مدیر فقط از فرم خالی و کنترل سمت سرور |

**مرز ادعا:** PR #12 یک زیرساخت Passkey معتبر در شاخه خودش دارد، اما هنوز باز و یکپارچه‌نشده است؛ CI سبز آن، سازگاری با HR migrationهای جدید، تکمیل چرخه عمر همه کاربران یا اندازه‌گیری CPU پلن Free را اثبات نمی‌کند. هیچ migration راه‌دور یا Production deploy انجام نشده است.

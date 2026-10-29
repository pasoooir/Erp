# دفتر اجرای پروژه ERP — وضعیت مبتنی بر شواهد

آخرین بازبینی: 2026-10-29 (به‌روزرسانی رابط ورود)  
مخزن: [pasoooir/Erp](https://github.com/pasoooir/Erp)  
شاخه مرجع: `main`  
آخرین commit بررسی‌شده در main: `d28965723a99e14df5dfd3e68c1d77dd68d0632e`

## خلاصه اجرایی

- در `main` هنوز برنامه ERP عملیاتی وجود ندارد؛ درخت کامل فقط `Gonchar.html`، `README.md` و `erp-project.json` را نشان می‌دهد.
- برش عمودی ERP در شاخه PR #3 اکنون شامل احراز هویت، نشست، D1 schema، ساختار سازمانی، scope-based RBAC، مدیریت کاربر و UI فارسی RTL است؛ CI محلی/مرورگری آن موفق است، اما PR ادغام نشده و Production منتشر نشده است.
- در شاخه PR #2، گانت به شواهد PR #3 متصل شده است. ۱۸ وظیفه سطح ۶ ردیابی شده‌اند؛ ۷ برگ completed و ۱۱ برگ in_progress. پیشرفت برنامه‌ریزی محاسبه‌شده در این شاخه **۰٫۳۴٪** است؛ این عدد به معنی انتشار یا تکمیل کل محصول نیست.
- [PR #1 — Cloudflare D1 connectivity smoke test](https://github.com/pasoooir/Erp/pull/1): Token موجود در GitHub Actions با موفقیت احراز هویت شد و D1، Workers Scripts، Pages و KV با درخواست read-only پاسخ موفق دادند؛ فهرست Worker/Pages/KV خالی است. R2 با 403 مواجه شد. اجرای نهایی همچنان به‌درستی fail می‌شود چون متغیر repository-level `CLOUDFLARE_ACCOUNT_ID` خالی است.
- Cloudflare: فقط D1 آزمایشی `erp-connectivity-test-20261028` وجود دارد؛ این دیتابیس عملیاتی ERP نیست و migration روی آن اجرا نشده است.

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
- **CI قبل از ادغام:** اجرای ERP foundation checks برای head `fb1821d0e4edb166ee480809d3ae349df514a523` موفق شد: [GitHub Actions run 40825845164](https://github.com/pasoooir/Erp/actions/runs/40825845164). پس از ادغام نیز اجرای CI روی commit ادغام‌شده موفق شد: [run 40825987275](https://github.com/pasoooir/Erp/actions/runs/40825987275).
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

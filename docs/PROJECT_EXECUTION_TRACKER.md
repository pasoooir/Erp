# دفتر اجرای پروژه ERP — وضعیت مبتنی بر شواهد

آخرین بازبینی: 2026-10-28 (به‌روزرسانی پس از CI اجرای 40740073673)  
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

## کارهای افزوده‌شده

| شناسه | معیار پذیرش | فایل‌ها و شواهد | وضعیت | اقدام بعدی |
|---|---|---|---|---|
| ERP-AUDIT-API-001 | API گزارش ممیزی با کنترل دسترسی، صفحه‌بندی و آزمون منفی | `src/index.js`, `tests/worker.test.mjs`; CI سبز [40740073673](https://github.com/pasoooir/Erp/actions/runs/40740073673); PR #4 | completed | حفظ کنترل مجوز و قرارداد صفحه‌بندی |
| ERP-AUDIT-UI-001 | گزارش ممیزی فارسی RTL متصل به API با بارگذاری بیشتر و نمایش امن متن | `public/index.html`, `public/app.js`, `public/styles.css`; PR #4 | in_progress | اجرای مجدد CI و آزمون مرورگر؛ بررسی خطا/حالت خالی |

## قرارداد پیشرفت و همگام‌سازی

وضعیت‌ها: `not_started`، `in_progress`، `blocked`، `completed`. تکمیل فقط با معیارهای پاس‌شده و شواهد قابل بازبینی مجاز است.

- Parent progress میانگین برابر فرزندان مستقیم است؛ وضعیت والد از وضعیت فرزندان مشتق می‌شود.
- `--sync-summary` شاخه‌های دارای وضعیت/درصد ثبت‌شده را همگام می‌کند و برای شاخه‌های دست‌نخورده مقدار صفر مصنوعی اضافه نمی‌کند.
- در شاخه PR #2 تعداد ۷٬۷۲۸ گره حفظ شده است؛ ۱۸ برگ سطح ۶ به شواهد PR #3 متصل‌اند، ۶ برگ completed و ۱۲ برگ in_progress هستند. فقط اجداد این برگ‌ها وضعیت/درصد گرفته‌اند.
- `main` دست‌نخورده مانده؛ هیچ PR ادغام نشده است. پیشرفت ۰٫۱۸٪ مربوط به داده برنامه‌ریزی شاخه PR #2 است، نه Production.

## مرزهای عملیاتی

هیچ merge به main، deploy عملیاتی، migration روی دیتابیس واقعی، تغییر Secret یا حذف داده واقعی انجام نشده است. تست‌های Wrangler و D1 در CI محلی بوده‌اند. برای اتصال GitHub Actions به Cloudflare، Token اعتبارسنجی شده و عملیات D1/Workers/Pages/KV read-only موفق بوده، اما متغیر repository-level هنوز باید اصلاح شود. R2 نیازمند بررسی/فعال‌سازی در Dashboard است.

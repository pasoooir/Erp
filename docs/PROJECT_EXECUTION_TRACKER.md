# دفتر اجرای پروژه ERP — شواهد و وضعیت فعلی

آخرین بازبینی: 2026-10-28

## وضعیت محصول

شاخه `main` در بررسی مستقیم فقط شامل `Gonchar.html`، `README.md` و `erp-project.json` است؛ در آن Worker، API عملیاتی، migration، آزمون برنامه یا رابط ERP وجود ندارد. بنابراین درصد تکمیل عملکردی ERP در main برابر **۰٪ تأییدشده** است. ساختار گانت ۷٬۷۲۸ وظیفه است و به‌تنهایی اثبات پیاده‌سازی نیست.

## ردیابی

| شناسه | معیار پذیرش | شواهد | وضعیت | اقدام بعدی |
|---|---|---|---|---|
| GANTT-TRACE-001 | اعتبارسنجی ساختار شش‌سطحی، ID یکتا، status/progress و معیار پذیرش | [PR #2](https://github.com/pasoooir/Erp/pull/2); CI [40707822995](https://github.com/pasoooir/Erp/actions/runs/40707822995) موفق؛ شامل JSON اصلی، ۷ آزمون مثبت/منفی، همگام‌سازی کپی موقت و syntax داشبورد | in_progress | آزمون رفتاری مرورگر و بازبینی diff نهایی |
| GANTT-TRACE-002 | همگام‌سازی والدها بدون حدس درباره تکمیل برگ‌ها | میانگین برابر فرزندان؛ وضعیت والد از وضعیت فرزندان؛ CI کپی موقت موفق | in_progress | اجرای diff روی کپی برای مشاهده دقیق تغییرات و افزودن تست وابستگی چرخه‌ای |
| CF-CONN-001 | اثبات دسترسی GitHub Actions به Cloudflare و D1 آزمایشی | [PR #1](https://github.com/pasoooir/Erp/pull/1)؛ کانکتور Cloudflare بیرون Actions توانست دیتابیس آزمایشی را بسازد و marker را بخواند؛ این موضوع Secretهای GitHub را اثبات نمی‌کند | blocked | ابزار فعلی فقط GET برای GitHub API دارد و dispatch دستی در دسترس نیست؛ اجرای manual workflow توسط مالک لازم است |
| ERP-FOUNDATION-001 | Worker، D1 schema، bootstrap امن مدیر، نشست، ورود/خروج، مجوز سمت سرور، ممیزی، واحد سازمانی و UI فارسی | [PR #3](https://github.com/pasoooir/Erp/pull/3); `src/index.js`, `migrations/0001_erp_foundation.sql`, `public/`, `tests/worker.test.mjs`, `wrangler.toml` | in_progress | رفع آخرین خطای assertion آزمون API؛ سپس مرور امنیتی و آزمون مرورگر |
| ERP-FOUNDATION-002 | راه‌اندازی و مهاجرت فقط روی D1 توسعه اختصاصی | شناسه در `wrangler.toml` عمداً placeholder است؛ هیچ دیتابیس راه‌دور migrate نشده | not_started | ایجاد/انتخاب D1 توسعه اختصاصی پس از تأیید شناسه و اجرای migration فقط روی آن |
| ERP-FOUNDATION-003 | UI مرورگر: bootstrap/login، نمایش/ثبت واحد، مدیریت خطا، نشست و خروج | `public/index.html`, `public/app.js`, `public/styles.css`; تست API با SQLite در CI | in_progress | افزودن Playwright و بررسی تعاملات واقعی در مرورگر |

## PR و CI

- [PR #1](https://github.com/pasoooir/Erp/pull/1) — Cloudflare D1 smoke test؛ باز و Draft. Workflow را به D1 آزمایشی ثابت محدود کرده‌ایم تا ورودی دستی نتواند دیتابیس دلخواه را هدف بگیرد. هنوز اجرای واقعی آن در GitHub Actions تأیید نشده است.
- [PR #2](https://github.com/pasoooir/Erp/pull/2) — اعتبارسنجی گانت؛ باز و Draft. آخرین CI تأییدشده: [40707822995](https://github.com/pasoooir/Erp/actions/runs/40707822995)، موفق.
- [PR #3](https://github.com/pasoooir/Erp/pull/3) — اولین برش عمودی ERP؛ باز و Draft. اجرای CI اولیه خطاهای آزمون را یافت؛ hash رمز و assertion پاسخ اصلاح شده‌اند، منتظر نتیجه اجرای تازه هستیم.

## محدودیت‌های عملیاتی

`wrangler.toml` به D1 راه‌دور وصل نمی‌شود تا شناسه توسعه اختصاصی جایگزین شود. `BOOTSTRAP_SECRET` فقط باید در `.dev.vars` محلی یا secret محیط امن نگهداری شود؛ مقدار آن در repo نیست. هیچ Worker منتشر نشده، هیچ migration راه‌دور/Production اجرا نشده، هیچ Secret تغییر نکرده و هیچ PR ادغام نشده است.

## معیار تکمیل

قابلیت فقط زمانی completed می‌شود که آزمون‌ها و CI موفق، کنترل دسترسی/خطاها بازبینی، و مسیر UI/API/DB به‌صورت یکپارچه آزمایش شده باشند. ایجاد کد یا PR به‌تنهایی پیشرفت عملکردی محسوب نمی‌شود.

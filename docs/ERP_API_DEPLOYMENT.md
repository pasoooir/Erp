# استقرار API و پایگاه داده ERP

آخرین بازبینی: 2026-10-29

## منابع مستقرشده

- رابط کاربری: GitHub Pages در `https://pasoooir.github.io/Erp/`
- API: Cloudflare Worker با نام `erp-api` در `https://erp-api.pasoooir-erp.workers.dev`
- پایگاه داده: D1 با نام `erp-production-eu` و شناسه `d33370d3-5bb9-4439-be1e-39467b903482`، محدود به حوزه EU.
- D1 آزمایشی `erp-connectivity-test-20261028` دست‌نخورده باقی مانده است.

## Schema و migration

Migrationهای `0001_erp_foundation.sql`، `0002_scoped_rbac.sql` و `0003_auth_username.sql` روی D1 اختصاصی اجرا شده‌اند. جدول `d1_migrations` نیز با نام همین سه فایل ثبت شده تا اجرای بعدی Wrangler آن‌ها را دوباره اجرا نکند. بررسی read-only فهرست جدول‌ها و migrationهای ثبت‌شده موفق بود.

## مسیرهای API پیاده‌سازی‌شده

- `GET /api/health` — سلامت Worker و اتصال D1
- `GET /api/v1/auth/status` — وضعیت راه‌اندازی اولیه
- `POST /api/v1/auth/bootstrap` — ساخت یک‌باره مدیر اولیه با secret سمت سرور
- `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout`
- `/api/v1/org-units` — فهرست، ایجاد، ویرایش و فعال/غیرفعال‌سازی واحدهای سازمانی با کنترل مجوز و scope
- `/api/v1/users` — مشاهده/ایجاد کاربر، ویرایش نقش و scope و تغییر وضعیت با کنترل سمت سرور
- `GET /api/v1/audit-events` — گزارش ممیزی صفحه‌بندی‌شده با مجوز

## کنترل‌های امنیتی

- رمز عبور با PBKDF2-SHA-256 و 310,000 تکرار hash می‌شود؛ session token خام در D1 ذخیره نمی‌شود.
- نشست HttpOnly، Secure و SameSite=None است تا از رابط GitHub Pages به API درخواست credentialed انجام شود. CORS فقط Origin دقیق `https://pasoooir.github.io` و Origin خود Worker را می‌پذیرد.
- secret راه‌اندازی فقط به‌عنوان Cloudflare Worker Secret با نام `BOOTSTRAP_SECRET` ذخیره شده و در مخزن یا فایل مستندات قرار ندارد.
- حساب مدیر هنوز bootstrap نشده است؛ تا زمانی که مالک سامانه با secret اولیه مدیر را ایجاد نکند، ورود موفق ممکن نیست.
- دیتابیس تازه است و هیچ داده واقعی وارد نشده است.

## راه‌اندازی مدیر اولیه

1. صفحه [ERP](https://pasoooir.github.io/Erp/) را باز کنید.
2. در فرم «راه‌اندازی اولیه»، کلید راه‌اندازی را وارد کنید و ایمیل، نام کاربری، نام نمایشی و یک رمز عبور قوی (حداقل ۱۲ نویسه) تعیین کنید.
3. این عملیات فقط یک‌بار موفق می‌شود. کلید راه‌اندازی را پس از استفاده در جای امن نگه دارید و در پیام‌ها یا مخزن عمومی منتشر نکنید.

**نکته استقرار:** بارگذاری Worker و پیکربندی bindingها توسط Cloudflare API با موفقیت پاسخ داده‌اند. از محیط ابزار فعلی امکان درخواست مستقیم HTTP به دامنه workers.dev برای تأیید end-to-end مرورگر فراهم نشد؛ بنابراین پیش از اعلام تأیید نهایی، باید health/login و جریان bootstrap از مرورگر واقعی نیز smoke-test شوند.

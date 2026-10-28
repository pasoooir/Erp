# دفتر اجرای پروژه ERP — وضعیت مبتنی بر شواهد

آخرین بازبینی: 2026-10-28  
مخزن: [pasoooir/Erp](https://github.com/pasoooir/Erp)  
شاخه مرجع: `main`  
آخرین commit بررسی‌شده در main: `d28965723a99e14df5dfd3e68c1d77dd68d0632e`

## خلاصه اجرایی

**وضعیت محصول:** در `main` فعلاً یک برنامه ERP عملیاتی شناسایی نشده است. درخت کامل Git در main فقط سه فایل دارد: `Gonchar.html`، `README.md` و `erp-project.json`. هیچ `package.json`، `index.html`، Worker، SQL migration، قرارداد API، آزمون برنامه یا workflow در main وجود ندارد. در شاخه PR شماره ۱ فقط workflow اتصال Cloudflare و مستندات آن اضافه شده‌اند. در تاریخچه شاخه‌های قابل مشاهده، کد ERP دیگری پیدا نشده است؛ بنابراین پیاده‌سازی محصول باید از یک پایه جدید و قابل آزمون آغاز شود، نه اینکه وضعیت گانت به‌عنوان کد موجود فرض شود.

- [PR #1 — Cloudflare D1 connectivity smoke test](https://github.com/pasoooir/Erp/pull/1): باز و Draft؛ آزمون GitHub Actions باید با متغیر/Secret واقعی اجرا شود. ابزار اتصال Cloudflare خارج از Actions توانسته D1 آزمایشی را بخواند/بنویسد، اما این اثبات نمی‌کند Secretهای GitHub Actions موجود و مجازند.
- [PR #2 — Gantt validation and execution tracking](https://github.com/pasoooir/Erp/pull/2): باز و Draft؛ آخرین اجرای ثبت‌شده پیش از تغییرات جدید، موفق بود. اجرای جدید برای تأیید regression tests و sync کپی در حال پیگیری است.
- Cloudflare: فقط D1 آزمایشی `erp-connectivity-test-20261028` شناسایی شده؛ Pages projects، Worker scripts و KV namespaces خالی‌اند؛ R2 با خطای 403/نیاز به فعال‌سازی مواجه شد. دیتابیس آزمایشی به‌هیچ‌وجه دیتابیس عملیاتی ERP نیست.
- GitHub Pages: آخرین انتشار ثبت‌شده برای main موفق بوده، اما تنها انتشار داشبورد برنامه‌ریزی است، نه برنامه ERP.

## قرارداد پیشرفت

وضعیت‌ها: `not_started`، `in_progress`، `blocked`، `completed`. فقط آزمون/شواهد قابل بازبینی اجازه `completed` می‌دهد. ایجاد فایل، workflow یا PR به‌تنهایی پیشرفت عملکردی ERP نیست. درصد محصول تا زمانی که قابلیت عمودی واقعی پیاده‌سازی و آزموده نشود، **۰٪ تأییدشده** باقی می‌ماند.

برای هر قابلیت باید مسئله، معیار پذیرش، فایل‌ها/API/جداول، آزمون‌ها، نتیجه CI، PR/commit، شواهد، مانع و اقدام بعدی ثبت شود. تعداد وظایف شش‌سطحی گانت، تعداد قابلیت‌های تحویل‌شده نیست.

## ردیابی اجرا

| شناسه | مسئله / معیار پذیرش | فایل‌ها و شواهد | وضعیت | اقدام بعدی |
|---|---|---|---|---|
| GANTT-TRACE-001 | اعتبارسنجی JSON، شناسه‌های یکتا، درخت دقیق شش‌سطحی، وضعیت/درصد، معیارهای سطح ۴ و وابستگی بدون چرخه | `scripts/gantt.mjs`, `tests/gantt.test.mjs`; [PR #2](https://github.com/pasoooir/Erp/pull/2); CI سبز [40709809309](https://github.com/pasoooir/Erp/actions/runs/40709809309) | completed | پس از ادغام کنترل‌شده، نگهداری این قرارداد در CI main |
| GANTT-TRACE-002 | همگام‌سازی والدها با میانگین برابر پیشرفت فرزندان؛ وضعیت والد: همه completed ← completed، در غیر این صورت blocked اگر فرزندی blocked باشد، سپس in_progress اگر فرزندی در حال اجرا/تکمیل باشد، وگرنه not_started؛ برگ هرگز خودکار completed نشود | `scripts/gantt.mjs`, `tests/gantt.test.mjs`; کپی موقت در CI، نه تغییر JSON اصلی | in_progress | نتیجه آخرین workflow را تأیید کن و diff کپی را بررسی کن |
| GANTT-TRACE-003 | داشبورد RTL بارگذاری، درخت، جست‌وجو/فیلتر، جزئیات، ردیابی، لینک امن، CSV و نمایش موبایل را در مرورگر درست ارائه کند | `Gonchar.html`, `tests/dashboard-browser.test.mjs`; CI سبز [40709809309](https://github.com/pasoooir/Erp/actions/runs/40709809309) با Chromium | completed | انتشار main جداگانه بررسی شود؛ این PR هنوز منتشر نشده است |
| GANTT-TRACE-004 | مشخص‌کردن دامنه واقعی کد ERP و جلوگیری از ثبت قابلیت ساختگی | main tree: فقط `Gonchar.html`, `README.md`, `erp-project.json`; شاخه PR1 فقط workflow/docs اتصال دارد | completed | کد عملیاتی در main وجود ندارد؛ آغاز پایه ERP در شاخه جداگانه با آزمون و migration آزمایشی |
| CF-CONN-001 | اثبات اتصال GitHub Actions به Cloudflare با credential واقعی، فهرست D1 و SELECT پارامتری از marker آزمایشی | [PR #1](https://github.com/pasoooir/Erp/pull/1); ابزار Cloudflare خارج از Actions: D1 تستی ساخته و marker خوانده شد | blocked | اجرای manual workflow در GitHub Actions لازم است؛ از این کانکتور امکان dispatch کردن workflow دستی فراهم نیست؛ توکن چاپ/تغییر داده نشود |
| ERP-FOUNDATION-001 | ساخت نخستین قابلیت عمودی واقعی با Worker/D1، کنترل دسترسی سمت سرور، مهاجرت و آزمون مثبت/منفی | هنوز در main پیاده‌سازی نشده | not_started | ایجاد شاخه جداگانه برای پایه عملیاتی، پس از تأیید معماری و تست‌ها؛ بدون deploy یا migration زنده |

## گانت و داشبورد

- منبع برنامه‌ریزی: `erp-project.json`، schema `1.0.0`، ۷٬۷۲۸ node و شمارش سطوح 24/72/144/576/2304/4608.
- این اعداد فقط ساختار برنامه‌ریزی را نشان می‌دهند، نه میزان تکمیل ERP.
- `Gonchar.html` فایل JSON را با `fetch('./erp-project.json')` می‌خواند و فقط‌خواندنی است.
- `scripts/gantt.mjs --check` اعتبارسنجی می‌کند؛ `--sync-summary --file /tmp/...` باید فقط روی کپی آزمایش شود تا diff بازبینی شود.
- آزمون Chromium در CI بارگذاری موفق/ناموفق JSON، جست‌وجو، فیلتر سطح/وضعیت، جزئیات، CSV و چیدمان RTL موبایل را بررسی می‌کند.
- JSON اصلی دست‌نخورده مانده؛ هر ۷٬۷۲۸ گره وضعیت و درصد ندارد و هیچ گرهی completed نیست. پرکردن وضعیت‌های والد با صفر، پیشرفت واقعی ERP را ثابت نمی‌کند.

## مرزهای اختیار

هیچ merge در main، deploy عملیاتی، migration روی دیتابیس واقعی، تغییر Secret یا حذف داده واقعی بدون تأیید صریح انجام نمی‌شود. توسعه شاخه‌ای، تست محلی/CI و منابع آزمایشی قابل بازبینی مجازند. هر محدودیت خارجی باید با شواهد و مسیر جایگزین ثبت شود.

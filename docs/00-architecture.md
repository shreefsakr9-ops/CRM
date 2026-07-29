# Blue Point OS — System Architecture

> نظام داخلي موحد لإدارة شركة Blue Point: CRM، مبيعات، عملاء، كوتيشنز، عقود، مشاريع، تاسكات، اعتمادات، فواتير، تقارير.

## 1. نظرة عامة (High-level)

```
                         ┌──────────────────────────────┐
   Browser / PWA  ─HTTPS─▶│  Caddy (Reverse Proxy, TLS)  │
   (Desktop/iOS/Android)  └───────────────┬──────────────┘
                                          │  :3000
                          ┌───────────────▼───────────────┐
                          │   Next.js App (App Router)    │
                          │  ┌─────────────────────────┐  │
                          │  │ UI Layer (RSC + Client) │  │
                          │  ├─────────────────────────┤  │
                          │  │ Server Actions / Routes │  │  ← Zod validation
                          │  ├─────────────────────────┤  │
                          │  │ Service Layer (domain)  │  │  ← Business rules
                          │  ├─────────────────────────┤  │
                          │  │ Auth + RBAC Guards      │  │  ← requirePermission()
                          │  ├─────────────────────────┤  │
                          │  │ Data Access (Prisma)    │  │  ← scoped queries
                          │  └─────────────────────────┘  │
                          └───────┬───────────────┬───────┘
                                  │               │
              ┌───────────────────▼──┐   ┌────────▼─────────────┐
              │  PostgreSQL 16       │   │  File Storage        │
              │  (append-only audit, │   │  (local volume /     │
              │   not public-facing) │   │   S3-compatible)     │
              └───────────▲──────────┘   └──────────────────────┘
                          │
              ┌───────────┴──────────┐
              │ Background Worker    │  ← notifications, reminders,
              │ (Node process, cron) │    recurring tasks, digests,
              └──────────────────────┘    invoice overdue, backups hooks
```

## 2. الطبقات (Layers)

| الطبقة | المسار | المسؤولية |
| --- | --- | --- |
| UI | `src/app/**`, `src/components/**` | عرض فقط. لا تحتوي business logic ولا استعلامات مباشرة غير مصرح بها. |
| Actions | `src/app/**/actions.ts`, `src/app/api/**` | نقطة الدخول. Validation (Zod) + استدعاء Service. |
| Services | `src/server/services/**` | كل الـ Business Rules، الترقيم، الحسابات المالية، تحويل الحالات، Audit. |
| Auth/RBAC | `src/server/auth/**` | الجلسات، تشفير كلمات المرور، `requirePermission`, `scopeFilter`. |
| Data | `src/server/db.ts` + Prisma | الوصول للبيانات، `withRlsContext` لتمرير هوية المستخدم لقاعدة البيانات. |
| Worker | `src/worker/**` | Scheduled jobs مستقلة عن دورة الطلب. |

**قاعدة صارمة:** أي عملية كتابة أو قراءة لبيانات حساسة تمر عبر Service، والـ Service تستدعي `requirePermission()` قبل أي شيء. إخفاء الزر في الواجهة ليس حماية.

## 3. Technology Stack والقرارات

| العنصر | الاختيار | السبب |
| --- | --- | --- |
| Frontend | Next.js 15 (App Router), React 19, TypeScript strict | RSC يقلل الـ JS على الموبايل، Server Actions تعطي authorization على السيرفر افتراضيًا. |
| Styling | Tailwind CSS 3.4 + CSS Variables (Design Tokens) | RTL عبر Logical Properties، Dark navy theme، حجم CSS صغير. |
| Validation | Zod 4 | Schema واحد للـ Client والـ Server. |
| DB | PostgreSQL 16 | مطلوب صراحة، يدعم RLS و JSONB و Full-text search. |
| ORM | Prisma 6 | Migrations منظمة، Type-safety، وحذف الأسرار افتراضيًا على مستوى العميل. |
| Auth | جلسات داخل قاعدة البيانات + Cookie httpOnly + scrypt | انظر ADR-001. |
| PDF | Chromium (playwright-core) → HTML → PDF | الطريقة الوحيدة الموثوقة لتشكيل العربية وRTL وخط Cairo. انظر ADR-003. |
| Charts | مكوّنات SVG داخلية خفيفة | لا تبعية ثقيلة، تحكم كامل في RTL والألوان. |
| Worker | Node process مستقل (`npm run worker`) | التنبيهات لا تعتمد على فتح الصفحة. |
| Deploy | Docker + Docker Compose + Caddy على Oracle Cloud | ARM64/AMD64، HTTPS تلقائي. |

### لماذا لم نستخدم Supabase Self-Hosted؟ (ADR-001)

Supabase Self-Hosted حزمة ممتازة لكنها تضيف ~10 حاويات (Kong, GoTrue, Realtime, Storage, Meta, Studio, Analytics…) على سيرفر Oracle Free Tier، وتفرض إدارة أسرار إضافية وسطح هجوم أوسع (Studio/Kong)، وبعض صورها لم تكن مستقرة على ARM64.

**البديل المنفذ يوفر نفس القدرات المطلوبة:**

| قدرة Supabase | البديل هنا |
| --- | --- |
| Auth (GoTrue) | جلسات مخزنة في PostgreSQL، `scrypt` (Node crypto، بدون تبعيات native)، cookies موقّعة httpOnly + SameSite=Lax، انتهاء صلاحية، إبطال الجلسات، 2FA (TOTP) اختياري. |
| PostgreSQL | نفسه — PostgreSQL 16. |
| Row-Level Security | **غير مفعّل** — الحماية كلها في طبقة الخدمة (النطاق مطبَّق داخل استعلامات Prisma). السبب والخطة في `docs/09-known-limitations.md`. المفروض من قاعدة البيانات حاليًا: **سجل تدقيق للإضافة فقط** عبر مشغّلات، و**حذف الأسرار افتراضيًا** من عميل Prisma. |
| Storage | تخزين على volume مع Signed URLs (HMAC) + التحقق من الصلاحية عند كل تحميل. متوافق مع الانتقال لـ S3/Object Storage لاحقًا. |
| Realtime | Server-Sent Events لمركز الإشعارات (اتصال واحد خفيف، يعمل خلف Caddy، لا يحتاج WebSocket sticky sessions). |

القرار قابل للمراجعة: طبقة الوصول للبيانات معزولة، والانتقال لاحقًا لا يمس الـ UI.

## 4. الأمان (طبقات الدفاع)

1. **Session**: cookie `httpOnly`, `SameSite=Lax`, `Secure` في الإنتاج، توقيع HMAC، انتهاء صلاحية (idle + absolute)، إبطال عند تعطيل المستخدم أو تغيير كلمة المرور.
2. **Server-side Authorization**: `requirePermission(module, action)` في كل Service، و`scopeFilter()` يحدد OWN/TEAM/ALL.
3. **Row-Level Security**: سياسات PostgreSQL على الجداول الحساسة كخط دفاع أخير.
4. **Validation**: Zod على كل مدخل، ورفض الحقول غير المعرفة.
5. **Rate Limiting**: على تسجيل الدخول، استعادة كلمة المرور، والتصدير.
6. **Audit Log**: append-only، مع REVOKE UPDATE/DELETE على دور التطبيق.
7. **Files**: أسماء عشوائية، تحقق من النوع والحجم، Signed URL قصير العمر، لا وصول عام.

## 5. البيانات المالية

- كل المبالغ تُخزَّن كأعداد صحيحة بوحدة العملة الصغرى (`Int`/`BigInt` = قروش/هللات/سنتات) — **لا Floating Point**.
- النسب (خصم/ضريبة/احتمالية) تُخزَّن كـ `Decimal(9,4)`.
- كل الحسابات في `src/server/services/money.ts` مع اختبارات وحدة.
- التقريب: نصف لأعلى (half-up) على مستوى السطر ثم الإجمالي، والفروق تُسوّى في آخر قسط.

## 6. المناطق الزمنية والتوطين

- التخزين: UTC (`timestamptz`).
- العرض: `Africa/Cairo` افتراضيًا، وقابل للتغيير لكل مستخدم.
- اللغة: العربية RTL افتراضيًا، الإنجليزية LTR مدعومة بالكامل (`dir` يتغير على `<html>`).
- الترجمة في `src/i18n/**` بقاموس واحد لكل لغة، بدون مكتبات ثقيلة.

## 7. البنية المادية للمجلدات

```
prisma/            schema.prisma, migrations/, seed.ts
src/
  app/             App Router: (auth)/ (app)/ api/
  components/      ui/ (design system) + domain components
  server/
    auth/          session, password, permissions, rbac guards
    services/      leads, deals, clients, quotations, contracts,
                   projects, tasks, invoices, payments, reports,
                   notifications, audit, files, settings, numbering, money
    db.ts          Prisma client (يحذف الأسرار افتراضيًا)
  worker/          scheduled jobs
  i18n/            ar.ts, en.ts
  lib/             shared utils (formatting, csv, dates)
tests/             unit + integration + permission tests
docker/            Dockerfile, Caddyfile, compose
scripts/           backup.sh, restore.sh, verify-backup.sh
docs/              هذه الوثائق
```

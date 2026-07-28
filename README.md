# Blue Point OS

> نظام داخلي متكامل لإدارة شركة Blue Point: CRM ومبيعات وعملاء وعروض أسعار وعقود ومشاريع ومهام واعتمادات وفواتير وتقارير.

النظام مبني ليُستخدم يوميًا من الإدارة وفريق المبيعات ومديري الحسابات وصنّاع المحتوى والمصممين والمونتيرين والميديا باينج والمالية — وليس كنموذج عرض.

---

## المحتويات

| الوثيقة | المحتوى |
| --- | --- |
| [docs/00-architecture.md](docs/00-architecture.md) | البنية المعمارية وقرارات التقنية |
| [docs/01-roles-permissions.md](docs/01-roles-permissions.md) | الأدوار ومصفوفة الصلاحيات |
| [docs/02-erd.md](docs/02-erd.md) | مخطط قاعدة البيانات والعلاقات |
| [docs/03-workflows.md](docs/03-workflows.md) | مسارات العمل وقواعد العمل (Business Rules) |
| [docs/04-development-plan.md](docs/04-development-plan.md) | خطة التطوير ومعايير القبول |
| [docs/05-deployment.md](docs/05-deployment.md) | النشر على Oracle Cloud خطوة بخطوة |
| [docs/06-backup-restore.md](docs/06-backup-restore.md) | النسخ الاحتياطي والاستعادة |
| [docs/07-security-checklist.md](docs/07-security-checklist.md) | قائمة التحقق الأمني |
| [docs/08-admin-guide.md](docs/08-admin-guide.md) | دليل المدير والمستخدم |
| [docs/09-known-limitations.md](docs/09-known-limitations.md) | القيود الحالية وخارطة الطريق |

---

## التشغيل السريع (بيئة التطوير)

المتطلبات: Node.js 22+، PostgreSQL 16+.

```bash
# 1) التبعيات
npm install

# 2) الإعدادات
cp .env.example .env
# عدّل DATABASE_URL وولّد الأسرار:
#   openssl rand -base64 48   → SESSION_SECRET
#   openssl rand -base64 48   → FILE_SIGNING_SECRET

# 3) قاعدة البيانات + بيانات تجريبية
npm run db:migrate
npm run db:seed

# 4) التطبيق
npm run dev            # http://localhost:3000

# 5) خدمة التنبيهات (نافذة منفصلة)
npm run worker
```

### حسابات التجربة

تُنشأ فقط عندما `SEED_DEMO_DATA=true` — **لا تستخدمها في الإنتاج إطلاقًا**.

| الحساب | الدور | كلمة المرور |
| --- | --- | --- |
| `admin@bluepoint.local` | مدير النظام | من `SEED_ADMIN_PASSWORD` |
| `ceo@bluepoint.local` | المدير التنفيذي | `Demo#2026Pass` |
| `ops@bluepoint.local` | مدير العمليات | `Demo#2026Pass` |
| `sales.manager@bluepoint.local` | مدير المبيعات | `Demo#2026Pass` |
| `sales1@bluepoint.local` | مندوب مبيعات | `Demo#2026Pass` |
| `am@bluepoint.local` | مدير حسابات | `Demo#2026Pass` |
| `design@bluepoint.local` | مصمم جرافيك | `Demo#2026Pass` |
| `finance@bluepoint.local` | المالية | `Demo#2026Pass` |
| `viewer@bluepoint.local` | مشاهدة فقط | `Demo#2026Pass` |

جرّب الدخول بحسابات مختلفة لملاحظة اختلاف الصلاحيات: مندوب المبيعات لا يرى أرباح المشاريع، والمصمم لا يرى الفواتير أصلًا.

---

## الأوامر

| الأمر | الوظيفة |
| --- | --- |
| `npm run dev` | تشغيل بيئة التطوير |
| `npm run build` | بناء نسخة الإنتاج |
| `npm start` | تشغيل نسخة الإنتاج |
| `npm run worker` | خدمة التنبيهات والوظائف المجدولة |
| `npm run worker:once` | تنفيذ دورة واحدة من الوظائف |
| `npm run typecheck` | فحص الأنواع |
| `npm test` | تشغيل كل الاختبارات |
| `npm run test:setup` | تجهيز قاعدة بيانات الاختبار |
| `npm run db:migrate` | إنشاء وتطبيق مايجريشن (تطوير) |
| `npm run db:deploy` | تطبيق المايجريشن (إنتاج) |
| `npm run db:seed` | زرع البيانات المرجعية والتجريبية |

---

## البنية

```
prisma/          مخطط قاعدة البيانات، المايجريشن، بيانات التهيئة
src/
  app/           صفحات Next.js (App Router) + API routes
  components/    نظام التصميم والمكونات المشتركة
  server/
    auth/        الجلسات، كلمات المرور، الصلاحيات، بوابات الحماية
    services/    منطق العمل كاملًا (كل عملية تمر من هنا)
  worker/        الوظائف المجدولة
  i18n/          القواميس والتسميات
  lib/           أدوات مشتركة
tests/           اختبارات الوحدة والتكامل والصلاحيات والسيناريو الكامل
docker/          Caddyfile
scripts/         النسخ الاحتياطي والاستعادة
docs/            التوثيق
```

**قاعدة معمارية صارمة:** الواجهة لا تحتوي منطق عمل ولا تصل للبيانات مباشرة. كل عملية تمر عبر Service، وكل Service تستدعي `requirePermission()` قبل أي وصول للبيانات. إخفاء زر من الواجهة ليس حماية.

---

## ملاحظات تقنية أساسية

- **المال:** كل المبالغ أعداد صحيحة بوحدة العملة الصغرى (`BigInt`). لا توجد أعداد عائمة في أي حساب مالي. الاختبارات في `tests/money.test.ts` تثبت ذلك.
- **الضرائب:** لا توجد نسبة ضريبة ثابتة في الكود — كلها من جدول `tax_rates` وقابلة للتخصيص حسب الدولة ولكل بند.
- **الصلاحيات:** `module.action` مع نطاق `OWN` / `TEAM` / `ALL`، مطبّقة على السيرفر وفي كل استعلام.
- **الحذف:** حذف ناعم افتراضيًا مع إمكانية الاسترجاع. الحذف النهائي لصلاحية خاصة فقط.
- **PDF العربي:** يُولَّد عبر Chromium مع تضمين خط Cairo داخل الملف — تشكيل عربي صحيح واتجاه RTL سليم.
- **التنبيهات:** تعمل من عملية Worker مستقلة، ولا تعتمد على فتح المتصفح.
- **RTL:** الواجهة عربية أولًا مع دعم كامل للإنجليزية، ومختبرة بحيث لا يختفي أي عمود على الموبايل بدون بديل.

---

## الترخيص والاستخدام

نظام داخلي خاص بشركة Blue Point Marketing Agency — غير مخصص للنشر العام.

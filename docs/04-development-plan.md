# Development Plan & Acceptance Criteria

## المراحل

| Phase | المحتوى | الحالة |
| --- | --- | --- |
| 0 | Discovery: Architecture, Roles, Permissions Matrix, ERD, Workflows, Plan | ✅ |
| 1 | Foundation: Setup, Design System, Auth, Users, Roles, Permissions, Settings, Audit | ✅ |
| 2 | CRM & Sales: Leads, Activities, Follow-ups, Pipeline, Deals, Sales Dashboard/Reports | ✅ |
| 3 | Clients, Contacts, Services, Quotations + PDF, Contracts | ✅ |
| 4 | Operations: Projects, Templates, Tasks, Reviews, Revisions, Approvals, Files | ✅ |
| 5 | Notifications + Worker, Invoices, Payments, Expenses, Finance Reports | ✅ |
| 6 | Executive Dashboard, Reports, Export, Security, Docker, Oracle Cloud, Backups | ✅ |
| 7 | Future: Client Portal, WhatsApp API, Email/Meta/Calendar integrations, E-signature, AI | 🚫 لم تبدأ (بعد استقرار النسخة الأساسية) |

## Definition of Done لكل Module

- [ ] الواجهة مكتملة (List + Detail + Create/Edit + إجراءات).
- [ ] مرتبطة بقاعدة البيانات الحقيقية — لا Mock Data.
- [ ] الصلاحيات مطبقة Server-side (`requirePermission` + `scopeFilter`).
- [ ] Validation بـ Zod على كل مدخل.
- [ ] Loading / Empty / Error / Success states.
- [ ] Audit Log يسجّل الإنشاء والتعديل والحذف وتغيير الحالة.
- [ ] Responsive على Desktop و Mobile (جدول → بطاقات).
- [ ] RTL صحيح + ترجمة عربي/إنجليزي.
- [ ] اختبارات أساسية ناجحة.
- [ ] لا Secrets داخل الكود.

## Acceptance Criteria (اختبار القبول الشامل)

سيناريو End-to-End واحد يجب أن يمر بالكامل (`tests/e2e-workflow.test.ts`):

| # | الخطوة | المعيار |
| --- | --- | --- |
| 1 | إنشاء Lead | يُحفظ، ويُكشف التكرار عند تكرار الهاتف. |
| 2 | إسناد لموظف مبيعات | يظهر في قائمته فقط، ويصل إشعار `lead.assigned`. |
| 3 | تسجيل أول تواصل | `firstContactAt` يُضبط ويُحتسب Response Time. |
| 4 | تحديد Follow-up | يظهر في Sales Dashboard ضمن Follow-ups Due. |
| 5 | تأهيل العميل | يُنشأ Deal بقيمة وخدمة، والمرحلة تُسجَّل في StageHistory. |
| 6 | إنشاء Quotation | الترقيم `BP-Q-YYYY-0001`، والمجاميع صحيحة حسابيًا. |
| 7 | اعتماد داخلي | لا يمكن الإرسال قبله عند تفعيل الإعداد. |
| 8 | قبول العميل | الحالة `Accepted` والصفقة `Won`. |
| 9 | تحويل إلى Client | بدون إعادة إدخال بيانات، مع جهة اتصال أساسية. |
| 10 | إنشاء Contract | مرتبط بالكوتيشن وبقيمته. |
| 11 | إنشاء Project من Template | التاسكات والاعتماديات وتواريخ الاستحقاق تُولَّد. |
| 12 | إسناد التاسكات | تظهر في My Tasks لكل مسند إليه. |
| 13 | Internal Review | لا يمكن الإغلاق قبل إكمال Checklist الإلزامية. |
| 14 | Client Revision | يُسجَّل المصدر CLIENT، ويُحتسب وقت انتظار العميل. |
| 15 | Final Approval | يُسجَّل المعتمِد والتاريخ والنسخة المعتمدة. |
| 16 | إصدار Invoice | `BP-INV-YYYY-0001`، المجاميع من الكوتيشن. |
| 17 | تسجيل Payment | الحالة تتحول Partially Paid ثم Paid. |
| 18 | التقارير | Pipeline Value و Won Revenue و Collected و Outstanding تعكس ما سبق. |

### اختبارات الصلاحيات الإلزامية (`tests/permissions.test.ts`)

- Sales Agent لا يرى أرباح المشاريع (الحقل غير موجود في الاستجابة).
- Designer يتلقى 403 عند `GET /api/invoices`.
- Finance يتلقى 403 عند تعديل محتوى مشروع.
- مستخدم لا يستطيع فتح Client خارج نطاقه عبر URL مباشر (404).
- سجل محذوف يمكن استرجاعه بواسطة من يملك `restore`.
- Audit Log يسجّل التعديلات ولا يمكن تعديله.

### اختبارات مالية (`tests/money.test.ts`)

- Subtotal / Discount / Tax / Total / الأقساط — بأرقام صحيحة بدون Floating Point.
- القسمة على صفر في CPL/ROAS/Conversion تُعيد حالة "بيانات غير كافية".

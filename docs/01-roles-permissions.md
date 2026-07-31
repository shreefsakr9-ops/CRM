# User Roles & Permissions Matrix

## 1. نموذج الصلاحيات

الصلاحية = **Module + Action**، والوصول للبيانات = **Scope**.

```
Permission  := <module>.<action>          مثال: leads.edit, invoices.view_financial
Scope       := OWN | TEAM | ALL           يُحدَّد لكل Module لكل Role
```

- الدور (Role) مجموعة صلاحيات قابلة للتعديل من الإعدادات — **لا يوجد شرط `if (role === 'CEO')` في الكود** إلا للدور `SUPER_ADMIN` (bootstrap).
- يمكن منح/سحب صلاحية لمستخدم بعينه (`UserPermissionOverride`) فوق دوره.
- التحقق يتم على السيرفر في كل Service، وعلى قاعدة البيانات عبر RLS.

### الـ Modules

`leads, deals, clients, contacts, services, quotations, contracts, projects, tasks, approvals, files, invoices, payments, expenses, reports, notifications, users, roles, settings, audit`

### الـ Actions

| Action | المعنى |
| --- | --- |
| `view` | قراءة السجلات ضمن الـ Scope |
| `create` | إنشاء |
| `edit` | تعديل |
| `delete` | حذف ناعم (Soft Delete) |
| `restore` | استرجاع محذوف |
| `purge` | حذف نهائي (صلاحية نادرة) |
| `assign` | إسناد لمستخدم آخر |
| `approve` | اعتماد (كوتيشن، تسليم، مراجعة) |
| `export` | تصدير CSV/Excel |
| `view_financial` | رؤية المبالغ والفواتير |
| `view_cost_profit` | رؤية التكاليف والأرباح |
| `manage` | إدارة كاملة للـ module (users/roles/settings) |

## 2. الأدوار

| Role | الوصف |
| --- | --- |
| `SUPER_ADMIN` | CEO / مالك النظام. كل الصلاحيات على كل البيانات. |
| `OPERATIONS_MANAGER` | يدير المشاريع والتاسكات والاعتمادات لكل الفرق. يرى الإيرادات لا الأرباح التفصيلية. |
| `SALES_MANAGER` | يدير فريق المبيعات، كل الـ Leads والـ Deals، يعتمد الكوتيشنز. |
| `SALES_AGENT` | Leads وDeals الخاصة به فقط. ينشئ كوتيشنز لكن لا يعتمدها. |
| `ACCOUNT_MANAGER` | عملاؤه ومشاريعهم، ينسّق الاعتمادات مع العميل. |
| `CONTENT_CREATOR` | تاسكاته ومشاريعه المسندة. |
| `GRAPHIC_DESIGNER` | تاسكاته ومشاريعه المسندة. |
| `VIDEO_EDITOR` | تاسكاته ومشاريعه المسندة. |
| `MEDIA_BUYER` | تاسكاته + بيانات الحملات والإنفاق الإعلاني. |
| `FINANCE` | الفواتير والمدفوعات والمصروفات والتقارير المالية. لا يعدل محتوى المشاريع. |
| `VIEWER` | قراءة فقط لما هو ضمن نطاقه، بدون بيانات مالية. |

## 3. Permissions Matrix

الرموز: `V`=view `C`=create `E`=edit `D`=delete `R`=restore `A`=assign `Ap`=approve `X`=export `$`=view_financial `P`=view_cost_profit `M`=manage
النطاق بين قوسين: (O)=Own (T)=Team (A)=All

| Module | SUPER_ADMIN | OPS_MANAGER | SALES_MANAGER | SALES_AGENT | ACCOUNT_MANAGER | CONTENT/DESIGN/VIDEO | MEDIA_BUYER | FINANCE | VIEWER |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| leads | VCEDRAApX (A) | V (A) | VCEDRAAp X (T) | VCEA (O) | V (T) | — | V (T) | — | V (T) |
| deals | VCEDRAApX$ (A) | V$ (A) | VCEDRAApX$ (T) | VCEA$ (O) | V$ (T) | — | V (T) | V$ (A) | V (T) |
| clients | VCEDRAApX (A) | VE (A) | VCEA (T) | V (O) | VCEA (T) | V (T) | V (T) | V$ (A) | V (T) |
| contacts | VCEDRA (A) | VCE (A) | VCE (T) | VCE (O) | VCE (T) | V (T) | V (T) | V (A) | V (T) |
| services | VCEDRM (A) | V (A) | V (A) | V (A) | V (A) | V (A) | V (A) | V$ (A) | V (A) |
| quotations | VCEDRApX$ (A) | V$ (A) | VCEDRApX$ (T) | VCE$ (O) | V$ (T) | — | — | V$X (A) | — |
| contracts | VCEDRApX$ (A) | V$ (A) | VCE$ (T) | V$ (O) | V$ (T) | — | — | V$X (A) | — |
| projects | VCEDRAApX$P (A) | VCEDRAAp$ (A) | V (T) | V (O) | VCEA (T) | V (O) | V (O) | V$ (A) | V (T) |
| tasks | VCEDRAApX (A) | VCEDRAAp (A) | VCEA (T) | VCE (O) | VCEAAp (T) | VCE A (O) | VCEA (O) | V (A) | V (T) |
| approvals | VApX (A) | VAp (A) | VAp (T) | V (O) | VAp (T) | V (O) | V (O) | — | — |
| files | VCEDR (A) | VCEDR (A) | VCED (T) | VCE (O) | VCED (T) | VCE (O) | VCE (O) | VC (A) | V (T) |
| invoices | VCEDRApX$ (A) | V$ (A) | V$ (T) | — | V$ (T) | — | — | VCEDRApX$ (A) | — |
| payments | VCEDRX$ (A) | V$ (A) | — | — | V$ (T) | — | — | VCEDRX$ (A) | — |
| expenses | VCEDRX$P (A) | VCE$ (A) | — | — | — | — | VCE$ (O) | VCEDRX$P (A) | — |
| reports | VX$P (A) | VX (A) | VX$ (T) | — | V (T) | — | — | VX$P (A) | V (T) |
| notifications | V E (O) | VE (O) | VE (O) | VE (O) | VE (O) | VE (O) | VE (O) | VE (O) | VE (O) |
| users | M (A) | V (A) | V (T) | — | V (T) | — | — | V (A) | — |
| roles | M (A) | — | — | — | — | — | — | — | — |
| settings | M (A) | VE (A) | — | — | — | — | — | VE (A) | — |
| audit | V X (A) | V (A) | V (T) | — | — | — | — | V$ (A) | — |

> المصدر الرسمي (Single Source of Truth) لهذه المصفوفة هو `src/server/auth/permissions.ts` + الـ seed. هذا الجدول توثيق مطابق له، وأي تعديل يجب أن يتم في الاثنين معًا.

## 4. قواعد الوصول (Scope Rules)

| Scope | التطبيق |
| --- | --- |
| `OWN` | السجلات التي المستخدم منشئها أو مسندة إليه (`ownerId`, `assigneeId`, `assignedToId`, عضو في `TaskAssignee`/`ProjectMember`). |
| `TEAM` | كل ما سبق + سجلات المستخدمين الذين `managerId = المستخدم` (شجرة مباشرة) + نفس القسم إن فُعّل `departmentScope`. |
| `ALL` | كل السجلات غير المحذوفة. |

### قواعد إضافية إلزامية

1. الحقول المالية (`estimatedValue`, `amount`, `cost`, `profit`) تُحذف من الاستجابة إذا لم يملك المستخدم `view_financial` — **الإخفاء يتم على السيرفر قبل الإرسال**.
2. التكلفة والربح تحتاج `view_cost_profit` (منفصلة عن `view_financial`).
3. `SALES_AGENT` لا يملك `projects.view_cost_profit` → لا يرى أرباح المشاريع.
4. `GRAPHIC_DESIGNER` لا يملك أي صلاحية على `invoices` → طلب الـ API يعيد 403.
5. `FINANCE` لا يملك `projects.edit` → لا يعدّل محتوى المشروع.
6. فتح سجل عبر URL مباشر يمر بنفس `scopeFilter` → 404 (لا 403، حتى لا نكشف وجود السجل).
7. `purge` متاح لـ `SUPER_ADMIN` فقط ويتطلب تأكيدًا نصيًا.
8. `/reports` وقسم «العمليات» في `/dashboard` بيانات على مستوى الشركة/الفريق كاملة بلا أي تصفية بنطاق `OWN` — الوصول إليهما يتطلب نطاق `TEAM` أو `ALL` فعليًا على `reports.view` (أو `projects.view`+`tasks.view` للوحة التحكم)، لا مجرد امتلاك الصلاحية اسميًا. مجرد منح صلاحية بنطاق `OWN` (افتراضيًا أو عبر `UserPermissionOverride`) لا يفتح هاتين الصفحتين.
9. الإشارة (@) لمستخدم في تعليق تمنحه استثناءً صريحًا لقراءة السجل المُشار فيه بعينه فقط (`isMentionedOn`)، حتى لو كان خارج نطاقه المعتاد أو لم يملك صلاحية `view` على الوحدة أصلًا — الاستثناء لسجل واحد لا للوحدة كاملة.

## 5. اختبارات إلزامية للصلاحيات

موجودة في `tests/permissions.test.ts`:

- Sales Agent ⟶ `GET /api/projects/:id` لمشروع ليس له = 404.
- Sales Agent ⟶ حقول الربح غير موجودة في الاستجابة.
- Designer ⟶ `GET /api/invoices` = 403.
- Finance ⟶ `PATCH /api/projects/:id` = 403.
- Viewer ⟶ أي `POST` = 403.
- مستخدم معطّل ⟶ كل الطلبات = 401 وجلساته مبطلة.
- سجل محذوف ⟶ لا يظهر في القوائم، ويظهر لمن يملك `restore`.

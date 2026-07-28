# Core Workflows & Business Rules

## 1. الـ Workflow الرئيسي

```
Lead → Qualification → Sales Follow-up → Meeting → Quotation → Negotiation
     → Deal Won → Client Onboarding → Contract → Project → Deliverables → Tasks
     → Internal Review → Client Approval → Delivery → Invoice → Payment → Renewal
```

كل انتقال ينشئ سجلًا في `Activity` + `AuditLog`، ولا يُعاد إدخال أي بيان أُدخل سابقًا.

## 2. من Lead إلى Deal

| القاعدة | التطبيق |
| --- | --- |
| BR-L01 | عند إنشاء Lead يُكشف التكرار بمطابقة الهاتف/الواتساب/الإيميل (مُطبَّعة) وتُعرض السجلات المشابهة قبل الحفظ. |
| BR-L02 | Lead بحالة نشطة يجب أن تحمل `nextFollowUpAt`. الاستثناء يحتاج صلاحية `leads.edit` + سبب مسجّل. |
| BR-L03 | أول انتقال إلى `Contacted` يسجّل `firstContactAt` ويُحتسب منه Response Time. |
| BR-L04 | الانتقال إلى `Qualified` يتطلب قيمة صفقة تقديرية + خدمة مهتم بها → يُنشأ `Deal` تلقائيًا. |
| BR-L05 | الانتقال إلى `Lost` يتطلب `LossReason` إلزاميًا. |
| BR-L06 | كل انتقال مرحلة يُسجَّل في `StageHistory` مع المستخدم والوقت ومدة البقاء في المرحلة السابقة. |
| BR-L07 | تحويل Lead إلى Client ينسخ البيانات وينشئ `Contact` أساسي ويربط الـ Deal بالعميل، ويقفل الـ Lead بحالة `Converted` (لا يُحذف). |

## 3. الكوتيشن

| القاعدة | التطبيق |
| --- | --- |
| BR-Q01 | الترقيم `BP-Q-YYYY-0001` من `NumberSequence` داخل transaction (لا تكرار عند التزامن). |
| BR-Q02 | أي تعديل بعد `Sent` ينشئ **نسخة جديدة** (`version+1`, `parentId`) ولا يُعدّل النسخة السابقة. |
| BR-Q03 | إذا كان الإعداد `quotation.requireInternalApproval` مفعّلًا، لا يمكن الإرسال قبل `Approved Internally`. |
| BR-Q04 | من ينشئ الكوتيشن لا يعتمدها بنفسه إلا إذا ملك `quotations.approve` وكان الإعداد `allowSelfApproval` مفعّلًا. |
| BR-Q05 | الحساب: `lineSubtotal = qty × unitPrice` → `lineDiscount` → `lineNet` → `lineTax = lineNet × taxRate` → المجاميع. التقريب half-up لكل سطر ثم الإجمالي. |
| BR-Q06 | مجموع نسب الأقساط = 100% تمامًا، وفرق التقريب يُضاف لآخر قسط. |
| BR-Q07 | `Accepted` ⟶ الصفقة `Won` + إنشاء/ربط Client + اقتراح Contract و Project من قالب الخدمة. |
| BR-Q08 | الكوتيشن تنتهي تلقائيًا (`Expired`) بعد `expiryDate` عبر الـ Worker. |

## 4. العقود

| القاعدة | التطبيق |
| --- | --- |
| BR-C01 | الترقيم `BP-C-YYYY-0001`. |
| BR-C02 | `Active` يتطلب تاريخ بداية ونهاية وقيمة وعملة. |
| BR-C03 | تنبيهات التجديد قبل `renewalDate` بـ 30/14/7/1 يوم (قابلة للتخصيص لكل عقد). |
| BR-C04 | العقد الذي تبقّى عليه أقل من 30 يومًا ينتقل لحالة `Expiring Soon` تلقائيًا. |
| BR-C05 | `autoRenew` ينشئ عقدًا جديدًا مسودة عند الانتهاء بدل تمديد القديم (حفاظًا على التاريخ). |

## 5. المشاريع والتاسكات

| القاعدة | التطبيق |
| --- | --- |
| BR-P01 | إنشاء مشروع من `ProjectTemplate` ينشئ التاسكات والـ Subtasks والاعتماديات وتواريخ الاستحقاق النسبية من تاريخ البداية. |
| BR-P02 | `progressPercent` يُحسب حسب `progressMode`: `TASKS` (نسبة التاسكات المكتملة)، `DELIVERABLES`، أو `MANUAL`. |
| BR-P03 | المشروع `At Risk` إذا: تاريخ الانتهاء خلال 7 أيام والتقدم < 70%، أو وجود تاسك متأخر > 3 أيام، أو انتظار العميل > 5 أيام. |
| BR-T01 | لا يمكن إغلاق تاسك عليه عناصر Checklist إلزامية غير مكتملة. |
| BR-T02 | لا يمكن بدء تاسك تعتمد على تاسك غير مكتملة (تُعرض `Blocked`). |
| BR-T03 | التأخير يُصنَّف: `INTERNAL_DELAY` / `CLIENT_WAITING` / `APPROVED_EXTENSION` / `BLOCKED` / `OVERDUE_NO_REASON` — والتقارير تفصل بينها. |
| BR-T04 | الوقت المنتظَر عند العميل يُحتسب من `waitingSince` عند الدخول لحالة `Waiting for Client`. |
| BR-T05 | التاسكات المتكررة تُولَّد بواسطة الـ Worker وليس عند فتح الصفحة. |

## 6. المراجعة والاعتماد

```
Execution → Internal Review → Internal Revisions → Internal Approval
          → Client Review → Client Revisions → Final Approval → Delivered
```

| القاعدة | التطبيق |
| --- | --- |
| BR-A01 | كل `RevisionRequest` يحمل المصدر (INTERNAL/CLIENT) والوصف والمُسنَد إليه وتاريخ الاستحقاق والنسخة المرتبطة. |
| BR-A02 | لا يُستبدل أي ملف — كل رفع ينشئ `FileObject` بإصدار جديد، والنسخة المعتمدة تُعلَّم `approvedVersionId`. |
| BR-A03 | `Final Approval` يسجّل المعتمِد والتاريخ ويقفل التعديل على النسخة. |
| BR-A04 | عدّاد التعديلات يُخزَّن ويُصنَّف حسب المصدر لتقارير جودة التنفيذ. |

## 7. الفواتير والمدفوعات

| القاعدة | التطبيق |
| --- | --- |
| BR-I01 | الترقيم `BP-INV-YYYY-0001`. |
| BR-I02 | `paidAmount` مشتق من مجموع المدفوعات المرتبطة، ولا يُدخل يدويًا. |
| BR-I03 | الحالة تُحسب: `paid=0` → Sent، `0 < paid < total` → Partially Paid، `paid ≥ total` → Paid، وبعد `dueDate` بدون سداد كامل → Overdue. |
| BR-I04 | لا يُقبل دفع بمبلغ يتجاوز المتبقي إلا بصلاحية `payments.edit` + تسجيل ملاحظة. |
| BR-I05 | لا يمكن حذف فاتورة عليها مدفوعات — تُلغى (`Cancelled`) مع سبب. |
| BR-I06 | ربحية المشروع = `الإيراد المعترف به − المصروفات المباشرة`، والرواتب/التكاليف غير المباشرة اختيارية عبر إعداد `finance.includeIndirectCosts`. |

## 8. الإشعارات

| القاعدة | التطبيق |
| --- | --- |
| BR-N01 | كل إشعار له `dedupeKey` فريد يمنع التكرار (نوع + كيان + نافذة زمنية). |
| BR-N02 | الإشعارات المجدولة تعمل من الـ Worker كل 5 دقائق، ولا تعتمد على فتح المتصفح. |
| BR-N03 | كل إشعار يحمل رابطًا مباشرًا للكيان المرتبط. |
| BR-N04 | تفضيلات المستخدم تُحترم لكل نوع وقناة، والإشعارات الأمنية (تعطيل الحساب/تغيير الصلاحيات) لا يمكن إيقافها. |

## 9. الحوكمة

| القاعدة | التطبيق |
| --- | --- |
| BR-G01 | الحذف افتراضيًا Soft Delete، والحذف النهائي (`purge`) لـ `SUPER_ADMIN` فقط بتأكيد نصي. |
| BR-G02 | `AuditLog` append-only على مستوى قاعدة البيانات. |
| BR-G03 | كل تصدير يُسجَّل (من، ماذا، كم سجلًا). |
| BR-G04 | تغيير سعر أو خصم أو صلاحية يُسجَّل بالقيمة القديمة والجديدة. |

-- تقييد رؤية الأرقام المالية على ثلاثة أدوار فقط: FINANCE و SUPER_ADMIN
-- و OPERATIONS_MANAGER (أقرب دور موجود لـ«المدير الإداري» — لا يوجد دور منفصل
-- بهذا الاسم في النظام، ولم يُنشأ دور جديد لأن OPERATIONS_MANAGER يطابق الغرض
-- تمامًا). لا يُعاد بذر الأدوار الموجودة مسبقًا تلقائيًا (seedRoles تتخطى أي
-- دور له صلاحيات مزروعة بالفعل) فالتعديل هنا مباشر على قاعدة البيانات، بموازاة
-- تحديث DEFAULT_ROLE_PERMISSIONS في src/server/auth/permissions.ts.

-- قيمة أي صفقة أو عقد (deals.view_financial / contracts.view_financial) —
-- تُخفى الآن حتى عن صاحب الصفقة نفسه إن لم يكن أحد الأدوار الثلاثة.
DELETE FROM role_permissions
WHERE module IN ('deals', 'contracts')
  AND action = 'view_financial'
  AND "roleId" IN (
    SELECT id FROM roles WHERE key IN ('SALES_MANAGER', 'SALES_AGENT', 'ACCOUNT_MANAGER')
  );

-- قسم المالية بالكامل (فواتير/مدفوعات) لم يعد متاحًا لمدير المبيعات أو مدير
-- حسابات العملاء إطلاقًا — لا مجرد إخفاء الأرقام، بل إغلاق الصفحة نفسها.
DELETE FROM role_permissions
WHERE module = 'invoices'
  AND "roleId" IN (SELECT id FROM roles WHERE key IN ('SALES_MANAGER', 'ACCOUNT_MANAGER'));

DELETE FROM role_permissions
WHERE module = 'payments'
  AND "roleId" IN (SELECT id FROM roles WHERE key = 'ACCOUNT_MANAGER');

-- تبويب التقارير المالية داخل صفحة التقارير — يبقى تبويب المبيعات (بدون
-- أرقام مالية) متاحًا لمدير المبيعات كالمعتاد.
DELETE FROM role_permissions
WHERE module = 'reports'
  AND action = 'view_financial'
  AND "roleId" IN (SELECT id FROM roles WHERE key = 'SALES_MANAGER');

-- المصروفات كانت مطلوبة لدور ميديا باير لتسجيل إنفاق الإعلانات (OWN scope)،
-- لكن بند «قسم المالية بالكامل» في الطلب لا يستثني أي دور. أُزيلت بالكامل —
-- لم تعد صفحة /expenses متاحة لهذا الدور، وهذا يعني توقّف قدرتهم على تسجيل
-- المصروفات مباشرة عبر النظام حتى يُبنى مسار بديل غير مالي إن لزم.
DELETE FROM role_permissions
WHERE module = 'expenses'
  AND "roleId" IN (SELECT id FROM roles WHERE key = 'MEDIA_BUYER');

-- استكمال صلاحيات OPERATIONS_MANAGER كأحد الأدوار الثلاثة المصرَّح لها —
-- كانت تنقصه رؤية تبويب المالية في التقارير، ورؤية إجمالي التحصيلات في صفحة
-- العميل، ورؤية أرصدة إعلانات العملاء، رغم كونه من المفترض أن يرى كل شيء مالي.
INSERT INTO role_permissions ("id", "roleId", "module", "action", "scope")
SELECT gen_random_uuid()::text, r."id", 'reports', a.action, 'ALL'
FROM roles r, (VALUES ('view_financial'), ('view_cost_profit')) AS a(action)
WHERE r."key" = 'OPERATIONS_MANAGER'
ON CONFLICT ("roleId", "module", "action") DO NOTHING;

INSERT INTO role_permissions ("id", "roleId", "module", "action", "scope")
SELECT gen_random_uuid()::text, r."id", 'clients', 'view_financial', 'ALL'
FROM roles r
WHERE r."key" = 'OPERATIONS_MANAGER'
ON CONFLICT ("roleId", "module", "action") DO NOTHING;

INSERT INTO role_permissions ("id", "roleId", "module", "action", "scope")
SELECT gen_random_uuid()::text, r."id", 'ad_wallets', 'view', 'ALL'
FROM roles r
WHERE r."key" = 'OPERATIONS_MANAGER'
ON CONFLICT ("roleId", "module", "action") DO NOTHING;

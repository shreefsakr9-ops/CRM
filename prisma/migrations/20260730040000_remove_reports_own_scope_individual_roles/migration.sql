-- إزالة صلاحية reports.view بنطاق OWN من أدوار المنفذين الفرديين
-- (CONTENT_CREATOR, GRAPHIC_DESIGNER, VIDEO_EDITOR, MEDIA_BUYER, SALES_AGENT).
--
-- كانت هذه الصلاحية بلا فائدة فعلية: لا توجد أي دالة في reports.ts تُصفّي
-- بنطاق OWN («سجلاتي فقط») — كل دوال التقارير (المبيعات، العمليات، المالية،
-- التسويق) محسوبة على مستوى الشركة/الفريق كاملة بلا استثناء. أثرها الوحيد
-- كان فتح صفحة /reports كاملة (وإظهار رابطها في القائمة الجانبية) لأدوار
-- تنفيذية لا يخصها الاطلاع على أرقام الشركة أو الفريق ككل — وهو الخلل المُصلَح
-- هنا بحذف المنح من قاعدة البيانات مباشرة، إذ لا يُعاد بذر الأدوار الموجودة
-- مسبقًا تلقائيًا (seedRoles تتخطى أي دور له صلاحيات مزروعة بالفعل).
DELETE FROM role_permissions
WHERE module = 'reports'
  AND action = 'view'
  AND scope = 'OWN'
  AND "roleId" IN (
    SELECT id FROM roles
    WHERE key IN ('CONTENT_CREATOR', 'GRAPHIC_DESIGNER', 'VIDEO_EDITOR', 'MEDIA_BUYER', 'SALES_AGENT')
  );

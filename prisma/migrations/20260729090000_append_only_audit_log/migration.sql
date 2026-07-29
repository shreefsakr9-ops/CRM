-- سجل التدقيق: إضافة فقط، مفروضة من قاعدة البيانات لا بالاتفاق.
--
-- كان المنع اصطلاحًا في طبقة الخدمة فقط: لا يوجد كود يعدّل أو يحذف من السجل،
-- لكن لا شيء يمنع ذلك فعلًا — خطأ برمجي أو وصول مباشر لقاعدة البيانات كان
-- كافيًا لطمس الأثر. المشغّل هنا يفرض القاعدة بغض النظر عن الدور المتصل،
-- بما في ذلك مالك الجداول (بخلاف سياسات RLS التي يتجاوزها المالك افتراضيًا).
--
-- الحذف المشروع الوحيد هو التقادم (retention) وهو غير مبني بعد؛ حين يُبنى
-- يجب أن يمر بإجراء صريح يعطّل المشغّل مؤقتًا ويُسجَّل خارج قاعدة البيانات.

CREATE OR REPLACE FUNCTION bp_audit_log_is_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'audit_logs is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS bp_audit_log_no_update ON "audit_logs";
CREATE TRIGGER bp_audit_log_no_update
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION bp_audit_log_is_append_only();

DROP TRIGGER IF EXISTS bp_audit_log_no_delete ON "audit_logs";
CREATE TRIGGER bp_audit_log_no_delete
  BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION bp_audit_log_is_append_only();

-- TRUNCATE يتجاوز مشغّلات الصفوف، فيحتاج مشغّلًا على مستوى الجملة.
DROP TRIGGER IF EXISTS bp_audit_log_no_truncate ON "audit_logs";
CREATE TRIGGER bp_audit_log_no_truncate
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION bp_audit_log_is_append_only();

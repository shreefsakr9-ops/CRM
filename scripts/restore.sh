#!/bin/sh
# Blue Point OS — استعادة من نسخة احتياطية
#
#   ./restore.sh /backups/db-20260728-020000.dump
#   ./restore.sh /backups/db-20260728-020000.dump.enc     (سيطلب عبارة المرور)
#
# ⚠ تحذير: الاستعادة تستبدل محتوى قاعدة البيانات الحالية بالكامل.
#   لا تُشغَّل على الإنتاج إلا بعد أخذ نسخة احتياطية جديدة أولًا وإيقاف التطبيق.

set -eu

DUMP="${1:-}"
[ -n "$DUMP" ] || { echo "الاستخدام: $0 <ملف-النسخة>"; exit 1; }
[ -f "$DUMP" ] || { echo "✖ الملف غير موجود: $DUMP"; exit 1; }

: "${PGHOST:?PGHOST مطلوب}"
: "${PGUSER:?PGUSER مطلوب}"
: "${PGDATABASE:?PGDATABASE مطلوب}"

echo "▶ سيتم استعادة قاعدة البيانات '$PGDATABASE' على '$PGHOST' من:"
echo "  $DUMP"
echo ""
echo "⚠ هذا الإجراء يستبدل البيانات الحالية ولا يمكن التراجع عنه."
printf "اكتب اسم قاعدة البيانات للتأكيد: "
read -r CONFIRM
[ "$CONFIRM" = "$PGDATABASE" ] || { echo "✖ إلغاء — لم يتم التأكيد"; exit 1; }

WORK="$DUMP"
CLEANUP=""

# فك التشفير عند الحاجة
case "$DUMP" in
  *.enc)
    [ -n "${BACKUP_PASSPHRASE:-}" ] || { echo "✖ BACKUP_PASSPHRASE مطلوب لفك التشفير"; exit 1; }
    WORK="/tmp/restore-$$.dump"
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
      -in "$DUMP" -out "$WORK" -pass env:BACKUP_PASSPHRASE
    CLEANUP="$WORK"
    echo "✓ تم فك التشفير"
    ;;
esac

echo "▶ جارٍ الاستعادة…"
# --clean --if-exists يحذف الكائنات القديمة قبل الاستعادة
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="$PGDATABASE" "$WORK"

[ -n "$CLEANUP" ] && rm -f "$CLEANUP"

echo "✔ اكتملت الاستعادة"
echo ""
echo "الخطوات التالية:"
echo "  1. شغّل المايجريشن للتأكد من تطابق المخطط: npx prisma migrate deploy"
echo "  2. استعد المرفقات: tar -xzf files-<stamp>.tar.gz -C /"
echo "  3. أعد تشغيل التطبيق والـ worker"
echo "  4. سجّل الدخول وتحقق من آخر السجلات في /audit"

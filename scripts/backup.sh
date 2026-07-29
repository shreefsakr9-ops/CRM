#!/bin/sh
# Blue Point OS — نسخة احتياطية لقاعدة البيانات والملفات
# تُشغَّل داخل حاوية backup أو من cron على المضيف.
#
#   ./backup.sh            نسخة كاملة (قاعدة بيانات + ملفات)
#
# المتغيرات المطلوبة: PGHOST PGUSER PGPASSWORD PGDATABASE
# اختيارية: BACKUP_DIR STORAGE_DIR BACKUP_RETENTION_DAYS BACKUP_PASSPHRASE

set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
STORAGE_DIR="${STORAGE_DIR:-/app/storage}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
DB_FILE="$BACKUP_DIR/db-$STAMP.dump"
FILES_FILE="$BACKUP_DIR/files-$STAMP.tar.gz"
LOG_FILE="$BACKUP_DIR/backup.log"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE"; }
fail() {
  log "✖ فشل النسخ الاحتياطي: $*"
  # ملف علامة يلتقطه الـ Worker/المراقبة لإرسال تنبيه
  echo "$STAMP $*" >> "$BACKUP_DIR/FAILED"
  exit 1
}

mkdir -p "$BACKUP_DIR"
log "▶ بدء النسخ الاحتياطي"

# ── قاعدة البيانات (صيغة custom تدعم الاستعادة الانتقائية) ──
pg_dump --format=custom --compress=9 --file="$DB_FILE" || fail "pg_dump"
log "✓ قاعدة البيانات: $(basename "$DB_FILE") ($(du -h "$DB_FILE" | cut -f1))"

# ── التحقق من سلامة النسخة (قبل التشفير عمدًا) ──
# لازم قبل التشفير لا بعده: التشفير يحذف ملف pg_dump الأصلي (rm -f أدناه)،
# وpg_restore --list لا يقرأ أصلًا ملفًا مشفَّرًا بـopenssl. التحقق بعد التشفير
# كان يتخطّى نفسه بصمت في كل نسخة مشفَّرة، فيتحوّل الفحص «الحقيقي» إلى مجرد
# فحص أن الملف غير فارغ — وهذا الفحص يفشل على ملف تالف فعلًا لا مجرد فحص حجم.
pg_restore --list "$DB_FILE" > /dev/null 2>&1 || fail "النسخة تالفة (pg_restore --list)"
log "✓ تم التحقق من سلامة النسخة"

# ── الملفات والمرفقات ──
if [ -d "$STORAGE_DIR" ]; then
  tar -czf "$FILES_FILE" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")" \
    || fail "أرشفة الملفات"
  log "✓ المرفقات: $(basename "$FILES_FILE") ($(du -h "$FILES_FILE" | cut -f1))"
else
  log "• لا يوجد مجلد مرفقات — تم التخطي"
fi

# ── التشفير (إن وُجدت عبارة مرور) ──
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  if command -v openssl >/dev/null 2>&1; then
    for f in "$DB_FILE" "$FILES_FILE"; do
      [ -f "$f" ] || continue
      openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
        -in "$f" -out "$f.enc" -pass env:BACKUP_PASSPHRASE || fail "تشفير $f"
      rm -f "$f"
    done
    log "✓ تم تشفير النسخ (AES-256)"
  else
    log "⚠ openssl غير متاح — النسخ غير مشفرة"
  fi
fi

# ── فحص أخير: الملف النهائي (مشفَّرًا كان أو لا) غير فارغ ──
VERIFY_TARGET="$DB_FILE"
[ -f "$DB_FILE.enc" ] && VERIFY_TARGET="$DB_FILE.enc"
[ -s "$VERIFY_TARGET" ] || fail "ملف النسخة فارغ بعد التشفير"

# ── حذف النسخ القديمة ──
find "$BACKUP_DIR" -name 'db-*' -type f -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name 'files-*' -type f -mtime "+$RETENTION_DAYS" -delete
log "✓ تم حذف النسخ الأقدم من $RETENTION_DAYS يومًا"

rm -f "$BACKUP_DIR/FAILED"
log "✔ اكتمل النسخ الاحتياطي بنجاح"

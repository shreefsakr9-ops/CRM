# النسخ الاحتياطي والاستعادة

> **قاعدة أساسية:** نسخة السيرفر (Boot Volume Backup) ليست بديلًا عن نسخة قاعدة البيانات.
> نسخة السيرفر تحميك من فشل الجهاز، لكنها لا تحميك من حذف بيانات خاطئ أو تلف منطقي.

## 1. ماذا يُنسخ

| العنصر | الأداة | التكرار |
| --- | --- | --- |
| قاعدة البيانات كاملة | `pg_dump --format=custom` | يوميًا 02:00 UTC |
| الملفات والمرفقات | `tar.gz` لمجلد `storage` | يوميًا مع قاعدة البيانات |
| الأسرار (`.env.production`) | يدويًا في مدير كلمات مرور | عند كل تغيير |

الملفات المولَّدة في `/backups` داخل حاوية `backup` (volume باسم `backups`):

```
db-20260728-020000.dump[.enc]
files-20260728-020000.tar.gz[.enc]
backup.log
FAILED                      ← يُنشأ فقط عند الفشل
```

## 2. التشغيل التلقائي

خدمة `backup` في `docker-compose.yml` تعمل تلقائيًا: نسخة فورية عند الإقلاع ثم يوميًا 02:00 UTC.

```bash
docker compose logs -f backup                        # متابعة
docker compose exec backup sh /scripts/backup.sh     # نسخة فورية يدوية
docker compose exec backup cat /backups/backup.log   # السجل
docker compose exec backup ls -lh /backups           # النسخ المتاحة
```

## 3. التشفير

عند ضبط `BACKUP_PASSPHRASE` تُشفَّر كل النسخ بـ AES-256-CBC مع `PBKDF2` (200 ألف تكرار).

```bash
BACKUP_PASSPHRASE=$(openssl rand -base64 32)   # في .env.production
```

> إن فقدت عبارة المرور فقدت النسخ نهائيًا. احفظها في مدير كلمات مرور منفصل عن السيرفر.

## 4. النسخ خارج السيرفر (إلزامي)

النسخة الموجودة على نفس السيرفر لا تحميك من فقدان السيرفر. انسخها لمكان آخر:

### إلى Oracle Object Storage

```bash
# على المضيف — بعد تثبيت oci-cli وإعداد المصادقة
docker cp $(docker compose ps -q backup):/backups /tmp/bp-backups
oci os object bulk-upload -bn bluepoint-backups --src-dir /tmp/bp-backups --overwrite
rm -rf /tmp/bp-backups
```

### إلى خادم آخر عبر rsync

```bash
0 4 * * * docker cp $(docker compose -f /home/ubuntu/bluepoint-os/docker-compose.yml ps -q backup):/backups /tmp/bp && \
          rsync -az --delete /tmp/bp/ backup@backup-host:/srv/bluepoint/ && rm -rf /tmp/bp
```

## 5. الاستعادة

### الخطوات

```bash
# 1) أوقف التطبيق والـ worker (قاعدة البيانات تبقى تعمل)
docker compose stop app worker

# 2) خذ نسخة أمان من الحالة الراهنة قبل الاستبدال
docker compose exec backup sh /scripts/backup.sh

# 3) استعد قاعدة البيانات (سيطلب تأكيدًا نصيًا باسم القاعدة)
docker compose exec -e BACKUP_PASSPHRASE="$BACKUP_PASSPHRASE" backup \
  sh /scripts/restore.sh /backups/db-20260728-020000.dump

# 4) استعد المرفقات
docker compose exec backup tar -xzf /backups/files-20260728-020000.tar.gz -C /

# 5) طابق المخطط ثم أعد التشغيل
docker compose run --rm migrate
docker compose start app worker

# 6) تحقق
curl -s https://<domain>/api/health
```

ثم سجّل الدخول وافتح `/audit` للتأكد من أن آخر السجلات تعود للتاريخ المتوقع.

### زمن الاستعادة المتوقع

| حجم قاعدة البيانات | الزمن التقريبي |
| --- | --- |
| أقل من 100 MB | أقل من دقيقة |
| 1 GB | 2–5 دقائق |
| 10 GB | 15–30 دقيقة |

## 6. اختبار الاستعادة (لا تتخطَّ هذه الخطوة)

**نسخة احتياطية لم تُختبَر استعادتها ليست نسخة احتياطية.** اختبرها شهريًا على قاعدة بيانات منفصلة:

```bash
# قاعدة اختبار مؤقتة داخل نفس حاوية postgres
docker compose exec db createdb -U bluepoint restore_test

docker compose exec -e PGDATABASE=restore_test backup \
  pg_restore --clean --if-exists --no-owner --dbname=restore_test /backups/db-<stamp>.dump

# تحقق من العدّادات
docker compose exec db psql -U bluepoint -d restore_test -c \
  "SELECT 'clients' t, count(*) FROM clients
   UNION ALL SELECT 'invoices', count(*) FROM invoices
   UNION ALL SELECT 'projects', count(*) FROM projects
   UNION ALL SELECT 'audit', count(*) FROM audit_logs;"

# نظّف
docker compose exec db dropdb -U bluepoint restore_test
```

سجّل نتيجة الاختبار (التاريخ، النسخة المستخدمة، الأعداد) في مكان مشترك مع الفريق.

## 7. التحقق التلقائي والتنبيه عند الفشل

سكربت النسخ يفحص كل نسخة بـ `pg_restore --list` — وهو فحص حقيقي للسلامة وليس مجرد فحص للحجم. عند الفشل:

1. يكتب السبب في `/backups/backup.log`.
2. ينشئ ملف `/backups/FAILED`.

لربط ذلك بتنبيه خارجي:

```bash
# cron على المضيف كل ساعة
0 * * * * docker compose -f /home/ubuntu/bluepoint-os/docker-compose.yml exec -T backup \
  test -f /backups/FAILED && curl -fsS -X POST "$ALERT_WEBHOOK" \
  -d "فشل النسخ الاحتياطي لنظام Blue Point OS — راجع /backups/backup.log"
```

## 8. سياسة الاحتفاظ

الافتراضي 30 يومًا (`BACKUP_RETENTION_DAYS`). للأرشيف طويل المدى احتفظ يدويًا بنسخة شهرية خارج السيرفر لمدة سنة على الأقل — خصوصًا نسخة نهاية كل سنة مالية.

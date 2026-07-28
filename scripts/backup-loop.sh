#!/bin/sh
# حلقة النسخ الاحتياطي اليومي داخل حاوية backup.
# تعمل عند الساعة 02:00 UTC يوميًا، وتنفّذ نسخة فورية عند أول تشغيل.

set -eu

echo "▶ خدمة النسخ الاحتياطي — أول نسخة الآن ثم يوميًا 02:00 UTC"
sh /scripts/backup.sh || echo "⚠ فشلت النسخة الأولى — سيُعاد المحاولة في الموعد التالي"

while true; do
  NOW_SEC=$(date -u +%s)
  # الثواني المتبقية حتى الساعة 02:00 UTC القادمة
  TODAY_2AM=$(date -u -d "$(date -u +%Y-%m-%d) 02:00:00" +%s 2>/dev/null || echo "")
  if [ -z "$TODAY_2AM" ]; then
    # busybox date لا يدعم -d — ننام 24 ساعة بدلًا من ذلك
    sleep 86400
  else
    if [ "$NOW_SEC" -ge "$TODAY_2AM" ]; then
      TARGET=$((TODAY_2AM + 86400))
    else
      TARGET="$TODAY_2AM"
    fi
    sleep $((TARGET - NOW_SEC))
  fi
  sh /scripts/backup.sh || echo "⚠ فشلت النسخة — راجع /backups/backup.log"
done

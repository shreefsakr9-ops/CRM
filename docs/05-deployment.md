# النشر على Oracle Cloud

## 1. تجهيز السيرفر

### إنشاء الـ Instance

| العنصر | التوصية |
| --- | --- |
| Shape | `VM.Standard.A1.Flex` (Ampere ARM64) — 2 OCPU / 12 GB RAM ضمن Always Free |
| البديل | `VM.Standard.E2.1.Micro` (AMD64) إذا لم تتوفر Ampere |
| النظام | Ubuntu 22.04 أو 24.04 |
| القرص | 100 GB (Boot Volume) |
| SSH | مفتاح SSH فقط — لا تفعّل الدخول بكلمة مرور |

> الصور المستخدمة (`node:22-bookworm-slim`, `postgres:16-alpine`, `caddy:2-alpine`) كلها تدعم `arm64` و`amd64`، وكذلك حزمة `chromium` من Debian. لا حاجة لخطة بديلة.

### فتح المنافذ

**في Oracle Cloud Console** → VCN → Security List → Ingress Rules:

| المصدر | المنفذ | الغرض |
| --- | --- | --- |
| `0.0.0.0/0` | 80 | إعادة توجيه HTTP + تحدي Let's Encrypt |
| `0.0.0.0/0` | 443 | HTTPS |
| `<IP مكتبك>/32` | 22 | SSH — قيّده بعنوانك ولا تفتحه للعالم |

**داخل السيرفر** (Oracle تضيف قواعد iptables افتراضية تحجب كل شيء):

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# منفذ PostgreSQL (5432) لا يُفتح إطلاقًا — قاعدة البيانات على شبكة Docker داخلية.
```

### تأمين SSH

```bash
sudo sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

### تثبيت Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker compose version    # للتأكد
```

---

## 2. النطاق (Domain)

وجّه سجل `A` من نطاقك إلى IP العام للـ Instance:

```
crm.bluepoint.example.  A  <PUBLIC_IP>
```

Caddy يستخرج شهادة Let's Encrypt تلقائيًا عند أول تشغيل — لا حاجة لأي إعداد يدوي للشهادات.

---

## 3. الإعدادات

```bash
git clone <repo-url> bluepoint-os
cd bluepoint-os
cp .env.example .env.production
```

عدّل `.env.production`:

```bash
DOMAIN=crm.bluepoint.example
APP_URL=https://crm.bluepoint.example

POSTGRES_DB=bluepoint
POSTGRES_USER=bluepoint
POSTGRES_PASSWORD=$(openssl rand -base64 32)
DATABASE_URL=postgresql://bluepoint:<نفس-كلمة-المرور>@db:5432/bluepoint?schema=public

SESSION_SECRET=$(openssl rand -base64 48)
FILE_SIGNING_SECRET=$(openssl rand -base64 48)
BACKUP_PASSPHRASE=$(openssl rand -base64 32)

SEED_ADMIN_EMAIL=admin@bluepoint.example
SEED_ADMIN_PASSWORD=<كلمة مرور قوية — ستُطلب للتغيير عند أول دخول>
SEED_DEMO_DATA=false        # ⚠ إلزامي في الإنتاج

# البريد — اتركه فارغًا لتشغيل النظام بدون بريد إطلاقًا
SMTP_HOST=smtp.example.com
SMTP_PORT=587               # 465 = TLS ضمني، 587 = STARTTLS إجباري
SMTP_USER=no-reply@bluepoint.example
SMTP_PASSWORD=<كلمة مرور حساب الإرسال>
SMTP_FROM=Blue Point OS <no-reply@bluepoint.example>
```

> إعدادات SMTP تُقرأ من البيئة عند الإقلاع فقط، ويحتاجها **التطبيق والـWorker معًا**
> (الـWorker هو من يرسل الملخصات اليومية والأسبوعية). بعد أي تعديل:
> `docker compose --env-file .env.production up -d app worker`.
> اضبط سجلات **SPF وDKIM** لنطاق المُرسِل وإلا صُنّفت الرسائل كبريد مزعج.
> بعد الإطلاق تحقق من `/settings` ← **البريد الإلكتروني** ← «اختبار الاتصال» ثم «إرسال رسالة تجريبية».

```bash
chmod 600 .env.production
```

> **لا ترفع `.env.production` إلى Git إطلاقًا.** احتفظ بنسخة من الأسرار في مدير كلمات مرور.

---

## 4. الإطلاق

```bash
docker compose --env-file .env.production up -d --build

docker compose ps                  # كل الخدمات Up/Healthy
docker compose logs -f app         # متابعة السجلات
```

الترتيب التلقائي: `db` → `migrate` (يطبّق المايجريشن ثم يخرج) → `app` + `worker` → `caddy`.

### التهيئة الأولى

```bash
docker compose exec app npx tsx --conditions=react-server prisma/seed.ts
```

يزرع الأدوار والصلاحيات والبيانات المرجعية وحساب المسؤول فقط (بدون بيانات تجريبية لأن `SEED_DEMO_DATA=false`).

### التحقق

```bash
curl -I https://crm.bluepoint.example              # 200 + شهادة صالحة
curl -s https://crm.bluepoint.example/api/health   # {"status":"ok","db":"up"}
```

ثم سجّل الدخول بحساب المسؤول — سيُطلب منك تغيير كلمة المرور فورًا.

---

## 5. التحديثات

```bash
cd bluepoint-os
git pull
docker compose --env-file .env.production up -d --build
```

المايجريشن تُطبَّق تلقائيًا عبر خدمة `migrate` قبل تشغيل التطبيق.

### التراجع (Rollback)

```bash
# 1) نسخة احتياطية فورية قبل أي شيء
docker compose exec backup sh /scripts/backup.sh

# 2) الرجوع لإصدار سابق
git checkout <previous-tag>
docker compose --env-file .env.production up -d --build

# 3) إذا كان الإصدار الجديد أضاف مايجريشن غير متوافقة
#    استعد قاعدة البيانات من النسخة التي أخذتها قبل الترقية:
docker compose exec backup sh /scripts/restore.sh /backups/db-<stamp>.dump
```

> لهذا السبب: **خذ نسخة احتياطية قبل كل ترقية** — هي خط التراجع الوحيد المضمون عند تغييرات المخطط.

---

## 6. المراقبة والسجلات

```bash
docker compose logs -f app worker           # سجلات حية
docker compose logs --since 1h app          # آخر ساعة
docker stats                                # استهلاك الموارد

# سجل الوظائف المجدولة من داخل النظام:
#   /audit  →  فلترة على module = settings
# أو من قاعدة البيانات:
docker compose exec db psql -U bluepoint -d bluepoint \
  -c "SELECT key, status, \"itemCount\", \"endedAt\" FROM job_runs ORDER BY \"endedAt\" DESC LIMIT 20;"
```

سجلات الوصول من Caddy: `docker compose exec caddy cat /data/access.log`.

### تدوير السجلات

Docker يدوّر سجلاته افتراضيًا. لضبط حد أقصى أضف إلى `/etc/docker/daemon.json`:

```json
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }
```

ثم `sudo systemctl restart docker`.

---

## 7. الأداء على Always Free

| الإجراء | الفائدة |
| --- | --- |
| `deploy.resources.limits` مضبوطة في compose | تمنع خدمة واحدة من استهلاك كل الذاكرة |
| Caddy يضغط الاستجابات (zstd/gzip) | تقليل استهلاك الشبكة |
| الملفات الثابتة مخزَّنة مؤقتًا سنة كاملة | تقليل الطلبات |
| Chromium يعمل عند توليد PDF فقط | لا يستهلك ذاكرة في وضع الخمول |
| فهارس قاعدة البيانات على الأعمدة المستخدمة في الفلترة | استعلامات سريعة مع نمو البيانات |

إن ظهر ضغط على الذاكرة، فعّل swap:

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

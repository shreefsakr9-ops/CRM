import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  readSmtpConfig,
  isMailEnabled,
  mailStatus,
  maskEmail,
  sendMail,
  verifyMailConnection,
  renderEmail,
  htmlToText,
  appUrl,
} from '@/server/services/mailer';

/**
 * لا يوجد في هذا الملف أي اتصال حقيقي بخادم بريد.
 * كل ما يُختبر هو قراءة الإعدادات، والسلوك عند غيابها، وبناء القالب.
 */

const SMTP_KEYS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'SMTP_FROM',
  'APP_URL',
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(SMTP_KEYS.map((k) => [k, process.env[k]]));
  for (const key of SMTP_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of SMTP_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('قراءة إعدادات SMTP', () => {
  it('يعتبر البريد معطّلًا عند غياب المضيف', () => {
    expect(readSmtpConfig()).toBeNull();
    expect(isMailEnabled()).toBe(false);
    expect(mailStatus()).toEqual({ enabled: false });
  });

  it('المضيف الفارغ أو المسافات لا يفعّل البريد', () => {
    process.env.SMTP_HOST = '   ';
    expect(isMailEnabled()).toBe(false);
  });

  it('يستنتج TLS الضمني من المنفذ 465', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '465';
    expect(readSmtpConfig()?.secure).toBe(true);
  });

  it('المنفذ 587 يبدأ غير مشفّر ثم يرقّى بـ STARTTLS', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';
    expect(readSmtpConfig()?.secure).toBe(false);
  });

  it('SMTP_SECURE يتجاوز الاستنتاج من المنفذ', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '465';
    process.env.SMTP_SECURE = 'false';
    expect(readSmtpConfig()?.secure).toBe(false);
  });

  it('المنفذ الافتراضي 587 عند غيابه', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    expect(readSmtpConfig()?.port).toBe(587);
  });

  it('حالة العرض لا تكشف اسم المستخدم ولا كلمة المرور', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'ops@bluepoint.local';
    process.env.SMTP_PASSWORD = 'super-secret-value';
    const status = mailStatus();
    expect(status.authenticated).toBe(true);
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain('super-secret-value');
    expect(serialized).not.toContain('ops@bluepoint.local');
  });

  it('يميّز الخادم بلا مصادقة', () => {
    process.env.SMTP_HOST = 'localhost';
    expect(mailStatus().authenticated).toBe(false);
  });
});

describe('التعطيل الآمن', () => {
  it('الإرسال بدون إعدادات يُتخطّى ولا يرمي خطأ', async () => {
    const result = await sendMail({ to: 'a@b.com', subject: 'س', html: '<p>ن</p>' });
    expect(result.status).toBe('skipped');
  });

  it('اختبار الاتصال بدون إعدادات يُتخطّى ولا يرمي خطأ', async () => {
    const result = await verifyMailConnection();
    expect(result.status).toBe('skipped');
  });
});

describe('إخفاء البريد في السجلات', () => {
  it('يُبقي أول حرفين والنطاق فقط', () => {
    expect(maskEmail('mohamed@bluepoint.local')).toBe('mo*****@bluepoint.local');
  });

  it('يخفي أيضًا الأسماء القصيرة جدًا', () => {
    expect(maskEmail('a@b.com')).toBe('a*@b.com');
  });
});

describe('النسخة النصية', () => {
  it('يزيل الوسوم والمسافات البادئة ويحافظ على الأسطر', () => {
    const text = htmlToText('<div>\n  <h1>عنوان</h1>\n  <p>سطر أول</p>\n  <p>سطر ثانٍ</p>\n</div>');
    // سطر فارغ واحد بين الفقرات مقبول — المهم ألا تبقى مسافات بادئة ولا وسوم.
    expect(text).toBe('عنوان\n\nسطر أول\n\nسطر ثانٍ');
  });

  it('يتجاهل محتوى style ويفكّ ترميز الرموز', () => {
    expect(htmlToText('<style>p{color:red}</style><p>أ &amp; ب</p>')).toBe('أ & ب');
  });

  it('النسخة النصية من قالب حقيقي لا تحتوي وسومًا ولا سطورًا فارغة متتالية', async () => {
    const text = htmlToText(
      await renderEmail({ heading: 'ملخص اليوم', intro: 'تنبيهاتك.', blocks: [{ title: 'نوع', value: 'مهمة' }] }),
    );
    expect(text).not.toContain('<');
    expect(text).not.toMatch(/\n{3,}/);
    expect(text).toContain('ملخص اليوم');
  });
});

describe('روابط النظام', () => {
  it('يستخدم APP_URL ولا يكرّر الشرطة المائلة', () => {
    process.env.APP_URL = 'https://os.bluepoint.eg/';
    expect(appUrl('/leads/1')).toBe('https://os.bluepoint.eg/leads/1');
    expect(appUrl('leads/1')).toBe('https://os.bluepoint.eg/leads/1');
  });
});

describe('قالب الرسائل', () => {
  it('يبني رسالة عربية كاملة الاتجاه بدون صور خارجية', async () => {
    const html = await renderEmail({
      heading: 'طلب إعادة تعيين كلمة المرور',
      intro: 'اضغط الزر أدناه.',
      action: { label: 'تعيين كلمة مرور جديدة', url: 'https://os.bluepoint.eg/reset-password?token=t' },
    });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('طلب إعادة تعيين كلمة المرور');
    expect(html).toContain('https://os.bluepoint.eg/reset-password?token=t');
    // لا صور خارجية ولا سكربتات — تمنع التتبع وحجب المحتوى في عملاء البريد.
    expect(html).not.toMatch(/<img\b/i);
    expect(html).not.toMatch(/<script\b/i);
  });

  it('يهرّب محتوى المستخدم فلا يمكن حقن HTML', async () => {
    const html = await renderEmail({
      heading: 'عنوان',
      intro: '<script>alert(1)</script>',
      blocks: [{ title: 'اسم العميل', value: '<b>عميل</b> & شركاه' }],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;عميل&lt;/b&gt; &amp; شركاه');
  });

  it('يعرض الرابط نصًا أيضًا لمن لا يستطيع الضغط على الزر', async () => {
    const url = 'https://os.bluepoint.eg/invoices/9';
    const html = await renderEmail({ heading: 'فاتورة', action: { label: 'فتح', url } });
    // مرة داخل href ومرة كنص ظاهر.
    expect(html.split(url).length - 1).toBeGreaterThanOrEqual(2);
  });
});

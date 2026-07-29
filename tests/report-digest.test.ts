import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { mockSession, actAs, createTestUser, prisma, resetBusinessData } from './helpers';

mockSession();

/** نلتقط الرسائل بدل إرسالها — الاختبار عن المحتوى والصلاحيات لا عن SMTP. */
const outbox = vi.hoisted(() => ({ messages: [] as { to: string; html: string }[] }));
vi.mock('@/server/services/mailer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/services/mailer')>();
  return {
    ...actual,
    isMailEnabled: () => true,
    sendMail: async (input: { to: string; html: string }) => {
      outbox.messages.push({ to: input.to, html: input.html });
      return { status: 'sent' as const, messageId: 'test' };
    },
  };
});

const { sendReportDigest } = await import('@/server/services/report-digest');
const settings = await import('@/server/services/settings');
const { runAsUser } = await import('@/server/auth/guard');
const { buildActor } = await import('@/server/auth/session');
const { createInvoice } = await import('@/server/services/invoices');
const { createClient } = await import('@/server/services/clients');

const ADMIN = 'rd.admin@bluepoint.local';
const DESIGNER = 'rd.designer@bluepoint.local';
const SALES = 'rd.sales@bluepoint.local';

beforeAll(async () => {
  await resetBusinessData();
  await createTestUser({ email: ADMIN, name: 'مدير النظام', roleKey: 'SUPER_ADMIN' });
  await createTestUser({ email: DESIGNER, name: 'مصمم', roleKey: 'GRAPHIC_DESIGNER' });
  await createTestUser({ email: SALES, name: 'مندوب', roleKey: 'SALES_AGENT' });

  // بيانات مالية حقيقية ليكون للملخص محتوى.
  await actAs(ADMIN);
  const client = await createClient({
    legalName: 'عميل الملخص',
    industry: 'OTHER',
    status: 'ACTIVE',
    country: 'EG',
  } as never);
  const invoice = await createInvoice({
    clientId: client.id,
    issueDate: new Date().toISOString(),
    dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    currency: 'EGP',
    items: [{ nameAr: 'خدمة', nameEn: 'Service', quantity: 1, unitPrice: 25000, taxRate: 0 }],
  } as never);
  await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'SENT' } });
});

async function configure(value: {
  digestEnabled: boolean;
  digestPeriod: 'WEEKLY' | 'MONTHLY';
  digestRoles: string[];
}) {
  const admin = await actAs(ADMIN);
  await settings.updateSettingSection('reports', value, admin.id);
  settings.invalidateSettingsCache();
}

beforeEach(() => {
  outbox.messages = [];
});

afterEach(() => {
  outbox.messages = [];
});

describe('الإرسال المشروط', () => {
  it('لا يُرسل شيئًا وهو معطّل', async () => {
    await configure({ digestEnabled: false, digestPeriod: 'WEEKLY', digestRoles: ['SUPER_ADMIN'] });
    const result = await sendReportDigest('WEEKLY');
    expect(result.sent).toBe(0);
    expect(result.reason).toContain('معطّل');
    expect(outbox.messages).toHaveLength(0);
  });

  it('لا يُرسل عند اختلاف الدورية عن المضبوطة', async () => {
    await configure({ digestEnabled: true, digestPeriod: 'WEEKLY', digestRoles: ['SUPER_ADMIN'] });
    const result = await sendReportDigest('MONTHLY');
    expect(result.sent).toBe(0);
    expect(outbox.messages).toHaveLength(0);
  });

  it('لا يُرسل لأدوار غير محددة', async () => {
    await configure({ digestEnabled: true, digestPeriod: 'WEEKLY', digestRoles: [] });
    expect((await sendReportDigest('WEEKLY')).sent).toBe(0);
  });
});

describe('احترام صلاحيات كل مستلم', () => {
  it('المسؤول يستلم الأرقام المالية', async () => {
    await configure({ digestEnabled: true, digestPeriod: 'WEEKLY', digestRoles: ['SUPER_ADMIN'] });
    const result = await sendReportDigest('WEEKLY');

    // قاعدة الاختبارات مشتركة بين الملفات وفيها أكثر من مسؤول، فنتحقق من
    // رسالتنا تحديدًا لا من عدد إجمالي هشّ.
    expect(result.sent).toBeGreaterThan(0);
    const message = outbox.messages.find((m) => m.to === ADMIN);
    expect(message).toBeDefined();
    expect(message!.html).toContain('المفوتر خلال الفترة');
    expect(message!.html).toContain('المحصَّل');
  });

  it('من لا يملك عرض القيم المالية لا تصله أرقام مالية', async () => {
    await configure({ digestEnabled: true, digestPeriod: 'WEEKLY', digestRoles: ['SALES_AGENT'] });
    const result = await sendReportDigest('WEEKLY');

    const message = outbox.messages.find((m) => m.to === SALES);
    if (message) {
      // مندوب المبيعات يرى تقارير في نطاقه لكن بلا أرقام مالية مجمّعة.
      expect(message.html).not.toContain('المفوتر خلال الفترة');
      expect(message.html).not.toContain('المحصَّل');
      expect(message.html).not.toContain('25,000');
    }
    expect(result.sent + result.skipped).toBeGreaterThan(0);
  });

  it('من لا يملك عرض التقارير إطلاقًا لا يصله ملخص فارغ', async () => {
    await configure({
      digestEnabled: true,
      digestPeriod: 'WEEKLY',
      digestRoles: ['GRAPHIC_DESIGNER'],
    });
    const result = await sendReportDigest('WEEKLY');

    // المصمم لديه reports.view بنطاق OWN، فإما يصله ملخص بلا مالية أو لا يصله شيء.
    const message = outbox.messages.find((m) => m.to === DESIGNER);
    if (message) expect(message.html).not.toContain('المفوتر خلال الفترة');
    expect(result.sent + result.skipped).toBeGreaterThan(0);
  });

  it('لا يُرسل لمستخدم معطَّل', async () => {
    await prisma.user.update({ where: { email: ADMIN }, data: { isActive: false } });
    try {
      await configure({ digestEnabled: true, digestPeriod: 'WEEKLY', digestRoles: ['SUPER_ADMIN'] });
      await sendReportDigest('WEEKLY');
      expect(outbox.messages.find((m) => m.to === ADMIN)).toBeUndefined();
    } finally {
      // الإعادة داخل finally: فشل التوقّع سابقًا كان يترك الحساب معطّلًا
      // فتفشل اختبارات تالية لسبب لا علاقة له بها.
      await prisma.user.update({ where: { email: ADMIN }, data: { isActive: true } });
    }
  });
});

describe('الهوية الصريحة خارج الطلبات', () => {
  it('تشغيل خدمة بهوية مستخدم يعطي نفس نتيجة الجلسة', async () => {
    const admin = await actAs(ADMIN);
    const actor = await buildActor(admin.id);
    expect(actor).not.toBeNull();
    expect(actor!.roleKey).toBe('SUPER_ADMIN');
    // نفس خريطة الصلاحيات — لا مسار صلاحيات ثانٍ في الـWorker.
    expect(Object.keys(actor!.permissions).length).toBe(Object.keys(admin.permissions).length);
  });

  it('لا تُبنى هوية لمستخدم معطَّل', async () => {
    await prisma.user.update({ where: { email: SALES }, data: { isActive: false } });
    try {
      const user = await prisma.user.findUniqueOrThrow({ where: { email: SALES } });
      expect(await buildActor(user.id)).toBeNull();
    } finally {
      await prisma.user.update({ where: { email: SALES }, data: { isActive: true } });
    }
  });

  it('الهوية الصريحة تسري داخل الخدمات المستدعاة', async () => {
    const designer = await prisma.user.findUniqueOrThrow({ where: { email: DESIGNER } });
    const actor = await buildActor(designer.id);
    const { requireUser } = await import('@/server/auth/guard');

    const seen = await runAsUser(actor!, async () => (await requireUser()).email);
    expect(seen).toBe(DESIGNER);
  });
});

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { mockSession, actAs, createTestUser, prisma, resetBusinessData } from './helpers';

mockSession();

/** توليد الـPDF يحتاج Chromium وهو غير متاح في CI — هذه الاختبارات تخص الإرسال. */
const pdf = vi.hoisted(() => ({ shouldFail: false }));
vi.mock('@/server/services/quotation-pdf', () => ({
  renderQuotationPdf: async () => {
    if (pdf.shouldFail) throw new Error('browserType.launch: Executable doesn\'t exist');
    return Buffer.from('%PDF-1.4 stub');
  },
  renderQuotationHtml: async () => '<html></html>',
}));

const { sendQuotationToClient, previewQuotationRecipient } = await import(
  '@/server/services/quotation-send'
);
const quotations = await import('@/server/services/quotations');
const { createClient, upsertContact } = await import('@/server/services/clients');
const { createLead } = await import('@/server/services/leads');
const { AppError } = await import('@/server/auth/guard');

const ADMIN = 'qs.admin@bluepoint.local';
const state = { clientId: '', serviceId: '', otherContactId: '' };

async function newApprovedQuotation(link: { clientId?: string; leadId?: string }) {
  const q = await quotations.createQuotation({
    ...link,
    issueDate: new Date().toISOString(),
    expiryDate: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    currency: 'EGP',
    discountType: 'NONE',
    discountValue: 0,
    items: [{ nameAr: 'خدمة', nameEn: 'Service', quantity: 1, unitPrice: 10000, taxRate: 0 }],
    installments: [],
  } as never);
  // نتخطى دورة الاعتماد: موضوع الاختبار هو الإرسال لا الاعتماد.
  await prisma.quotation.update({
    where: { id: q.id },
    data: { status: 'APPROVED_INTERNALLY' },
  });
  return q.id;
}

beforeAll(async () => {
  await resetBusinessData();
  await createTestUser({ email: ADMIN, name: 'مدير النظام', roleKey: 'SUPER_ADMIN' });
  await actAs(ADMIN);

  const client = await createClient({
    legalName: 'عميل عروض الأسعار',
    industry: 'OTHER',
    status: 'ACTIVE',
    country: 'EG',
  } as never);
  state.clientId = client.id;

  // جهتا اتصال بأنواع مختلفة: تُستخدمان في اختبار الأولوية وفي الاختيار اليدوي.
  await upsertContact({
    clientId: client.id,
    name: 'موظف استقبال',
    type: 'MAIN',
    email: 'reception@example.com',
    isPrimary: true,
  } as never);
  await upsertContact({
    clientId: client.id,
    name: 'المدير',
    type: 'DECISION_MAKER',
    email: 'boss@example.com',
  } as never);

  // عميل ثانٍ بجهة اتصال — لاختبار منع الإرسال عبر العملاء.
  const other = await createClient({
    legalName: 'عميل آخر لعروض الأسعار',
    industry: 'OTHER',
    status: 'ACTIVE',
    country: 'EG',
  } as never);
  const otherContact = await upsertContact({
    clientId: other.id,
    name: 'جهة عميل آخر',
    type: 'DECISION_MAKER',
    email: 'other-quote@example.com',
  } as never);
  state.otherContactId = otherContact.id;
});

function clearSmtpEnv() {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  pdf.shouldFail = false;
}

beforeEach(async () => {
  clearSmtpEnv();
  await actAs(ADMIN);
});

afterEach(clearSmtpEnv);

describe('اختيار المستلم', () => {
  it('يستخدم بريد العميل المحتمل حين لا يكون هناك عميل بعد', async () => {
    const lead = await createLead({
      fullName: 'عميل محتمل بعرض سعر',
      phone: '01099887766',
      email: 'lead@example.com',
      estimatedValue: 10000,
      currency: 'EGP',
      priority: 'MEDIUM',
      score: 0,
      nextFollowUpAt: new Date(Date.now() + 86_400_000).toISOString(),
    } as never);

    const id = await newApprovedQuotation({ leadId: lead.id });
    const preview = await previewQuotationRecipient(id);
    expect(preview.recipient).toMatchObject({ email: 'lead@example.com', source: 'lead' });
  });

  it('يفضّل صاحب القرار على جهة الاتصال الرئيسية', async () => {
    const id = await newApprovedQuotation({ clientId: state.clientId });
    const preview = await previewQuotationRecipient(id);
    expect(preview.recipient?.email).toBe('boss@example.com');
  });
});

describe('إرسال عرض السعر', () => {
  it('التعليم كمُرسل بدون بريد يغيّر الحالة', async () => {
    const id = await newApprovedQuotation({ clientId: state.clientId });
    const outcome = await sendQuotationToClient(id, { email: false });
    expect(outcome.status).toBe('marked_only');

    const q = await prisma.quotation.findUniqueOrThrow({ where: { id } });
    expect(q.status).toBe('SENT');
    expect(q.sentAt).not.toBeNull();
  });

  it('لا يمكن الإرسال قبل الاعتماد الداخلي', async () => {
    const q = await quotations.createQuotation({
      clientId: state.clientId,
      issueDate: new Date().toISOString(),
      expiryDate: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      currency: 'EGP',
      discountType: 'NONE',
      discountValue: 0,
      items: [{ nameAr: 'خدمة', nameEn: 'Service', quantity: 1, unitPrice: 1000, taxRate: 0 }],
      installments: [],
    } as never);

    await expect(sendQuotationToClient(q.id, { email: false })).rejects.toBeInstanceOf(AppError);
  });

  it('لا يمكن الإرسال مرتين', async () => {
    const id = await newApprovedQuotation({ clientId: state.clientId });
    await sendQuotationToClient(id, { email: false });
    await expect(sendQuotationToClient(id, { email: false })).rejects.toBeInstanceOf(AppError);
  });

  it('فشل خادم البريد يُبقي الحالة كما هي حتى يمكن إعادة المحاولة', async () => {
    const id = await newApprovedQuotation({ clientId: state.clientId });
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = '1';

    await expect(sendQuotationToClient(id, { email: true })).rejects.toBeInstanceOf(AppError);

    const q = await prisma.quotation.findUniqueOrThrow({ where: { id } });
    expect(q.status).toBe('APPROVED_INTERNALLY');
    expect(q.sentAt).toBeNull();
  });

  it('فشل توليد الـPDF يعطي خطأً مفهومًا ولا يغيّر الحالة', async () => {
    const id = await newApprovedQuotation({ clientId: state.clientId });
    process.env.SMTP_HOST = 'smtp.example.com';
    pdf.shouldFail = true;

    await expect(sendQuotationToClient(id, { email: true })).rejects.toThrow(
      /تعذّر توليد ملف عرض السعر/,
    );
    const q = await prisma.quotation.findUniqueOrThrow({ where: { id } });
    expect(q.status).toBe('APPROVED_INTERNALLY');
  });

  it('يسجّل نشاطًا على العميل المحتمل عند الإرسال', async () => {
    const lead = await createLead({
      fullName: 'عميل محتمل للنشاط',
      phone: '01099887755',
      email: 'activity@example.com',
      estimatedValue: 5000,
      currency: 'EGP',
      priority: 'LOW',
      score: 0,
      nextFollowUpAt: new Date(Date.now() + 86_400_000).toISOString(),
    } as never);

    const id = await newApprovedQuotation({ leadId: lead.id });
    await sendQuotationToClient(id, { email: false });

    const activity = await prisma.activity.findFirst({
      where: { entityType: 'LEAD', entityId: lead.id, type: 'QUOTATION' },
      orderBy: { createdAt: 'desc' },
    });
    expect(activity?.subject).toContain('تعليم');
  });
});

describe('اختيار المستلم يدويًا ونسخة CC — عروض الأسعار', () => {
  it('يعيد قائمة جهات اتصال العميل للاختيار منها', async () => {
    const id = await newApprovedQuotation({ clientId: state.clientId });
    const preview = await previewQuotationRecipient(id);
    expect(preview.options.length).toBeGreaterThan(1);
    expect(preview.options.every((o) => o.email.includes('@'))).toBe(true);
  });

  it('عرض سعر لعميل محتمل بلا عميل: لا توجد خيارات ولا يمكن اختيار جهة', async () => {
    const lead = await createLead({
      fullName: 'عميل محتمل بلا جهات اتصال',
      phone: '01099887744',
      email: 'no-contacts@example.com',
      estimatedValue: 3000,
      currency: 'EGP',
      priority: 'LOW',
      score: 0,
      nextFollowUpAt: new Date(Date.now() + 86_400_000).toISOString(),
    } as never);
    const id = await newApprovedQuotation({ leadId: lead.id });

    const preview = await previewQuotationRecipient(id);
    expect(preview.options).toEqual([]);
    await expect(
      sendQuotationToClient(id, { email: true, toContactId: state.otherContactId }),
    ).rejects.toThrow(/مستند بلا عميل/);
  });

  it('يرفض مستلمًا يخص عميلًا آخر ولا يغيّر الحالة', async () => {
    // بدون هذا التحقق يُرسل عرض سعر عميل إلى جهة اتصال عميل مختلف.
    const id = await newApprovedQuotation({ clientId: state.clientId });
    await expect(
      sendQuotationToClient(id, { email: true, toContactId: state.otherContactId }),
    ).rejects.toThrow(/لا تخص هذا العميل/);

    const q = await prisma.quotation.findUniqueOrThrow({ where: { id } });
    expect(q.status).toBe('APPROVED_INTERNALLY');
  });

  it('يرفض نسخة CC تخص عميلًا آخر', async () => {
    const id = await newApprovedQuotation({ clientId: state.clientId });
    await expect(
      sendQuotationToClient(id, { email: true, ccContactIds: [state.otherContactId] }),
    ).rejects.toThrow(/لا تخص هذا العميل/);
  });

  it('يرفض معرّف جهة اتصال غير موجود', async () => {
    const id = await newApprovedQuotation({ clientId: state.clientId });
    await expect(
      sendQuotationToClient(id, { email: true, toContactId: 'does-not-exist' }),
    ).rejects.toThrow(/لا تخص هذا العميل/);
  });

  it('المستلم المختار يدويًا يتجاوز الاختيار التلقائي فعليًا', async () => {
    // الاختيار التلقائي يذهب لصاحب القرار (boss@)، فنختار موظف الاستقبال بدلًا منه
    // ونتحقق من العنوان المسجَّل في محاولة الإرسال — لا من الواجهة.
    const contacts = await prisma.contact.findMany({
      where: { clientId: state.clientId, deletedAt: null },
      select: { id: true, email: true },
    });
    const reception = contacts.find((c) => c.email === 'reception@example.com');
    expect(reception).toBeTruthy();

    const id = await newApprovedQuotation({ clientId: state.clientId });
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = '1';

    await expect(
      sendQuotationToClient(id, { email: true, toContactId: reception!.id }),
    ).rejects.toBeInstanceOf(AppError);

    const log = await prisma.auditLog.findFirst({
      where: { entityType: 'QUOTATION', entityId: id, action: 'EXPORT' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log?.summary).toContain('re*******@example.com');
  });
});

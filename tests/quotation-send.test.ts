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
const state = { clientId: '', serviceId: '' };

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
    await upsertContact({
      clientId: state.clientId,
      name: 'موظف استقبال',
      type: 'MAIN',
      email: 'reception@example.com',
      isPrimary: true,
    } as never);
    await upsertContact({
      clientId: state.clientId,
      name: 'المدير',
      type: 'DECISION_MAKER',
      email: 'boss@example.com',
    } as never);

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

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { mockSession, actAs, createTestUser, prisma, resetBusinessData } from './helpers';

mockSession();

const { sendInvoiceToClient, previewInvoiceRecipient } = await import(
  '@/server/services/invoice-send'
);
const { createClient, upsertContact } = await import('@/server/services/clients');
const { createInvoice } = await import('@/server/services/invoices');
const { AppError } = await import('@/server/auth/guard');

const FINANCE = 'send.finance@bluepoint.local';
const ADMIN = 'send.admin@bluepoint.local';
const state = { clientId: '', invoiceId: '' };

/** ينشئ فاتورة مسودة جديدة لكل اختبار — الإرسال عملية تتم مرة واحدة. */
async function newDraftInvoice() {
  const invoice = await createInvoice({
    clientId: state.clientId,
    issueDate: new Date().toISOString(),
    dueDate: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    currency: 'EGP',
    items: [{ nameAr: 'خدمة', nameEn: 'Service', quantity: 1, unitPrice: 5000, taxRate: 0 }],
  } as never);
  return invoice.id;
}

beforeAll(async () => {
  await resetBusinessData();
  await createTestUser({ email: FINANCE, name: 'محاسب', roleKey: 'FINANCE' });
  await createTestUser({ email: ADMIN, name: 'مدير النظام', roleKey: 'SUPER_ADMIN' });
  // دور المالية يرى العملاء ولا ينشئهم — التهيئة بحساب المسؤول.
  await actAs(ADMIN);

  const client = await createClient({
    legalName: 'عميل الإرسال',
    industry: 'OTHER',
    status: 'ACTIVE',
    country: 'EG',
  } as never);
  state.clientId = client.id;
});

beforeEach(async () => {
  await actAs(FINANCE);
  state.invoiceId = await newDraftInvoice();
  delete process.env.SMTP_HOST;
});

afterEach(() => {
  delete process.env.SMTP_HOST;
});

describe('اختيار المستلم', () => {
  it('لا يجد مستلمًا عند غياب جهات الاتصال', async () => {
    const preview = await previewInvoiceRecipient(state.invoiceId);
    expect(preview.recipient).toBeNull();
  });

  it('يفضّل جهة الاتصال المالية على الرئيسية', async () => {
    await actAs(ADMIN);
    await upsertContact({
      clientId: state.clientId,
      name: 'جهة رئيسية',
      type: 'MAIN',
      email: 'main@example.com',
      isPrimary: true,
    } as never);
    await upsertContact({
      clientId: state.clientId,
      name: 'الحسابات',
      type: 'FINANCE',
      email: 'finance@example.com',
    } as never);

    await actAs(FINANCE);
    const preview = await previewInvoiceRecipient(state.invoiceId);
    expect(preview.recipient?.email).toBe('finance@example.com');
  });
});

describe('إرسال الفاتورة', () => {
  it('التعليم كمُرسلة بدون بريد يغيّر الحالة ويوضّح ذلك', async () => {
    const outcome = await sendInvoiceToClient(state.invoiceId, { email: false });
    expect(outcome.status).toBe('marked_only');

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: state.invoiceId } });
    expect(invoice.status).toBe('SENT');
    expect(invoice.sentAt).not.toBeNull();
  });

  it('طلب الإرسال بالبريد بدون SMTP لا يفشل بل يعلّمها كمُرسلة ويذكر السبب', async () => {
    const outcome = await sendInvoiceToClient(state.invoiceId, { email: true });
    expect(outcome.status).toBe('marked_only');
    if (outcome.status === 'marked_only') expect(outcome.reason).toContain('البريد');
  });

  it('فشل خادم البريد يُبقي الفاتورة مسودة حتى يمكن إعادة المحاولة', async () => {
    // مضيف غير موجود — الاتصال يفشل حتمًا بلا أي إرسال حقيقي.
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = '1';

    await expect(sendInvoiceToClient(state.invoiceId, { email: true })).rejects.toBeInstanceOf(
      AppError,
    );

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: state.invoiceId } });
    expect(invoice.status).toBe('DRAFT');
    expect(invoice.sentAt).toBeNull();
  });

  it('لا يمكن إرسال فاتورة مُرسلة مرتين', async () => {
    await sendInvoiceToClient(state.invoiceId, { email: false });
    await expect(sendInvoiceToClient(state.invoiceId, { email: false })).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it('يسجّل الإرسال في سجل التدقيق ببريد مُخفى جزئيًا', async () => {
    await sendInvoiceToClient(state.invoiceId, { email: false });
    const log = await prisma.auditLog.findFirst({
      where: { entityId: state.invoiceId, action: 'STATUS_CHANGE' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log?.summary).toContain('تعليم');
    // لا يظهر بريد كامل في السجل عند التعليم اليدوي.
    expect(log?.summary).not.toContain('finance@example.com');
  });
});

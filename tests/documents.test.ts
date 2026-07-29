import { describe, it, expect, beforeAll } from 'vitest';
import { mockSession, actAs, createTestUser, prisma, resetBusinessData } from './helpers';

mockSession();

const { renderInvoiceHtml } = await import('@/server/services/invoice-pdf');
const { renderContractHtml } = await import('@/server/services/contract-pdf');
const { createClient } = await import('@/server/services/clients');
const { createInvoice, recordPayment } = await import('@/server/services/invoices');
const { createContract } = await import('@/server/services/contracts');
const { AppError } = await import('@/server/auth/guard');

const CEO = 'doc.ceo@bluepoint.local';
const DESIGNER = 'doc.designer@bluepoint.local';
const ACCOUNT_MANAGER = 'doc.am@bluepoint.local';

const state = { clientId: '', invoiceId: '', contractId: '' };

beforeAll(async () => {
  await resetBusinessData();
  await createTestUser({ email: CEO, name: 'مدير عام', roleKey: 'SUPER_ADMIN' });
  await createTestUser({ email: DESIGNER, name: 'مصمم', roleKey: 'GRAPHIC_DESIGNER' });
  const am = await createTestUser({ email: ACCOUNT_MANAGER, name: 'مدير حساب', roleKey: 'ACCOUNT_MANAGER' });
  // كل الأدوار الافتراضية التي ترى العقود ترى قيمتها أيضًا، لذلك نبني الحالة
  // عبر استثناء على مستوى المستخدم: يرى كل العقود لكن بلا صلاحية القيم المالية.
  await prisma.userPermissionOverride.createMany({
    data: [
      { userId: am.id, module: 'contracts', action: 'view', scope: 'ALL', allow: true },
      { userId: am.id, module: 'contracts', action: 'view_financial', scope: 'OWN', allow: false },
    ],
    skipDuplicates: true,
  });

  await actAs(CEO);
  const client = await createClient({
    legalName: 'شركة <الاختبار> للتجارة & شركاه',
    brandName: 'اختبار',
    industry: 'OTHER',
    status: 'ACTIVE',
    country: 'EG',
  } as never);
  state.clientId = client.id;

  const invoice = await createInvoice({
    clientId: state.clientId,
    issueDate: new Date().toISOString(),
    dueDate: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    currency: 'EGP',
    items: [
      { nameAr: 'إدارة حسابات', nameEn: 'Account management', quantity: 1, unitPrice: 10000, taxRate: 14 },
    ],
  } as never);
  state.invoiceId = invoice.id;

  const contract = await createContract({
    title: 'عقد اختبار المستندات',
    clientId: state.clientId,
    startDate: new Date().toISOString(),
    // ٣ أشهر بالضبط للتحقق من صيغة الجمع العربية.
    endDate: new Date(Date.now() + 90 * 86_400_000).toISOString(),
    autoRenew: false,
    value: 30000,
    currency: 'EGP',
    status: 'ACTIVE',
    reminderDays: [30],
    serviceIds: [],
  } as never);
  state.contractId = contract.id;
});

describe('فاتورة PDF', () => {
  it('تعرض الرقم والعميل والإجمالي والضريبة', async () => {
    await actAs(CEO);
    const html = await renderInvoiceHtml(state.invoiceId, 'ar');
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: state.invoiceId } });

    expect(html).toContain(invoice.number);
    expect(html).toContain('اختبار');
    // ١٠٬٠٠٠ + ١٤٪ ضريبة = ١١٬٤٠٠
    expect(Number(invoice.totalMinor)).toBe(1_140_000);
    expect(html).toContain('11,400.00');
  });

  it('تهرّب اسم العميل فلا يمكن حقن HTML في المستند', async () => {
    await actAs(CEO);
    const html = await renderInvoiceHtml(state.invoiceId, 'ar');
    expect(html).not.toContain('<الاختبار>');
    expect(html).toContain('&lt;الاختبار&gt;');
  });

  it('المسودة تحمل ختم «مسودة» وتنبيهًا بأنها ليست مطالبة سداد', async () => {
    await actAs(CEO);
    const html = await renderInvoiceHtml(state.invoiceId, 'ar');
    expect(html).toContain('class="watermark"');
    expect(html).toContain('مسودة');
    expect(html).toContain('غير صالحة للمطالبة بالسداد');
  });

  it('الفاتورة الملغاة تحمل ختم الإلغاء وسببه', async () => {
    await prisma.invoice.update({
      where: { id: state.invoiceId },
      data: { status: 'CANCELLED', cancelReason: 'خطأ في البنود' },
    });
    await actAs(CEO);
    const html = await renderInvoiceHtml(state.invoiceId, 'ar');
    expect(html).toContain('ملغاة');
    expect(html).toContain('خطأ في البنود');
  });

  it('الفاتورة المرسلة لا تحمل أي ختم', async () => {
    await prisma.invoice.update({
      where: { id: state.invoiceId },
      data: { status: 'SENT', cancelReason: null },
    });
    await actAs(CEO);
    const html = await renderInvoiceHtml(state.invoiceId, 'ar');
    expect(html).not.toContain('class="watermark"');
  });

  it('تعرض الدفعات المسجَّلة والمتبقي بعدها', async () => {
    await actAs(CEO);
    await recordPayment({
      invoiceId: state.invoiceId,
      clientId: state.clientId,
      amount: 4000,
      currency: 'EGP',
      paidAt: new Date().toISOString(),
      method: 'INSTAPAY',
      reference: 'TRX-TEST-1',
    } as never);

    const html = await renderInvoiceHtml(state.invoiceId, 'ar');
    expect(html).toContain('TRX-TEST-1');
    expect(html).toContain('إنستا باي');
    // ١١٬٤٠٠ − ٤٬٠٠٠ = ٧٬٤٠٠ متبقٍ
    expect(html).toContain('7,400.00');
  });

  it('النسخة الإنجليزية تُبنى باتجاه LTR', async () => {
    await actAs(CEO);
    const html = await renderInvoiceHtml(state.invoiceId, 'en');
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('Invoice');
  });

  it('من لا يملك صلاحية عرض الفواتير لا يستطيع توليد المستند', async () => {
    await actAs(DESIGNER);
    await expect(renderInvoiceHtml(state.invoiceId, 'ar')).rejects.toBeInstanceOf(AppError);
  });
});

describe('ملخص العقد PDF', () => {
  it('يوضّح صراحةً أنه ليس العقد القانوني', async () => {
    await actAs(CEO);
    const html = await renderContractHtml(state.contractId, 'ar');
    expect(html).toContain('ملخص عقد');
    expect(html).toContain('ليست العقد القانوني');
  });

  it('يكتب المدة بصيغة الجمع الصحيحة (٣ أشهر لا «٣ شهرًا»)', async () => {
    await actAs(CEO);
    const html = await renderContractHtml(state.contractId, 'ar');
    expect(html).toContain('3 أشهر');
    expect(html).not.toContain('3 شهرًا');
  });

  it('يحجب القيمة المالية عمن لا يملك صلاحية عرضها ويوضّح سبب الحجب', async () => {
    await actAs(ACCOUNT_MANAGER);
    const html = await renderContractHtml(state.contractId, 'ar');
    // 30,000 هي قيمة العقد — يجب ألا تظهر إطلاقًا.
    expect(html).not.toContain('30,000.00');
    expect(html).toContain('لعدم توفر صلاحية عرضها');
  });

  it('يعرض القيمة لمن يملك الصلاحية', async () => {
    await actAs(CEO);
    const html = await renderContractHtml(state.contractId, 'ar');
    expect(html).toContain('30,000.00');
    expect(html).not.toContain('لعدم توفر صلاحية عرضها');
  });
});

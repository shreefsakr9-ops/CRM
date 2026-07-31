import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { mockSession, actAs, createTestUser, prisma, resetBusinessData } from './helpers';

mockSession();

const { createClient } = await import('@/server/services/clients');
const { recordPayment, createExpense } = await import('@/server/services/invoices');
const reports = await import('@/server/services/reports');

const ADMIN = 'rf.admin@bluepoint.local';

beforeAll(async () => {
  await createTestUser({ email: ADMIN, name: 'مدير النظام', roleKey: 'SUPER_ADMIN' });
});

// كل اختبار يبدأ من بيانات مالية نظيفة: financialReport() يُجمِّع على مستوى
// الشركة كاملة بلا تقييد بعميل بعينه، فبقاء بيانات اختبار سابق يُفسد رقمًا
// مفترضًا سالبًا في الاختبار التالي.
beforeEach(async () => {
  await resetBusinessData();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('صافي الربح في التقرير المالي (المحصَّل − المصروفات المباشرة)', () => {
  it('يساوي فعليًا المحصَّل ناقص مجموع المصروفات لنفس الفترة، بأرقام معروفة', async () => {
    await actAs(ADMIN);
    const client = await createClient({
      legalName: 'عميل اختبار صافي الربح',
      type: 'COMPANY',
      currency: 'EGP',
      status: 'ACTIVE',
    } as never);

    const today = new Date().toISOString();

    // محصَّل: ١٠٬٠٠٠ جنيه
    await recordPayment({
      clientId: client.id,
      amount: 10_000,
      currency: 'EGP',
      paidAt: today,
      method: 'BANK_TRANSFER',
    } as never);

    // مصروفات مباشرة من تصنيفين مختلفين: ٣٬٠٠٠ + ١٬٥٠٠ = ٤٬٥٠٠ جنيه
    await createExpense({
      category: 'FREELANCER',
      description: 'مصمم مستقل',
      amount: 3_000,
      currency: 'EGP',
      spentOn: today,
    } as never);
    await createExpense({
      category: 'TOOLS',
      description: 'اشتراك أداة',
      amount: 1_500,
      currency: 'EGP',
      spentOn: today,
    } as never);

    const range = reports.parseRange(
      new Date(Date.now() - 86_400_000).toISOString(),
      new Date().toISOString(),
    );
    const report = await reports.financialReport(range);

    expect(report.collectedMinor).toBe(1_000_000); // 10,000 EGP بالقرش
    expect(report.expensesMinor).toBe(450_000); // 4,500 EGP بالقرش
    expect(report.netProfitMinor).toBe(report.collectedMinor - report.expensesMinor);
    expect(report.netProfitMinor).toBe(550_000); // 5,500 EGP
  });

  it('يكون سالبًا فعليًا حين تتجاوز المصروفات المحصَّل', async () => {
    await actAs(ADMIN);
    const client = await createClient({
      legalName: 'عميل اختبار خسارة',
      type: 'COMPANY',
      currency: 'EGP',
      status: 'ACTIVE',
    } as never);

    const today = new Date().toISOString();

    await recordPayment({
      clientId: client.id,
      amount: 1_000,
      currency: 'EGP',
      paidAt: today,
      method: 'CASH',
    } as never);
    await createExpense({
      category: 'MEDIA_SPEND',
      description: 'إنفاق إعلاني',
      amount: 4_000,
      currency: 'EGP',
      spentOn: today,
    } as never);

    const range = reports.parseRange(
      new Date(Date.now() - 86_400_000 * 2).toISOString(),
      new Date().toISOString(),
    );
    const report = await reports.financialReport(range);

    expect(report.netProfitMinor).toBeLessThan(0);
    expect(report.netProfitMinor).toBe(report.collectedMinor - report.expensesMinor);
  });
});

describe('كل تصنيفات المصروفات تُحتسب بلا استثناء ضمن المصروفات المباشرة', () => {
  it('تصنيف "أخرى" (OTHER) يُحتسب فعليًا — تحقّق مباشر لا افتراض', async () => {
    await actAs(ADMIN);
    const client = await createClient({
      legalName: 'عميل اختبار تصنيف أخرى',
      type: 'COMPANY',
      currency: 'EGP',
      status: 'ACTIVE',
    } as never);
    const today = new Date().toISOString();

    const range = reports.parseRange(
      new Date(Date.now() - 86_400_000).toISOString(),
      new Date().toISOString(),
    );
    const before = await reports.financialReport(range);
    expect(before.expensesMinor).toBe(0);

    await createExpense({
      clientId: client.id,
      category: 'OTHER',
      description: 'مصروف تجريبي - تصنيف أخرى',
      amount: 500,
      currency: 'EGP',
      spentOn: today,
    } as never);

    const after = await reports.financialReport(range);
    expect(after.expensesMinor).toBe(50_000); // 500 EGP بالقرش
    expect(after.expensesMinor - before.expensesMinor).toBe(50_000);
    expect(after.expensesByCategory).toContainEqual({ label: 'OTHER', value: 500 });
  });

  it('تصنيف "رواتب" (SALARIES) الجديد يُحتسب ضمن المصروفات وصافي الربح', async () => {
    await actAs(ADMIN);
    const client = await createClient({
      legalName: 'عميل اختبار تصنيف رواتب',
      type: 'COMPANY',
      currency: 'EGP',
      status: 'ACTIVE',
    } as never);
    const today = new Date().toISOString();

    await recordPayment({
      clientId: client.id,
      amount: 20_000,
      currency: 'EGP',
      paidAt: today,
      method: 'BANK_TRANSFER',
    } as never);
    await createExpense({
      clientId: client.id,
      category: 'SALARIES',
      description: 'رواتب فريق شهر يوليو',
      amount: 8_000,
      currency: 'EGP',
      spentOn: today,
    } as never);

    const range = reports.parseRange(
      new Date(Date.now() - 86_400_000).toISOString(),
      new Date().toISOString(),
    );
    const report = await reports.financialReport(range);

    expect(report.expensesMinor).toBe(800_000); // 8,000 EGP بالقرش
    expect(report.expensesByCategory).toContainEqual({ label: 'SALARIES', value: 8_000 });
    expect(report.netProfitMinor).toBe(report.collectedMinor - report.expensesMinor);
    expect(report.netProfitMinor).toBe(1_200_000); // (20,000 - 8,000) EGP بالقرش
  });

  it('كل تصنيف من التصنيفات الثمانية يُحتسب فرديًا بلا أي استثناء', async () => {
    await actAs(ADMIN);
    const client = await createClient({
      legalName: 'عميل اختبار كل التصنيفات',
      type: 'COMPANY',
      currency: 'EGP',
      status: 'ACTIVE',
    } as never);
    const today = new Date().toISOString();

    const categories = [
      'FREELANCER',
      'PRODUCTION',
      'TRANSPORTATION',
      'TOOLS',
      'MEDIA_SPEND',
      'PRINTING',
      'SALARIES',
      'OTHER',
    ] as const;

    for (const category of categories) {
      await createExpense({
        clientId: client.id,
        category,
        description: `مصروف اختبار — ${category}`,
        amount: 100,
        currency: 'EGP',
        spentOn: today,
      } as never);
    }

    const range = reports.parseRange(
      new Date(Date.now() - 86_400_000).toISOString(),
      new Date().toISOString(),
    );
    const report = await reports.financialReport(range);

    // ٨ تصنيفات × ١٠٠ جنيه = ٨٠٠ جنيه بالقرش — أي استثناء لتصنيف واحد يُسقط الرقم عن هذا.
    expect(report.expensesMinor).toBe(80_000);
    expect(report.expensesByCategory).toHaveLength(categories.length);
    for (const category of categories) {
      expect(report.expensesByCategory).toContainEqual({ label: category, value: 100 });
    }
  });
});

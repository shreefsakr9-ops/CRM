import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { mockSession, actAs, createTestUser, prisma, resetBusinessData } from './helpers';

mockSession();

const { createClient } = await import('@/server/services/clients');
const { recordPayment, createExpense } = await import('@/server/services/invoices');
const { listAdWalletBalances, createAdWalletTransaction } = await import('@/server/services/ad-wallets');
const reports = await import('@/server/services/reports');

const ADMIN = 'aw.admin@bluepoint.local';
const FINANCE = 'aw.finance@bluepoint.local';
const DESIGNER = 'aw.designer@bluepoint.local';

beforeAll(async () => {
  await createTestUser({ email: ADMIN, name: 'مدير النظام', roleKey: 'SUPER_ADMIN' });
  await createTestUser({ email: FINANCE, name: 'مالية', roleKey: 'FINANCE' });
  await createTestUser({ email: DESIGNER, name: 'مصمم', roleKey: 'GRAPHIC_DESIGNER' });
});

beforeEach(async () => {
  await resetBusinessData();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('أرصدة إعلانات العملاء — أمانة منفصلة تمامًا عن مالية الشركة', () => {
  it('الإيداع والخصم يُحتسبان بشكل صحيح: المتبقي تراكمي، والإجماليات بحسب الفترة', async () => {
    await actAs(ADMIN);
    const client = await createClient({
      legalName: 'عميل اختبار رصيد الإعلانات',
      type: 'COMPANY',
      currency: 'EGP',
      status: 'ACTIVE',
    } as never);
    await actAs(FINANCE);

    const today = new Date().toISOString();

    await createAdWalletTransaction({
      clientId: client.id,
      type: 'DEPOSIT',
      amount: 5_000,
      currency: 'EGP',
      occurredAt: today,
      note: 'إيداع أول',
    });

    await createAdWalletTransaction({
      clientId: client.id,
      type: 'WITHDRAWAL',
      amount: 1_200,
      currency: 'EGP',
      occurredAt: today,
      note: 'صرف حملة فيسبوك',
    });

    const range = reports.parseRange(
      new Date(Date.now() - 86_400_000).toISOString(),
      new Date().toISOString(),
    );
    const balances = await listAdWalletBalances(range);
    const row = balances.find((b) => b.clientId === client.id);

    expect(row).toBeDefined();
    expect(row!.depositedInRangeMinor).toBe(500_000); // 5,000 EGP
    expect(row!.withdrawnInRangeMinor).toBe(120_000); // 1,200 EGP
    expect(row!.balanceMinor).toBe(380_000); // 3,800 EGP المتبقي
  });

  it('الرصيد المتبقي تراكمي حتى خارج الفترة المفلترة الحالية', async () => {
    await actAs(ADMIN);
    const client = await createClient({
      legalName: 'عميل اختبار رصيد قديم',
      type: 'COMPANY',
      currency: 'EGP',
      status: 'ACTIVE',
    } as never);
    await actAs(FINANCE);

    // إيداع قديم خارج نطاق الفترة القادمة (قبل ٦٠ يومًا).
    await createAdWalletTransaction({
      clientId: client.id,
      type: 'DEPOSIT',
      amount: 2_000,
      currency: 'EGP',
      occurredAt: new Date(Date.now() - 60 * 86_400_000).toISOString(),
    });

    // فترة التقرير آخر يومين فقط — لا تشمل الإيداع القديم.
    const range = reports.parseRange(
      new Date(Date.now() - 86_400_000).toISOString(),
      new Date().toISOString(),
    );
    const balances = await listAdWalletBalances(range);
    const row = balances.find((b) => b.clientId === client.id);

    expect(row).toBeDefined();
    expect(row!.depositedInRangeMinor).toBe(0); // الإيداع خارج الفترة
    expect(row!.balanceMinor).toBe(200_000); // لكن المتبقي التراكمي يشمله (2,000 EGP)
  });

  it('يسمح بالخصم رغم تجاوزه الرصيد المتبقي — يصبح الرصيد سالبًا بلا منع', async () => {
    await actAs(ADMIN);
    const client = await createClient({
      legalName: 'عميل اختبار رصيد سالب',
      type: 'COMPANY',
      currency: 'EGP',
      status: 'ACTIVE',
    } as never);
    await actAs(FINANCE);
    const today = new Date().toISOString();

    await createAdWalletTransaction({
      clientId: client.id,
      type: 'DEPOSIT',
      amount: 500,
      currency: 'EGP',
      occurredAt: today,
    });
    await createAdWalletTransaction({
      clientId: client.id,
      type: 'WITHDRAWAL',
      amount: 800,
      currency: 'EGP',
      occurredAt: today,
    });

    const range = reports.parseRange(
      new Date(Date.now() - 86_400_000).toISOString(),
      new Date().toISOString(),
    );
    const balances = await listAdWalletBalances(range);
    const row = balances.find((b) => b.clientId === client.id);

    expect(row!.balanceMinor).toBe(-30_000); // -300 EGP
  });

  it('لا تؤثر إطلاقًا على المصروفات المباشرة أو صافي الربح أو المحصَّل في التقرير المالي', async () => {
    await actAs(ADMIN);
    const client = await createClient({
      legalName: 'عميل اختبار الفصل المالي',
      type: 'COMPANY',
      currency: 'EGP',
      status: 'ACTIVE',
    } as never);
    await actAs(FINANCE);
    const today = new Date().toISOString();

    const range = reports.parseRange(
      new Date(Date.now() - 86_400_000).toISOString(),
      new Date().toISOString(),
    );

    // أرقام مالية حقيقية للشركة قبل أي حركة في رصيد الإعلانات.
    await recordPayment({
      clientId: client.id,
      amount: 10_000,
      currency: 'EGP',
      paidAt: today,
      method: 'BANK_TRANSFER',
    } as never);
    await createExpense({
      clientId: client.id,
      category: 'MEDIA_SPEND',
      description: 'مصروف شركة حقيقي',
      amount: 2_000,
      currency: 'EGP',
      spentOn: today,
    } as never);

    const before = await reports.financialReport(range);

    // حركة ضخمة على رصيد إعلانات العميل — لا يجب أن تغيّر أي رقم أعلاه.
    await createAdWalletTransaction({
      clientId: client.id,
      type: 'DEPOSIT',
      amount: 50_000,
      currency: 'EGP',
      occurredAt: today,
    });
    await createAdWalletTransaction({
      clientId: client.id,
      type: 'WITHDRAWAL',
      amount: 30_000,
      currency: 'EGP',
      occurredAt: today,
    });

    const after = await reports.financialReport(range);

    expect(after.collectedMinor).toBe(before.collectedMinor);
    expect(after.expensesMinor).toBe(before.expensesMinor);
    expect(after.netProfitMinor).toBe(before.netProfitMinor);
    expect(after.invoicedMinor).toBe(before.invoicedMinor);
  });

  it('المصمم لا يملك صلاحية الوصول لأرصدة إعلانات العملاء', async () => {
    await actAs(DESIGNER);
    const range = reports.parseRange();
    await expect(listAdWalletBalances(range)).rejects.toMatchObject({ status: 403 });
    await expect(
      createAdWalletTransaction({
        clientId: 'irrelevant',
        type: 'DEPOSIT',
        amount: 100,
        currency: 'EGP',
        occurredAt: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

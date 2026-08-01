/**
 * فلتر [من/إلى] الجديد في المصروفات والمدفوعات والمهام: يتحقق أن القائمة
 * والإجماليات المعروضة تعكس الفترة المختارة فقط، وأن فلتر المهام يعمل على
 * dueDate تحديدًا لا تاريخ الإنشاء.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { mockSession, actAs, createTestUser, prisma, resetBusinessData } from './helpers';

mockSession();

const { createClient } = await import('@/server/services/clients');
const { recordPayment, createExpense, listPayments, listExpenses } = await import(
  '@/server/services/invoices'
);
const { createTask, listTasks } = await import('@/server/services/tasks');

const ADMIN = 'drf.admin@bluepoint.local';
const FINANCE = 'drf.finance@bluepoint.local';
const OPS = 'drf.ops@bluepoint.local';

beforeAll(async () => {
  await createTestUser({ email: ADMIN, name: 'مدير النظام', roleKey: 'SUPER_ADMIN' });
  await createTestUser({ email: FINANCE, name: 'مالية', roleKey: 'FINANCE' });
  await createTestUser({ email: OPS, name: 'عمليات', roleKey: 'OPERATIONS_MANAGER' });
});

beforeEach(async () => {
  await resetBusinessData();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('فلتر التاريخ [من/إلى] — المصروفات', () => {
  it('يفلتر القائمة والإجمالي حسب spentOn فقط ضمن الفترة المختارة', async () => {
    await actAs(ADMIN);
    const client = await createClient({
      legalName: 'عميل فلتر المصروفات',
      type: 'COMPANY',
      currency: 'EGP',
      status: 'ACTIVE',
    } as never);
    await actAs(FINANCE);

    await createExpense({
      clientId: client.id,
      category: 'OTHER',
      description: 'مصروف قديم خارج الفترة',
      amount: 1_000,
      currency: 'EGP',
      spentOn: '2020-01-05',
    } as never);
    await createExpense({
      clientId: client.id,
      category: 'OTHER',
      description: 'مصروف داخل الفترة',
      amount: 500,
      currency: 'EGP',
      spentOn: '2025-06-15',
    } as never);

    const filtered = await listExpenses({ from: '2025-06-01', to: '2025-06-30' });
    expect(filtered.total).toBe(1);
    expect(filtered.totalMinor).toBe(50_000);
    expect(filtered.rows[0].description).toBe('مصروف داخل الفترة');

    const unfiltered = await listExpenses({});
    expect(unfiltered.total).toBe(2);
  });
});

describe('فلتر التاريخ [من/إلى] — المدفوعات', () => {
  it('يفلتر القائمة و"إجمالي المحصَّل" و"عدد الدفعات" حسب paidAt فقط', async () => {
    await actAs(ADMIN);
    const client = await createClient({
      legalName: 'عميل فلتر المدفوعات',
      type: 'COMPANY',
      currency: 'EGP',
      status: 'ACTIVE',
    } as never);
    await actAs(FINANCE);

    await recordPayment({
      clientId: client.id,
      amount: 3_000,
      currency: 'EGP',
      paidAt: '2020-02-10',
      method: 'BANK_TRANSFER',
    } as never);
    await recordPayment({
      clientId: client.id,
      amount: 1_500,
      currency: 'EGP',
      paidAt: '2025-07-20',
      method: 'CASH',
    } as never);

    const filtered = await listPayments({ from: '2025-07-01', to: '2025-07-31' });
    expect(filtered.total).toBe(1);
    expect(filtered.totalMinor).toBe(150_000);

    const unfiltered = await listPayments({});
    expect(unfiltered.total).toBe(2);
  });
});

describe('فلتر التاريخ [من/إلى] — المهام (على أساس تاريخ الاستحقاق dueDate)', () => {
  it('يفلتر حسب dueDate لا تاريخ الإنشاء — مهمة أُنشئت الآن باستحقاق قديم يجب ألا تظهر في فترة حديثة', async () => {
    await actAs(OPS);

    await createTask({
      title: 'مهمة استحقاقها خارج الفترة',
      dueDate: '2020-03-01',
    } as never);
    const inRange = await createTask({
      title: 'مهمة استحقاقها داخل الفترة',
      dueDate: '2025-08-10',
    } as never);

    const filtered = await listTasks({ from: '2025-08-01', to: '2025-08-31' });
    expect(filtered.total).toBe(1);
    expect(filtered.rows[0].id).toBe(inRange.id);

    const unfiltered = await listTasks({});
    expect(unfiltered.total).toBe(2);
  });

  it('يُدمَج مع الفلتر السريع "متأخرة" بدل أن يُلغيه', async () => {
    await actAs(OPS);
    const now = Date.now();

    await createTask({
      title: 'مهمة متأخرة قديمة جدًا',
      dueDate: new Date(now - 365 * 86_400_000).toISOString().slice(0, 10),
    } as never);
    const recentOverdue = await createTask({
      title: 'مهمة متأخرة حديثًا',
      dueDate: new Date(now - 2 * 86_400_000).toISOString().slice(0, 10),
    } as never);

    const from = new Date(now - 10 * 86_400_000).toISOString().slice(0, 10);
    const result = await listTasks({ filter: 'overdue', from });
    expect(result.total).toBe(1);
    expect(result.rows[0].id).toBe(recentOverdue.id);
  });
});

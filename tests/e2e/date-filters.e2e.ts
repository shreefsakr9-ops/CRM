import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { newSession, login, type Session } from './browser';
import { seedE2EData, prisma, USERS, type E2EData } from './fixtures';

/**
 * فلتر [من/إلى] الجديد في المصروفات والمدفوعات والمهام — يتحقق فعليًا في
 * متصفح حقيقي أن اختيار التاريخ من الحقول يُحدّث قائمة الصفحة وإجمالياتها،
 * وأن فلتر المهام يعمل على تاريخ الاستحقاق تحديدًا.
 */

let data: E2EData;
let session: Session;

beforeAll(async () => {
  data = await seedE2EData();
  await prisma.expense.deleteMany({ where: { clientId: data.clientId } });
  await prisma.payment.deleteMany({ where: { clientId: data.clientId } });
  await prisma.task.deleteMany({ where: { clientId: data.clientId } });

  const admin = await prisma.user.findUniqueOrThrow({ where: { email: USERS.admin } });

  await prisma.expense.create({
    data: {
      clientId: data.clientId,
      category: 'OTHER',
      description: 'مصروف قديم لفلتر التاريخ',
      amountMinor: 100_000n,
      currency: 'EGP',
      spentOn: new Date('2020-01-10'),
      recordedById: admin.id,
    },
  });
  await prisma.expense.create({
    data: {
      clientId: data.clientId,
      category: 'OTHER',
      description: 'مصروف حديث لفلتر التاريخ',
      amountMinor: 50_000n,
      currency: 'EGP',
      spentOn: new Date('2025-06-15'),
      recordedById: admin.id,
    },
  });

  await prisma.payment.create({
    data: {
      clientId: data.clientId,
      amountMinor: 300_000n,
      currency: 'EGP',
      paidAt: new Date('2020-02-10'),
      method: 'BANK_TRANSFER',
      recordedById: admin.id,
    },
  });
  await prisma.payment.create({
    data: {
      clientId: data.clientId,
      amountMinor: 150_000n,
      currency: 'EGP',
      paidAt: new Date('2025-07-20'),
      method: 'CASH',
      recordedById: admin.id,
    },
  });

  await prisma.task.create({
    data: {
      title: 'مهمة استحقاقها قديم (فلتر التاريخ)',
      status: 'TODO',
      priority: 'MEDIUM',
      clientId: data.clientId,
      dueDate: new Date('2020-03-01'),
      creatorId: admin.id,
      createdById: admin.id,
    },
  });
  await prisma.task.create({
    data: {
      title: 'مهمة استحقاقها حديث (فلتر التاريخ)',
      status: 'TODO',
      priority: 'MEDIUM',
      clientId: data.clientId,
      dueDate: new Date('2025-08-10'),
      creatorId: admin.id,
      createdById: admin.id,
    },
  });

  session = await newSession();
  await login(session, USERS.admin);
}, 120_000);

afterAll(async () => {
  await session?.close();
  await prisma.$disconnect();
});

describe('فلتر التاريخ [من/إلى] عبر المتصفح', () => {
  it('صفحة المصروفات: اختيار الفترة يحدّث القائمة وإجمالي المصروفات وعدد السجلات', async () => {
    const page = session.page;
    await page.goto('/expenses', { waitUntil: 'networkidle' });
    await expect.poll(() => page.locator('text=مصروف قديم لفلتر التاريخ').count()).toBeGreaterThan(0);
    await expect.poll(() => page.locator('text=مصروف حديث لفلتر التاريخ').count()).toBeGreaterThan(0);

    const [fromInput, toInput] = await page.locator('input[type="date"]').all();
    await fromInput.fill('2025-06-01');
    await page.waitForURL((u) => u.searchParams.get('from') === '2025-06-01');
    await toInput.fill('2025-06-30');
    await page.waitForURL((u) => u.searchParams.get('to') === '2025-06-30');
    await page.waitForLoadState('networkidle');

    await expect.poll(() => page.locator('text=مصروف حديث لفلتر التاريخ').count()).toBeGreaterThan(0);
    await expect.poll(() => page.locator('text=مصروف قديم لفلتر التاريخ').count()).toBe(0);
    await expect.poll(() => page.locator('text=عدد السجلات').locator('xpath=../..').innerText()).toContain('1');
    expect(session.consoleErrors).toEqual([]);
  });

  it('صفحة المدفوعات: الفلتر يحدّث "إجمالي المحصَّل" و"عدد الدفعات"', async () => {
    const page = session.page;
    await page.goto('/payments', { waitUntil: 'networkidle' });

    const [fromInput, toInput] = await page.locator('input[type="date"]').all();
    await fromInput.fill('2025-07-01');
    await page.waitForURL((u) => u.searchParams.get('from') === '2025-07-01');
    await toInput.fill('2025-07-31');
    await page.waitForURL((u) => u.searchParams.get('to') === '2025-07-31');
    await page.waitForLoadState('networkidle');

    await expect
      .poll(() =>
        page.locator('p', { hasText: 'عدد الدفعات' }).locator('xpath=following-sibling::p[1]').first().innerText(),
      )
      .toBe('1');
    await expect
      .poll(() =>
        page
          .locator('p', { hasText: 'إجمالي المحصَّل' })
          .locator('xpath=following-sibling::p[1]')
          .first()
          .innerText(),
      )
      .toContain('1,500.00');
    expect(session.consoleErrors).toEqual([]);
  });

  it('صفحة المهام: الفلتر يعمل على تاريخ الاستحقاق (dueDate) لا تاريخ الإنشاء', async () => {
    const page = session.page;
    await page.goto('/tasks', { waitUntil: 'networkidle' });
    await expect.poll(() => page.locator('text=مهمة استحقاقها قديم (فلتر التاريخ)').count()).toBeGreaterThan(0);
    await expect.poll(() => page.locator('text=مهمة استحقاقها حديث (فلتر التاريخ)').count()).toBeGreaterThan(0);

    const [fromInput, toInput] = await page.locator('input[type="date"]').all();
    await fromInput.fill('2025-08-01');
    await page.waitForURL((u) => u.searchParams.get('from') === '2025-08-01');
    await toInput.fill('2025-08-31');
    await page.waitForURL((u) => u.searchParams.get('to') === '2025-08-31');
    await page.waitForLoadState('networkidle');

    await expect.poll(() => page.locator('text=مهمة استحقاقها حديث (فلتر التاريخ)').count()).toBeGreaterThan(0);
    await expect.poll(() => page.locator('text=مهمة استحقاقها قديم (فلتر التاريخ)').count()).toBe(0);
    expect(session.consoleErrors).toEqual([]);
  });
});

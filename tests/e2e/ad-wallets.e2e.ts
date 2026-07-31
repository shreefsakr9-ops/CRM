import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { newSession, login, type Session } from './browser';
import { seedE2EData, prisma, USERS, type E2EData } from './fixtures';

/**
 * أرصدة إعلانات العملاء عبر متصفح حقيقي: إضافة رصيد، خصم جزء منه، والتأكد
 * أن الرصيد المتبقي يظهر صحيحًا في الجدول — والأهم: أن الحركة لا تُحرّك أي
 * رقم في القسم المالي العام (صافي الربح والمصروفات المباشرة).
 */

let data: E2EData;
let session: Session;

beforeAll(async () => {
  data = await seedE2EData();
  // الرصيد المتبقي تراكمي بتصميم — يجب ألا يتراكم بين تشغيلات هذا الملف نفسه.
  await prisma.adWalletTransaction.deleteMany({ where: { clientId: data.clientId } });
  session = await newSession();
  await login(session, USERS.admin);
}, 120_000);

afterAll(async () => {
  await session?.close();
  await prisma.$disconnect();
});

describe('أرصدة إعلانات العملاء', () => {
  it('إضافة رصيد ثم خصم جزء منه يعطي الرصيد المتبقي الصحيح ولا يغيّر صافي الربح', async () => {
    const page = session.page;

    await page.goto('/reports', { waitUntil: 'networkidle' });
    await page.click('button:has-text("المالية")');
    await page.waitForSelector('text=صافي الربح');

    const netProfitBefore = await page
      .locator('p', { hasText: 'صافي الربح' })
      .locator('xpath=following-sibling::p[1]')
      .first()
      .innerText();

    // إضافة رصيد ٣٬٠٠٠ جنيه للعميل التجريبي.
    await page.click('button:has-text("إضافة / خصم رصيد")');
    await page.waitForSelector('text=إضافة / خصم رصيد إعلانات');
    await page.selectOption('select[name="clientId"]', { label: 'اختبار المتصفح' });
    await page.selectOption('select[name="type"]', 'DEPOSIT');
    await page.fill('input[name="amount"]', '3000');
    await page.click('form button[type="submit"]');
    await page.waitForSelector('text=تم تسجيل الإيداع', { timeout: 15_000 });

    await page.click('button:has-text("المالية")');
    await page.waitForSelector('text=أرصدة إعلانات العملاء');
    let row = page.locator('tr', { hasText: 'اختبار المتصفح' });
    await expect.poll(() => row.innerText()).toContain('3,000.00');

    // خصم ١٬٢٠٠ جنيه — المتبقي المتوقَّع ١٬٨٠٠.
    await page.click('button:has-text("إضافة / خصم رصيد")');
    await page.waitForSelector('text=إضافة / خصم رصيد إعلانات');
    await page.selectOption('select[name="clientId"]', { label: 'اختبار المتصفح' });
    await page.selectOption('select[name="type"]', 'WITHDRAWAL');
    await page.fill('input[name="amount"]', '1200');
    await page.click('form button[type="submit"]');
    await page.waitForSelector('text=تم تسجيل الخصم', { timeout: 15_000 });

    await page.click('button:has-text("المالية")');
    await page.waitForSelector('text=أرصدة إعلانات العملاء');
    row = page.locator('tr', { hasText: 'اختبار المتصفح' });
    const rowText = await row.innerText();
    expect(rowText).toContain('1,800.00'); // الرصيد المتبقي: 3,000 - 1,200

    // صافي الربح المعروض في نفس الصفحة لم يتحرك رغم الحركتين.
    const netProfitAfter = await page
      .locator('p', { hasText: 'صافي الربح' })
      .locator('xpath=following-sibling::p[1]')
      .first()
      .innerText();
    expect(netProfitAfter).toBe(netProfitBefore);
  });

  it('تحذير واضح يظهر عند خصم مبلغ أكبر من الرصيد المتبقي', async () => {
    const page = session.page;
    await page.goto('/reports', { waitUntil: 'networkidle' });
    await page.click('button:has-text("المالية")');
    await page.waitForSelector('text=أرصدة إعلانات العملاء');

    await page.click('button:has-text("إضافة / خصم رصيد")');
    await page.waitForSelector('text=إضافة / خصم رصيد إعلانات');
    await page.selectOption('select[name="clientId"]', { label: 'اختبار المتصفح' });
    await page.selectOption('select[name="type"]', 'WITHDRAWAL');
    // الرصيد الحالي ١٬٨٠٠ من الاختبار السابق — نطلب خصم أكبر بكثير.
    await page.fill('input[name="amount"]', '50000');

    await page.waitForSelector('text=سيصبح رصيد');
  });
});

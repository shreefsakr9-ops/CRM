import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { newSession, login, type Session } from './browser';
import { seedE2EData, prisma, USERS, E2E_PASSWORD, type E2EData } from './fixtures';

/**
 * ثلاثة أخطاء حقيقية أُبلغ عنها في نظام الصلاحيات (RBAC)، مُختبرة عبر متصفح
 * حقيقي على نسخة إنتاج فعلية — لا عبر استدعاء الخدمة مباشرة:
 * ١) أدوار محدودة (صانع محتوى/مصمم) كانت ترى قسم «العمليات» في لوحة التحكم
 *    وصفحة «التقارير» رغم عدم استحقاقها ذلك.
 * ٢) لا توجد واجهة لمنح صلاحيات فردية إضافية فوق الدور.
 * ٣) إشعار الإشارة (@) كان يوجّه المُشار إليه لصفحة خطأ بدل السجل نفسه.
 */

let data: E2EData;

beforeAll(async () => {
  data = await seedE2EData();
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe('تقييد الرؤية حسب الدور الوظيفي (لوحة التحكم والتقارير)', () => {
  it('المصمم لا يرى قسم العمليات في لوحة التحكم ولا رابط التقارير في القائمة', async () => {
    const s = await newSession();
    try {
      await login(s, USERS.designer);
      await s.page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      const text = await s.page.locator('main').first().innerText();
      expect(text).not.toContain('العمليات');
      expect(text).not.toContain('توزيع الأحمال على الفريق');

      // الإخفاء تجميلي فقط — التحقق الحقيقي في الفحص التالي، لكنه يكشف خللًا
      // مختلفًا (رابط ميت) لو ظهر رغم عدم توفر الصفحة فعليًا.
      const reportsLink = s.page.locator('a[href="/reports"]');
      expect(await reportsLink.count()).toBe(0);
    } finally {
      await s.close();
    }
  });

  it('المصمم يُرفض عند فتح /reports مباشرةً عبر الرابط', async () => {
    const s = await newSession();
    try {
      await login(s, USERS.designer);
      const res = await s.page.goto('/reports', { waitUntil: 'domcontentloaded' });
      expect(res?.status()).toBeGreaterThanOrEqual(400);
      const text = await s.page.textContent('body');
      expect(text).not.toContain('التحصيلات');
    } finally {
      await s.close();
    }
  });

  it('مدير المبيعات (نطاق TEAM) يرى قسم العمليات والتقارير كالمعتاد', async () => {
    const s = await newSession();
    try {
      await login(s, USERS.admin);
      await s.page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      const text = await s.page.locator('main').first().innerText();
      expect(text).toContain('العمليات');

      const res = await s.page.goto('/reports', { waitUntil: 'domcontentloaded' });
      expect(res?.status()).toBeLessThan(400);
    } finally {
      await s.close();
    }
  });
});

describe('إشعار الإشارة (@) يوصل فعليًا للسجل لا لصفحة خطأ', () => {
  it('مصمم مُشار إليه في تعليق على مهمة خارج نطاقه يفتحها من الإشعار بنجاح', async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: USERS.admin } });
    const designer = await prisma.user.findUniqueOrThrow({ where: { email: USERS.designer } });

    // مهمة خارج نطاق المصمم تمامًا: لا مُنشئ ولا مُسند إليه.
    const task = await prisma.task.create({
      data: {
        title: 'مهمة اختبار الإشارة E2E',
        creatorId: admin.id,
        createdById: admin.id,
        status: 'TODO',
        priority: 'MEDIUM',
      },
    });

    const adminSession = await newSession();
    try {
      await login(adminSession, USERS.admin);
      await adminSession.page.goto(`/tasks/${task.id}`, { waitUntil: 'domcontentloaded' });

      await adminSession.page.fill('textarea', `انتبه يا @${designer.name} — مهم`);
      // اختيار المُشار إليه من قائمة «إشارة إلى…».
      await adminSession.page.selectOption('select:near(textarea)', { label: designer.name }).catch(
        async () => {
          // fallback: أول select يحوي اسم المصمم كخيار.
          const selects = adminSession.page.locator('select');
          const count = await selects.count();
          for (let i = 0; i < count; i++) {
            const opts = await selects.nth(i).locator('option').allTextContents();
            if (opts.includes(designer.name)) {
              await selects.nth(i).selectOption({ label: designer.name });
              break;
            }
          }
        },
      );
      await adminSession.page.getByRole('button', { name: 'إرسال' }).click();
      await adminSession.page.waitForTimeout(500);
    } finally {
      await adminSession.close();
    }

    // تحقّق أن الإشارة سُجّلت فعلًا قبل متابعة المصمم لها.
    const mention = await prisma.commentMention.findFirst({
      where: { userId: designer.id, comment: { entityType: 'TASK', entityId: task.id } },
    });
    expect(mention).toBeTruthy();

    const designerSession = await newSession();
    try {
      await login(designerSession, USERS.designer, E2E_PASSWORD);
      await designerSession.page.goto('/notifications', { waitUntil: 'domcontentloaded' });

      const notifLink = designerSession.page.locator(`a[href="/tasks/${task.id}"]`).first();
      await notifLink.waitFor({ state: 'visible', timeout: 15_000 });

      const res = await Promise.all([
        designerSession.page.waitForURL(`**/tasks/${task.id}`, { timeout: 15_000 }),
        notifLink.click(),
      ]);
      void res;

      // لا صفحة خطأ («تعذّر عرض هذه الصفحة») ولا 404 — بل محتوى المهمة نفسها.
      const body = await designerSession.page.textContent('body');
      expect(body).not.toContain('تعذّر عرض هذه الصفحة');
      expect(body).toContain('مهمة اختبار الإشارة E2E');
    } finally {
      await designerSession.close();
    }
  });
});

describe('صلاحيات إضافية فردية من واجهة الإدارة', () => {
  it('الأدمن يمنح صلاحية إضافية لمستخدم من صفحة /users وتُحفظ فعليًا', async () => {
    const designer = await prisma.user.findUniqueOrThrow({ where: { email: USERS.designer } });

    const s = await newSession();
    try {
      await login(s, USERS.admin);
      await s.page.goto('/users', { waitUntil: 'domcontentloaded' });

      const row = s.page.locator('tr', { hasText: designer.name }).first();
      await row.getByTitle('صلاحيات إضافية فوق الدور').click();

      await s.page.waitForSelector('text=صلاحيات إضافية مستقلة عن دور', { timeout: 10_000 });

      // أول خلية فارغة (بدون تخصيص) في وحدة reports/action=view — نمنحها هنا.
      // exact:true لازم — aria-label لخلايا أخرى (عرض البيانات المالية، عرض
      // التكلفة والربح) يبدأ بنفس النص فيطابقه Playwright جزئيًا بدونه.
      const cellButton = s.page.getByLabel('التقارير — عرض', { exact: true });
      await cellButton.click(); // بدون تخصيص → منح
      await s.page.getByRole('button', { name: /حفظ الصلاحيات الإضافية/ }).click();
      await s.page.waitForSelector('text=تم حفظ الصلاحيات الإضافية', { timeout: 10_000 });
    } finally {
      await s.close();
    }

    const override = await prisma.userPermissionOverride.findFirst({
      where: { userId: designer.id, module: 'reports', action: 'view', allow: true },
    });
    expect(override).toBeTruthy();

    // تنظيف — لا يؤثر على اختبارات أخرى.
    await prisma.userPermissionOverride.deleteMany({ where: { userId: designer.id } });
  });
});

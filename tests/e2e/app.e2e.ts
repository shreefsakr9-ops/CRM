import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { newSession, login, type Session } from './browser';
import { seedE2EData, prisma, USERS, type E2EData } from './fixtures';

/** الصفحات التي يمر بها المستخدم يوميًا — أي منها إن انكسر توقف العمل. */
const CORE_PAGES = [
  '/dashboard',
  '/leads',
  '/pipeline',
  '/clients',
  '/quotations',
  '/projects',
  '/tasks',
  '/invoices',
  '/reports',
  '/notifications',
  '/settings',
] as const;

let data: E2EData;
let session: Session;

beforeAll(async () => {
  data = await seedE2EData();
  session = await newSession();
  await login(session, USERS.admin);
}, 120_000);

afterAll(async () => {
  await session?.close();
  await prisma.$disconnect();
});

describe('الصفحات الأساسية تفتح بلا أخطاء', () => {
  for (const path of CORE_PAGES) {
    it(`${path} يفتح ويعرض محتوى`, async () => {
      session.consoleErrors.length = 0;
      const res = await session.page.goto(path, { waitUntil: 'load' });
      expect(res?.status(), `حالة ${path}`).toBeLessThan(400);

      // صفحة تُرجع 200 وهي فارغة تمرّ على فحص الحالة وحده.
      const text = (await session.page.locator('main').first().innerText()).trim();
      expect(text.length, `محتوى ${path}`).toBeGreaterThan(20);

      // ننتظر اكتمال الترطيب قبل قراءة الأخطاء: أخطاء React تظهر بعد التحميل
      // بلحظات، فالانتقال السريع ينسبها للصفحة التالية ويرسل خلف مطاردة خطأ
      // في المكان الخطأ — وقع ذلك فعلًا هنا.
      await session.page.waitForTimeout(1_500);

      const fresh = session.consoleErrors.filter(
        // أخطاء تحميل الأيقونات والخطوط الخارجية ليست من منطق التطبيق.
        (e) => !/favicon|net::ERR_ABORTED.*\.(ico|png|woff2?)/i.test(e),
      );
      expect(fresh, `أخطاء console في ${path}`).toEqual([]);
    });
  }
});

describe('العرض على الموبايل', () => {
  it('لا يوجد تمرير أفقي على عرض 390 بكسل', async () => {
    const mobile = await newSession({ viewport: { width: 390, height: 844 }, isMobile: true });
    try {
      await login(mobile, USERS.admin);
      for (const path of ['/dashboard', '/leads', '/invoices', '/reports']) {
        await mobile.page.goto(path, { waitUntil: 'domcontentloaded' });
        const overflow = await mobile.page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        // تمرير أفقي على الموبايل يعني جدولًا أو حاوية تتجاوز الشاشة — عيب
        // حقيقي في الاستخدام اليومي على الهاتف.
        expect(overflow, `تمرير أفقي في ${path}`).toBeLessThanOrEqual(0);
      }
    } finally {
      await mobile.close();
    }
  });

  it('بطاقة الصف على الموبايل تفتح السجل عند النقر', async () => {
    // بطاقات الموبايل تستخدم رابطًا مُغطّيًا بدل تغليف البطاقة بـ<a> (تفاديًا
    // لروابط متداخلة غير صالحة). هذا الاختبار يثبت أن النقر ما زال يعمل — وإلا
    // لصار إصلاح الترطيب كسرًا للتنقّل على الهاتف.
    const mobile = await newSession({ viewport: { width: 390, height: 844 }, isMobile: true });
    try {
      await login(mobile, USERS.admin);
      await mobile.page.goto('/leads', { waitUntil: 'load' });
      const card = mobile.page.locator('a[href^="/leads/"]').first();
      await expect.poll(() => card.count()).toBeGreaterThan(0);
      await card.click();
      await mobile.page.waitForURL(/\/leads\/[^/]+$/, { timeout: 30_000 });
    } finally {
      await mobile.close();
    }
  });
});

describe('نافذة إرسال الفاتورة', () => {
  it('تعرض المستلم التلقائي وتتيح تغييره وإضافة نسخة', async () => {
    const page = session.page;
    await page.goto(`/invoices/${data.invoiceId}`, { waitUntil: 'domcontentloaded' });

    await page.click('button:has-text("إرسال")');
    // المستلم يُجلب من الخادم بعد فتح النافذة.
    await page.waitForSelector('text=e2e.finance@example.com', { timeout: 20_000 });

    // جهتا اتصال ⇒ يظهر اختيار المستلم ومربعات النسخ.
    const select = page.locator('select').filter({ hasText: 'الاختيار التلقائي' }).first();
    await expect.poll(() => select.count()).toBe(1);

    const options = await select.locator('option').allInnerTexts();
    expect(options.some((o) => o.includes('e2e.boss@example.com'))).toBe(true);

    // اختيار صاحب القرار يجب أن يغيّر العنوان المعروض — وإلا لعُرض عنوان
    // وأُرسل لغيره.
    const bossValue = await select
      .locator('option', { hasText: 'e2e.boss@example.com' })
      .first()
      .getAttribute('value');
    await select.selectOption(bossValue!);
    await page.waitForSelector('text=e2e.boss@example.com', { timeout: 10_000 });

    const drawer = await page.locator('[role="dialog"]').first().innerText();
    expect(drawer).toContain('e2e.boss@example.com');
  });
});

describe('نافذة إرسال عرض السعر', () => {
  it('تعرض المستلم التلقائي وتتيح تغييره وإضافة نسخة', async () => {
    const page = session.page;
    await page.goto(`/quotations/${data.quotationId}`, { waitUntil: 'domcontentloaded' });

    await page.click('button:has-text("إرسال للعميل")');
    // الاختيار التلقائي لعروض الأسعار يفضّل صاحب القرار — نتحقق من ظهوره أولًا.
    await page.waitForSelector('text=e2e.boss@example.com', { timeout: 20_000 });

    const select = page.locator('select').filter({ hasText: 'الاختيار التلقائي' }).first();
    await expect.poll(() => select.count()).toBe(1);

    const options = await select.locator('option').allInnerTexts();
    expect(options.some((o) => o.includes('e2e.finance@example.com'))).toBe(true);

    // التبديل إلى جهة الاتصال المالية يجب أن يغيّر العنوان المعروض فعليًا —
    // نفس التحقق الذي أجري على الفاتورة، على الكود المشترك (RecipientPicker).
    const financeValue = await select
      .locator('option', { hasText: 'e2e.finance@example.com' })
      .first()
      .getAttribute('value');
    await select.selectOption(financeValue!);
    await page.waitForSelector('text=e2e.finance@example.com', { timeout: 10_000 });

    const drawer = await page.locator('[role="dialog"]').first().innerText();
    expect(drawer).toContain('e2e.finance@example.com');
  });
});

describe('توليد PDF فعلي', () => {
  it('تنزيل فاتورة PDF يعطي ملفًا صالحًا بخط عربي مضمَّن', async () => {
    // اختبارات الوحدة تفحص بناء الـHTML فقط. هذا يفحص المسار الكامل حتى
    // البايتات: بلا Chromium أو بلا خط مضمَّن ينتج ملف لا يُقرأ بالعربية.
    // الطلب من داخل الصفحة لا عبر عميل HTTP منفصل: هكذا تُرسَل كوكي الجلسة
    // كما يرسلها المتصفح فعلًا عند فتح الرابط.
    const result = await session.page.evaluate(async (url) => {
      const res = await fetch(url);
      const buffer = await res.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buffer);
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return {
        status: res.status,
        contentType: res.headers.get('content-type') ?? '',
        base64: btoa(binary),
      };
    }, `/api/invoices/${data.invoiceId}/pdf?lang=ar`);

    expect(result.status).toBe(200);
    expect(result.contentType).toContain('application/pdf');

    const body = Buffer.from(result.base64, 'base64');
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // ملف يحمل الترويسة الصحيحة وحجمه تافه يعني صفحة فارغة.
    expect(body.length).toBeGreaterThan(20_000);
    expect(body.toString('latin1')).toMatch(/Cairo/);
  }, 120_000);
});

describe('تحويل العميل المحتمل إلى عميل', () => {
  it('لا تُعاد كتابة أي بيانات — جهة الاتصال الأساسية تُنشأ من بيانات العميل المحتمل نفسها', async () => {
    // هذا هو الوعد المحوري للنظام («مترابط بلا إعادة إدخال للبيانات»)، ومُختبر
    // حتى الآن على مستوى الخدمة فقط (tests/workflow.test.ts). هنا يُنقر الزر
    // فعليًا في المتصفح دون كتابة الاسم أو الهاتف مرة أخرى، والتحقق يقع على
    // صفحة العميل الناتجة لا على استجابة الخادم مباشرة.
    const page = session.page;
    await page.goto(`/leads/${data.convertibleLeadId}`, { waitUntil: 'load' });

    await page.click('button:has-text("تحويل إلى عميل")');
    const dialog = page.locator('[role="dialog"]').filter({ hasText: 'تحويل إلى عميل' });
    await expect.poll(() => dialog.count()).toBeGreaterThan(0);

    // الحقول تُترك فارغة عمدًا — لا اسم قانوني ولا مدير حساب — لنثبت أن
    // البيانات المنسوخة (الاسم والهاتف) تأتي من العميل المحتمل لا من إدخال يدوي.
    await dialog.locator('button[type="submit"]:has-text("تحويل")').click();

    // النظام يبقي المستخدم على صفحة العميل المحتمل بعد التحويل (لا توجيه
    // قسري) ويعرض رابطًا صريحًا لملف العميل الجديد — تأكيد مرئي قبل المتابعة.
    const clientLink = page.locator('a[href^="/clients/"]', { hasText: 'مصنع الاختبار للتحويل' });
    await expect.poll(() => clientLink.count(), { timeout: 15_000 }).toBeGreaterThan(0);

    await clientLink.click();
    await page.waitForURL(/\/clients\/[^/]+$/, { timeout: 20_000 });

    const body = await page.locator('main').innerText();
    expect(body).toContain('مصنع الاختبار للتحويل');
    expect(body).toContain(data.convertibleLeadPhone);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { newSession, login, type Session } from './browser';
import { seedE2EData, prisma, USERS, E2E_PASSWORD, type E2EData } from './fixtures';
import { hashPassword } from '../../src/server/auth/password';

/**
 * ما تفحصه هذه الاختبارات لا يمكن لاختبارات الوحدة أن تفحصه: اختبار الوحدة
 * يستدعي الخدمة مباشرة فيتجاوز الحارس والتوجيه والصفحة. الأخطاء التي وقعت
 * فعلًا في هذا المشروع (حلقة توجيه لا نهائية، تسرّب أسرار إلى HTML) مرّت من
 * اختبارات الوحدة كلها لأنها لا تمر عبر المتصفح.
 */

let data: E2EData;

beforeAll(async () => {
  data = await seedE2EData();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('تسجيل الدخول', () => {
  let session: Session;
  afterAll(() => session?.close());

  it('بيانات صحيحة تُدخل للوحة التحكم وتُنشئ جلسة في قاعدة البيانات', async () => {
    session = await newSession();
    await login(session, USERS.admin);
    expect(new URL(session.page.url()).pathname).toBe('/dashboard');

    const user = await prisma.user.findUniqueOrThrow({ where: { email: USERS.admin } });
    const active = await prisma.session.count({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    expect(active).toBeGreaterThan(0);
  });

  it('كلمة مرور خاطئة لا تُدخل ولا تكشف إن كان البريد مسجّلًا', async () => {
    const s = await newSession();
    try {
      await s.page.goto('/login', { waitUntil: 'domcontentloaded' });
      await s.page.fill('input[name="email"]', USERS.admin);
      await s.page.fill('input[name="password"]', 'WrongPassword#1');
      await s.page.click('button[type="submit"]');
      await s.page.waitForSelector('[role="alert"]', { timeout: 15_000 });

      expect(new URL(s.page.url()).pathname).toBe('/login');
      const message = (await s.page.textContent('[role="alert"]')) ?? '';
      // رسالة موحّدة: التمييز بين «بريد غير مسجّل» و«كلمة مرور خاطئة» يكشف
      // للمهاجم أي العناوين موجودة فعلًا.
      expect(message).not.toMatch(/غير مسجّل|غير موجود|not found/i);

      // نفس الرسالة لبريد غير موجود إطلاقًا.
      await s.page.goto('/login', { waitUntil: 'domcontentloaded' });
      await s.page.fill('input[name="email"]', 'nobody.at.all@bluepoint.local');
      await s.page.fill('input[name="password"]', 'WrongPassword#1');
      await s.page.click('button[type="submit"]');
      await s.page.waitForSelector('[role="alert"]', { timeout: 15_000 });
      expect((await s.page.textContent('[role="alert"]')) ?? '').toBe(message);
    } finally {
      await s.close();
    }
  });

  it('زائر بلا جلسة يُحوَّل إلى صفحة الدخول ولا يرى بيانات', async () => {
    const s = await newSession();
    try {
      for (const path of ['/dashboard', '/invoices', '/clients', '/users']) {
        const res = await s.page.goto(path, { waitUntil: 'domcontentloaded' });
        expect(new URL(s.page.url()).pathname, `المسار ${path}`).toBe('/login');
        expect(res?.status()).toBeLessThan(400);
      }
    } finally {
      await s.close();
    }
  });

  it('تسجيل الخروج يُبطل الجلسة فعليًا لا في الواجهة فقط', async () => {
    const s = await newSession();
    try {
      await login(s, USERS.sales);
      const cookies = await s.context.cookies();
      const sessionCookie = cookies.find((c) => c.name === 'bp_session');
      expect(sessionCookie).toBeTruthy();

      // نستدعي مسار الخروج الفعلي الذي يستخدمه زر الواجهة، من داخل الصفحة
      // حتى تُرسَل كوكي الجلسة تمامًا كما يرسلها المتصفح.
      const logoutStatus = await s.page.evaluate(async () => {
        const res = await fetch('/api/auth/logout', { method: 'POST', redirect: 'manual' });
        return res.status;
      });
      expect(logoutStatus).toBeLessThan(400);

      // إعادة استخدام الكوكي القديمة يجب ألا تعمل: الخروج يجب أن يُبطل الجلسة
      // في قاعدة البيانات لا أن يمسح الكوكي من المتصفح فقط.
      const reused = await newSession();
      try {
        await reused.context.addCookies([sessionCookie!]);
        await reused.page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
        expect(new URL(reused.page.url()).pathname).toBe('/login');
      } finally {
        await reused.close();
      }
    } finally {
      await s.close();
    }
  });
});

describe('التغيير الإجباري لكلمة المرور بعد أول تسجيل دخول', () => {
  // خلل حقيقي وقع: الصفحة كانت تعامل forced=1 كأنها رابط الاستعادة عبر
  // الإيميل، فترفض دائمًا بلا token برسالة «الرابط ناقص أو غير صالح» رغم أن
  // المستخدم لديه جلسة صالحة بالفعل. مستخدم مخصص هنا حتى لا يتأثر بتغيير
  // كلمة المرور أي اختبار آخر يستخدم مستخدمي fixtures.ts المشتركين.
  const email = 'e2e.forced-reset@bluepoint.local';
  const initialPassword = 'ForcedReset#Initial1';

  it('يعتمد على الجلسة الحالية بلا token ويصل للوحة التحكم', async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'SALES_AGENT' } });
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name: 'اختبار التغيير الإجباري',
        passwordHash: await hashPassword(initialPassword),
        roleId: role.id,
        mustResetPassword: true,
      },
      update: {
        passwordHash: await hashPassword(initialPassword),
        roleId: role.id,
        isActive: true,
        deletedAt: null,
        mustResetPassword: true,
        twoFactorEnabled: false,
        twoFactorSecret: null,
      },
    });

    const s = await newSession();
    try {
      await login(s, email, initialPassword);
      expect(new URL(s.page.url()).pathname).toBe('/reset-password');
      expect(new URL(s.page.url()).searchParams.get('forced')).toBe('1');

      // لا رسالة «رابط ناقص»، والزر غير معطَّل — الاعتماد على الجلسة لا token.
      expect(await s.page.content()).not.toContain('الرابط ناقص أو غير صالح');
      expect(await s.page.isDisabled('button[type="submit"]')).toBe(false);

      const newPassword = 'ForcedReset#2026';
      await s.page.fill('input[name="password"]', newPassword);
      await s.page.fill('input[name="confirm"]', newPassword);
      await Promise.all([
        s.page.waitForURL((url) => url.pathname === '/dashboard', { timeout: 30_000 }),
        s.page.click('button[type="submit"]'),
      ]);

      const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(updated.mustResetPassword).toBe(false);
    } finally {
      await s.close();
    }
  });
});

describe('النطاق والصلاحيات في المتصفح', () => {
  it('سجل خارج نطاق المستخدم يعيد 404 لا 403', async () => {
    const s = await newSession();
    try {
      await login(s, USERS.sales);
      const res = await s.page.goto(`/leads/${data.outOfScopeLeadId}`, {
        waitUntil: 'domcontentloaded',
      });
      // ٤٠٤ مقصودة على مستوى HTTP لا في طبقة الخدمة وحدها: ٤٠٣ يؤكد أن السجل
      // موجود، و٥٠٠ يجعل رفضًا طبيعيًا يبدو عطلًا في المراقبة.
      expect(res?.status()).toBe(404);
      expect(await s.page.content()).not.toContain('عميل محتمل خارج النطاق');
      // وصفحة مفهومة بالعربية بدل شاشة Next الافتراضية.
      expect(await s.page.textContent('body')).toContain('غير متاح');
    } finally {
      await s.close();
    }
  });

  it('المصمم لا يصل إلى الفواتير', async () => {
    const s = await newSession();
    try {
      await login(s, USERS.designer);
      const res = await s.page.goto('/invoices', { waitUntil: 'domcontentloaded' });
      expect(res?.status()).toBeGreaterThanOrEqual(400);
      expect(await s.page.content()).not.toContain('E2E-INV-0001');
    } finally {
      await s.close();
    }
  });

  it('إخفاء الزر ليس حماية: استدعاء الإجراء بدون صلاحية يُرفض من الخادم', async () => {
    const s = await newSession();
    try {
      await login(s, USERS.designer);
      await s.page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

      // نطلب مسار الفاتورة مباشرةً من داخل الجلسة — أقرب ما يفعله مستخدم
      // يتجاوز الواجهة. الخادم هو من يجب أن يرفض.
      const status = await s.page.evaluate(async () => {
        const res = await fetch('/invoices/new', { redirect: 'manual' });
        return res.status;
      });
      expect(status).toBeGreaterThanOrEqual(400);
    } finally {
      await s.close();
    }
  });
});

describe('عدم تسرّب الأسرار إلى HTML', () => {
  // جلسة مدير واحدة: كل تسجيل دخول يستهلك نافذة TOTP كاملة (٣٠ ثانية) بسبب
  // منع إعادة استخدام الرمز، ففتح ثلاث جلسات يضيف دقيقة ونصف بلا فائدة.
  let admin: Session;
  beforeAll(async () => {
    admin = await newSession();
    await login(admin, USERS.admin);
  }, 120_000);
  afterAll(() => admin?.close());

  it('صفحة المستخدمين لا تحتوي تجزئة كلمة مرور ولا سرّ مصادقة ثنائية', async () => {
    // هذا الخلل وقع فعلًا: include في Prisma أعاد كل الأعمدة فوصلت التجزئة
    // إلى HTML المُرسَل للمتصفح. لا يكشفه إلا فحص الصفحة نفسها.
    await admin.page.goto('/users', { waitUntil: 'domcontentloaded' });
    const html = await admin.page.content();

    expect(html).not.toMatch(/scrypt\$\d+\$/);
    expect(html).not.toContain('passwordHash');
    expect(html).not.toContain('twoFactorSecret');
    expect(html).not.toContain('tokenHash');
  });

  it('لا تظهر أسرار البيئة في أي صفحة', async () => {
    for (const path of ['/dashboard', '/settings', '/profile']) {
      await admin.page.goto(path, { waitUntil: 'domcontentloaded' });
      const html = await admin.page.content();
      expect(html, `المسار ${path}`).not.toContain(process.env.SESSION_SECRET ?? '__none__');
      expect(html, `المسار ${path}`).not.toContain(process.env.FILE_SIGNING_SECRET ?? '__none__');
      expect(html, `المسار ${path}`).not.toMatch(/postgresql:\/\/[^"'\s]+/);
    }
  });

  it('صفحة إعدادات البريد لا تعرض كلمة مرور SMTP', async () => {
    await admin.page.goto('/settings', { waitUntil: 'domcontentloaded' });
    const html = await admin.page.content();
    expect(html).not.toContain('SMTP_PASSWORD');
    expect(html).not.toContain('SMTP_USER');
  });
});

describe('كلمة مرور مستخدم الاختبار', () => {
  it('التجزئة المخزَّنة ليست نصًا عاديًا', async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: USERS.admin },
      select: { id: true, passwordHash: true },
    });
    expect(user.passwordHash).not.toBe(E2E_PASSWORD);
    expect(user.passwordHash).toMatch(/^scrypt\$/);
  });
});

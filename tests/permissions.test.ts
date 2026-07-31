import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mockSession, actAs, createTestUser, prisma, resetBusinessData } from './helpers';

mockSession();

const { listLeads, createLead, getLead } = await import('@/server/services/leads');
const { listInvoices, createInvoice } = await import('@/server/services/invoices');
const { getProject, createProject, updateProject } = await import('@/server/services/projects');
const { getClient, createClient } = await import('@/server/services/clients');
const { getTask, createTask, addComment } = await import('@/server/services/tasks');
const { getQuotation, createQuotation } = await import('@/server/services/quotations');
const { buildDashboard } = await import('@/server/services/dashboard');
const { AppError } = await import('@/server/auth/guard');
const {
  listUsers,
  getUserPermissionOverrides,
  updateUserPermissionOverrides,
} = await import('@/server/services/users');
// عميل التطبيق نفسه (لا عميل الاختبارات) لأن إعداد الحذف مضبوط عليه.
const { prisma: appPrisma } = await import('@/server/db');

const SALES1 = 'test.sales1@bluepoint.local';
const SALES2 = 'test.sales2@bluepoint.local';
const MANAGER = 'test.salesmgr@bluepoint.local';
const DESIGNER = 'test.designer@bluepoint.local';
const FINANCE = 'test.finance@bluepoint.local';
const ADMIN = 'test.admin@bluepoint.local';
const VIEWER = 'test.viewer@bluepoint.local';

let leadOfSales1 = '';
let clientId = '';
let projectId = '';

beforeAll(async () => {
  await resetBusinessData();
  await createTestUser({ email: ADMIN, name: 'مدير النظام', roleKey: 'SUPER_ADMIN' });
  await createTestUser({ email: MANAGER, name: 'مدير المبيعات', roleKey: 'SALES_MANAGER' });
  await createTestUser({ email: SALES1, name: 'مندوب ١', roleKey: 'SALES_AGENT', managerEmail: MANAGER });
  await createTestUser({ email: SALES2, name: 'مندوب ٢', roleKey: 'SALES_AGENT', managerEmail: MANAGER });
  await createTestUser({ email: DESIGNER, name: 'مصمم', roleKey: 'GRAPHIC_DESIGNER' });
  await createTestUser({ email: FINANCE, name: 'مالية', roleKey: 'FINANCE' });
  await createTestUser({ email: VIEWER, name: 'مشاهد', roleKey: 'VIEWER' });

  // بيانات أساسية ينشئها المدير
  await actAs(ADMIN);
  const client = await createClient({
    legalName: 'عميل الاختبار',
    type: 'COMPANY',
    currency: 'EGP',
    status: 'ACTIVE',
  } as never);
  clientId = client.id;

  const project = await createProject({
    name: 'مشروع الاختبار',
    clientId,
    startDate: new Date().toISOString(),
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    budget: 10000,
    currency: 'EGP',
    progressMode: 'TASKS',
    progressPercent: 0,
    memberIds: [],
    serviceIds: [],
  } as never);
  projectId = project.id;

  // Lead يخص المندوب الأول
  await actAs(SALES1);
  const lead = await createLead({
    fullName: 'عميل محتمل خاص بالمندوب الأول',
    phone: '01000000001',
    estimatedValue: 5000,
    currency: 'EGP',
    priority: 'MEDIUM',
    score: 10,
    nextFollowUpAt: new Date(Date.now() + 86_400_000).toISOString(),
  } as never);
  leadOfSales1 = lead.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('نطاق البيانات (OWN / TEAM / ALL)', () => {
  it('مندوب المبيعات يرى سجلاته فقط', async () => {
    await actAs(SALES1);
    const mine = await listLeads({});
    expect(mine.rows.map((r) => r.id)).toContain(leadOfSales1);

    await actAs(SALES2);
    const others = await listLeads({});
    expect(others.rows.map((r) => r.id)).not.toContain(leadOfSales1);
  });

  it('مدير المبيعات يرى سجلات فريقه', async () => {
    await actAs(MANAGER);
    const teamLeads = await listLeads({});
    expect(teamLeads.rows.map((r) => r.id)).toContain(leadOfSales1);
  });

  it('فتح سجل خارج النطاق عبر معرّفه المباشر يعيد 404 وليس 403', async () => {
    await actAs(SALES2);
    // العميل أنشأه المدير ولا يخص المندوب الثاني
    await expect(getClient(clientId)).rejects.toMatchObject({ status: 404 });
  });
});

describe('حجب البيانات المالية', () => {
  it('مندوب المبيعات لا يرى تكاليف وأرباح المشروع', async () => {
    await actAs(SALES1);
    // المشروع خارج نطاقه أصلًا — نتحقق من الحجب عبر مستخدم داخل النطاق
    await actAs(ADMIN);
    await prisma.projectMember.create({ data: { projectId, userId: (await actAs(SALES1)).id } });

    await actAs(SALES1);
    const project = await getProject(projectId);
    expect(project.showProfit).toBe(false);
    expect(project.finance).toBeNull(); // لا يملك projects.view_financial
    expect(JSON.stringify(project)).not.toMatch(/profitMinor/);
  });

  it('المالية ترى الأرقام المالية للمشروع', async () => {
    await actAs(FINANCE);
    const project = await getProject(projectId);
    expect(project.finance).not.toBeNull();
    expect(project.finance?.invoicedMinor).toBeDefined();
  });
});

describe('منع الوصول غير المصرح به', () => {
  it('المصمم لا يستطيع عرض الفواتير', async () => {
    await actAs(DESIGNER);
    await expect(listInvoices({})).rejects.toMatchObject({ status: 403 });
  });

  it('المالية لا تستطيع تعديل محتوى المشروع', async () => {
    await actAs(FINANCE);
    await expect(
      updateProject(projectId, {
        name: 'محاولة تعديل',
        clientId,
        startDate: new Date().toISOString(),
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        budget: 0,
        currency: 'EGP',
        progressMode: 'TASKS',
        progressPercent: 0,
        memberIds: [],
        serviceIds: [],
      } as never),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('المشاهد لا يستطيع الإنشاء', async () => {
    await actAs(VIEWER);
    await expect(
      createLead({
        fullName: 'محاولة إنشاء',
        estimatedValue: 0,
        currency: 'EGP',
        priority: 'MEDIUM',
        score: 0,
      } as never),
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      createInvoice({
        clientId,
        issueDate: new Date().toISOString(),
        dueDate: new Date().toISOString(),
        currency: 'EGP',
        items: [{ nameAr: 'بند', quantity: 1, unitPrice: 100 }],
      } as never),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('المستخدم غير المسجل يتلقى 401', async () => {
    const { clearUser } = await import('./helpers');
    clearUser();
    await expect(listLeads({})).rejects.toMatchObject({ status: 401 });
    await actAs(ADMIN);
  });
});

describe('الحذف الناعم والاسترجاع', () => {
  it('السجل المحذوف يختفي من القوائم ويمكن استرجاعه', async () => {
    const { softDeleteLead, restoreLead } = await import('@/server/services/leads');
    await actAs(ADMIN);

    const lead = await createLead({
      fullName: 'عميل للحذف',
      phone: '01000000099',
      estimatedValue: 0,
      currency: 'EGP',
      priority: 'LOW',
      score: 0,
      nextFollowUpAt: new Date(Date.now() + 86_400_000).toISOString(),
    } as never);

    await softDeleteLead(lead.id);
    const afterDelete = await listLeads({});
    expect(afterDelete.rows.map((r) => r.id)).not.toContain(lead.id);

    const deletedList = await listLeads({ filter: 'deleted' });
    expect(deletedList.rows.map((r) => r.id)).toContain(lead.id);

    await restoreLead(lead.id);
    const afterRestore = await listLeads({});
    expect(afterRestore.rows.map((r) => r.id)).toContain(lead.id);
  });
});

describe('سجل التدقيق', () => {
  it('يسجّل الإنشاء والحذف بقيم واضحة', async () => {
    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'LEAD', entityId: leadOfSales1 },
    });
    expect(logs.some((l) => l.action === 'CREATE')).toBe(true);
  });

  it('لا يسجّل كلمات المرور أو الأسرار', async () => {
    const logs = await prisma.auditLog.findMany({ take: 200 });
    const dump = JSON.stringify(logs);
    expect(dump).not.toMatch(/passwordHash/);
    expect(dump).not.toMatch(/scrypt\$/);
  });
});

describe('كشف التكرار', () => {
  it('يمنع إنشاء عميل محتمل بنفس رقم الهاتف', async () => {
    await actAs(ADMIN);
    await expect(
      createLead({
        fullName: 'تكرار',
        phone: '01000000001',
        estimatedValue: 0,
        currency: 'EGP',
        priority: 'LOW',
        score: 0,
        nextFollowUpAt: new Date(Date.now() + 86_400_000).toISOString(),
      } as never),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('يسمح بالإنشاء عند التأكيد الصريح رغم التكرار', async () => {
    await actAs(ADMIN);
    const lead = await createLead(
      {
        fullName: 'تكرار مؤكَّد',
        phone: '01000000001',
        estimatedValue: 0,
        currency: 'EGP',
        priority: 'LOW',
        score: 0,
        nextFollowUpAt: new Date(Date.now() + 86_400_000).toISOString(),
      } as never,
      { allowDuplicate: true },
    );
    expect(lead.id).toBeTruthy();
  });
});

describe('حذف الأسرار افتراضيًا من طبقة البيانات', () => {
  /**
   * الحماية البنيوية: عميل Prisma يحذف الأسرار من كل استعلام، فلا يعود منع
   * التسريب معتمدًا على تذكّر كتابة `select` في كل مرة.
   */
  it('الاستعلام العادي لا يعيد hash كلمة المرور ولا سر المصادقة الثنائية', async () => {
    const user = await appPrisma.user.findFirstOrThrow({ where: { email: ADMIN } });
    expect('passwordHash' in user).toBe(false);
    expect('twoFactorSecret' in user).toBe(false);
  });

  it('الجلسات ورموز الاسترجاع لا تعيد قيم الـhash', async () => {
    const session = await appPrisma.session.findFirst();
    if (session) expect('tokenHash' in session).toBe(false);
    const recovery = await appPrisma.twoFactorRecoveryCode.findFirst();
    if (recovery) expect('codeHash' in recovery).toBe(false);
  });

  it('العلاقات المتداخلة محذوفة أيضًا فلا يتسرّب السر عبر include', async () => {
    const withUser = await appPrisma.session.findFirst({ include: { user: true } });
    if (withUser) expect('passwordHash' in withUser.user).toBe(false);
  });

  it('طبقة المصادقة تستطيع طلب السر صراحةً عند الحاجة', async () => {
    const user = await appPrisma.user.findFirstOrThrow({
      where: { email: ADMIN },
      omit: { passwordHash: false },
    });
    expect(user.passwordHash).toContain('scrypt$');
  });
});

describe('تسريب الحقول الحساسة', () => {
  /**
   * `include` في Prisma يعيد كل الأعمدة، ونتيجة `listUsers` تُمرَّر إلى مكوّن عميل
   * فتُسلسَل داخل صفحة HTML. هذا الاختبار يمنع عودة التسريب بصمت.
   */
  it('قائمة المستخدمين لا تحمل كلمات المرور ولا أسرار المصادقة الثنائية', async () => {
    await actAs(ADMIN);
    const users = await listUsers({});
    expect(users.length).toBeGreaterThan(0);

    // salesTargetMinor من نوع BigInt، لذلك نحوّله أثناء التسلسل.
    const serialized = JSON.stringify(users, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    for (const field of [
      'passwordHash',
      'scrypt$',
      'twoFactorSecret',
      'twoFactorLastStep',
      'failedLoginCount',
      'lockedUntil',
    ]) {
      expect(serialized).not.toContain(field);
    }
  });

  it('قائمة المستخدمين تحمل الحقول التي تحتاجها الواجهة فعلًا', async () => {
    await actAs(ADMIN);
    const [first] = await listUsers({});
    expect(first).toMatchObject({
      id: expect.any(String),
      email: expect.any(String),
      twoFactorEnabled: expect.any(Boolean),
    });
    expect(first?.role?.nameAr).toBeTruthy();
  });
});

describe('سجل التدقيق إضافة فقط (مفروض من قاعدة البيانات)', () => {
  /**
   * كان المنع اصطلاحًا: لا يوجد كود يعدّل السجل، لكن لا شيء يمنعه فعلًا.
   * المشغّل يفرضه حتى على مالك الجداول، فلا يستطيع خطأ برمجي ولا وصول مباشر
   * لقاعدة البيانات طمس الأثر.
   */
  it('يرفض تعديل أي سجل تدقيق', async () => {
    const log = await appPrisma.auditLog.findFirstOrThrow();
    await expect(
      appPrisma.auditLog.update({ where: { id: log.id }, data: { summary: 'محاولة طمس' } }),
    ).rejects.toThrow(/append-only/);
  });

  it('يرفض حذف أي سجل تدقيق', async () => {
    const log = await appPrisma.auditLog.findFirstOrThrow();
    await expect(appPrisma.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(
      /append-only/,
    );
  });

  it('يرفض الحذف الجماعي', async () => {
    await expect(appPrisma.auditLog.deleteMany({})).rejects.toThrow(/append-only/);
  });

  it('يرفض TRUNCATE الذي يتجاوز مشغّلات الصفوف', async () => {
    await expect(appPrisma.$executeRawUnsafe('TRUNCATE TABLE "audit_logs"')).rejects.toThrow(
      /append-only/,
    );
  });

  it('الإضافة تبقى مسموحة', async () => {
    const before = await appPrisma.auditLog.count();
    await appPrisma.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'users',
        entityType: 'USER',
        entityId: 'test-append',
        summary: 'اختبار الإضافة',
      },
    });
    expect(await appPrisma.auditLog.count()).toBe(before + 1);
  });
});

describe('الإشارة (@) تمنح وصولًا لسجل واحد بعينه لا للوحدة كاملة', () => {
  /**
   * الخلل الحقيقي: صفحة الإشعار كانت تعامل الوصول عبر صلاحية/نطاق المستخدم
   * المعتادين فقط، فيُرفض المُشار إليه برسالة «لا صلاحية» أو 404 رغم أن أحدًا
   * يملك صلاحية الوصول أشار إليه صراحة في تعليق على هذا السجل بعينه.
   */
  it('مصمم مُشار إليه في تعليق على مهمة خارج نطاقه (OWN) يستطيع فتحها', async () => {
    const designer = await actAs(DESIGNER);
    await actAs(ADMIN);
    const task = await createTask({
      title: 'مهمة خارج نطاق المصمم',
      priority: 'MEDIUM',
      status: 'TODO',
      requiresApproval: false,
      assigneeIds: [],
      checklist: [],
      dependsOnIds: [],
    } as never);

    await addComment('TASK', task.id, `مرحبًا @${designer.name}`, [designer.id]);

    await actAs(DESIGNER);
    const fetched = await getTask(task.id);
    expect(fetched.id).toBe(task.id);
  });

  it('مصمم غير مُشار إليه في مهمة خارج نطاقه يُرفض كالمعتاد', async () => {
    await actAs(ADMIN);
    const task = await createTask({
      title: 'مهمة أخرى بلا إشارة',
      priority: 'MEDIUM',
      status: 'TODO',
      requiresApproval: false,
      assigneeIds: [],
      checklist: [],
      dependsOnIds: [],
    } as never);

    await actAs(DESIGNER);
    await expect(getTask(task.id)).rejects.toMatchObject({ status: 404 });
  });

  it('مصمم مُشار إليه في تعليق على عميل محتمل رغم عدم امتلاكه صلاحية leads أصلًا', async () => {
    const designer = await actAs(DESIGNER);
    await actAs(ADMIN);
    const lead = await createLead({
      fullName: 'عميل محتمل للإشارة',
      phone: '01000000077',
      estimatedValue: 0,
      currency: 'EGP',
      priority: 'LOW',
      score: 0,
      nextFollowUpAt: new Date(Date.now() + 86_400_000).toISOString(),
    } as never);

    // بلا صلاحية leads إطلاقًا يفشل الوصول بـ403 لا 404 — تحقّق أولًا.
    await actAs(DESIGNER);
    await expect(getLead(lead.id)).rejects.toMatchObject({ status: 403 });

    await actAs(ADMIN);
    await addComment('LEAD', lead.id, `انتبه @${designer.name}`, [designer.id]);

    await actAs(DESIGNER);
    const fetched = await getLead(lead.id);
    expect(fetched.id).toBe(lead.id);
  });
});

describe('لوحة التحكم: قسم العمليات مقيّد بنطاق TEAM/ALL لا بمجرد امتلاك الصلاحية', () => {
  /**
   * الخلل الحقيقي: الشرط كان `can(user,'projects','view') && can(user,'tasks','view')`
   * وهو صحيح حتى لنطاق OWN، بينما operationsBlock تحسب أرقامًا على مستوى
   * الشركة كاملة بلا أي تقييد بنطاق المستخدم.
   */
  it('المصمم (نطاق OWN على المشاريع والمهام) لا يرى قسم العمليات', async () => {
    const designer = await actAs(DESIGNER);
    const dashboard = await buildDashboard(designer);
    expect(dashboard.operations).toBeUndefined();
  });

  it('مدير المبيعات (نطاق TEAM) يرى قسم العمليات', async () => {
    const manager = await actAs(MANAGER);
    const dashboard = await buildDashboard(manager);
    expect(dashboard.operations).toBeDefined();
  });
});

describe('صلاحيات فردية إضافية فوق الدور (UserPermissionOverride)', () => {
  it('الأدمن يمنح صلاحية إضافية لمستخدم بعينه فتعمل فعليًا', async () => {
    const designer = await actAs(DESIGNER);
    await actAs(ADMIN);
    const quotationBefore = await createQuotation({
      clientId,
      issueDate: new Date().toISOString(),
      expiryDate: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      currency: 'EGP',
      items: [{ nameAr: 'بند سابق', quantity: 1, unitPrice: 10 }],
    } as never);

    // المصمم بلا أي صلاحية quotations افتراضيًا (وبلا إشارة) — تحقّق أولًا.
    await actAs(DESIGNER);
    await expect(getQuotation(quotationBefore.id)).rejects.toMatchObject({ status: 403 });

    await actAs(ADMIN);
    // عرض السعر مستند مالي بالكامل — يتطلب view_financial أيضًا لا view فقط،
    // فالأدمن يمنح الاثنين معًا كما تفعل واجهة الصلاحيات الإضافية فعليًا.
    await updateUserPermissionOverrides({
      userId: designer.id,
      overrides: [
        { module: 'quotations', action: 'view', scope: 'ALL', allow: true },
        { module: 'quotations', action: 'view_financial', scope: 'ALL', allow: true },
      ],
    });

    const saved = await getUserPermissionOverrides(designer.id);
    expect(saved).toContainEqual(
      expect.objectContaining({ module: 'quotations', action: 'view', scope: 'ALL', allow: true }),
    );
    expect(saved).toContainEqual(
      expect.objectContaining({ module: 'quotations', action: 'view_financial', scope: 'ALL', allow: true }),
    );

    const quotation = await createQuotation({
      clientId,
      issueDate: new Date().toISOString(),
      expiryDate: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      currency: 'EGP',
      items: [{ nameAr: 'بند', quantity: 1, unitPrice: 50 }],
    } as never);

    await actAs(DESIGNER);
    const fetched = await getQuotation(quotation.id);
    expect(fetched.id).toBe(quotation.id);

    // تنظيف — لا يؤثر على اختبارات أخرى تعتمد على غياب صلاحية quotations للمصمم.
    await actAs(ADMIN);
    await updateUserPermissionOverrides({ userId: designer.id, overrides: [] });
  });

  it('الأدمن يمنع صراحةً صلاحية يمنحها الدور تحديدًا لمستخدم', async () => {
    const sales1 = await actAs(SALES1);
    await actAs(SALES1);
    await expect(listLeads({})).resolves.toBeDefined();

    await actAs(ADMIN);
    await updateUserPermissionOverrides({
      userId: sales1.id,
      overrides: [{ module: 'leads', action: 'view', scope: 'OWN', allow: false }],
    });

    await actAs(SALES1);
    await expect(listLeads({})).rejects.toMatchObject({ status: 403 });

    // إزالة المنع حتى لا تتأثر بقية اختبارات هذا الملف التي تعتمد على وصول SALES1 لسجلاته.
    await actAs(ADMIN);
    await updateUserPermissionOverrides({ userId: sales1.id, overrides: [] });
    await actAs(SALES1);
    await expect(listLeads({})).resolves.toBeDefined();
  });

  it('لا يستطيع الأدمن تعديل صلاحياته الإضافية الشخصية (منع قفل النفس)', async () => {
    const admin = await actAs(ADMIN);
    await expect(
      updateUserPermissionOverrides({ userId: admin.id, overrides: [] }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

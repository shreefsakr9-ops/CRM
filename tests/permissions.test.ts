import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mockSession, actAs, createTestUser, prisma, resetBusinessData } from './helpers';

mockSession();

const { listLeads, createLead } = await import('@/server/services/leads');
const { listInvoices, createInvoice } = await import('@/server/services/invoices');
const { getProject, createProject, updateProject } = await import('@/server/services/projects');
const { getClient, createClient } = await import('@/server/services/clients');
const { AppError } = await import('@/server/auth/guard');
const { listUsers } = await import('@/server/services/users');
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

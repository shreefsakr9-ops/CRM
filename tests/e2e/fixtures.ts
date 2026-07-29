/**
 * بيانات ثابتة لاختبارات المتصفح.
 *
 * تُنشأ عبر Prisma مباشرة لا عبر الواجهة: الهدف من كل اختبار هو ما بعد التهيئة،
 * وبناء العميل والفاتورة بالنقر يجعل فشل أي شاشة يُسقط اختبارات لا علاقة لها بها.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../src/server/auth/password';
import { generateTotpSecret } from '../../src/server/auth/totp';

export const prisma = new PrismaClient();

export const E2E_PASSWORD = 'E2ePass#2026';

export const USERS = {
  admin: 'e2e.admin@bluepoint.local',
  sales: 'e2e.sales@bluepoint.local',
  designer: 'e2e.designer@bluepoint.local',
};

/**
 * سرّ TOTP ثابت لمستخدم الاختبار.
 *
 * `SUPER_ADMIN` دور مُلزَم بالمصادقة الثنائية افتراضيًا، فمستخدم بلا تفعيل
 * يُحوَّل إلى شاشة التفعيل ولا يصل لأي صفحة. تفعيلها بسرّ معروف يجعل الاختبار
 * يمر بمسار الدخول الحقيقي بخطوتيه بدل الالتفاف حوله بتعطيل الإلزام.
 */
export const ADMIN_TOTP_SECRET = generateTotpSecret();

export interface E2EData {
  clientId: string;
  invoiceId: string;
  invoiceNumber: string;
  outOfScopeLeadId: string;
  convertibleLeadId: string;
  convertibleLeadPhone: string;
}

async function upsertUser(
  email: string,
  name: string,
  roleKey: string,
  totpSecret?: string,
) {
  const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
  const passwordHash = await hashPassword(E2E_PASSWORD);
  const twoFactor = totpSecret
    ? { twoFactorEnabled: true, twoFactorSecret: totpSecret, twoFactorLastStep: null }
    : { twoFactorEnabled: false, twoFactorSecret: null, twoFactorLastStep: null };

  return prisma.user.upsert({
    where: { email },
    create: { email, name, passwordHash, roleId: role.id, ...twoFactor },
    update: {
      passwordHash,
      roleId: role.id,
      isActive: true,
      deletedAt: null,
      managerId: null,
      mustResetPassword: false,
      ...twoFactor,
    },
  });
}

/**
 * يمسح محاولات الدخول الفاشلة لمستخدمي الاختبار وللعنوان المحلي.
 *
 * النظام يقفل الدخول بعد ٦ محاولات فاشلة للبريد و٢٠ للعنوان خلال ١٥ دقيقة —
 * وهو سلوك مقصود ومفيد. لكن كل اختبارات المتصفح تأتي من ١٢٧.٠.٠.١، واختبار
 * «كلمة المرور الخاطئة» يستهلك من نفس الحصة، فتتراكم عبر التشغيلات حتى تُقفل
 * جميع الاختبارات. المسح هنا تهيئة لا إضعاف: الحد نفسه يُختبر صراحةً.
 */
export async function resetLoginAttempts() {
  await prisma.loginAttempt.deleteMany({
    where: {
      OR: [
        { email: { in: Object.values(USERS) } },
        { ip: { in: ['127.0.0.1', '::1', '::ffff:127.0.0.1'] } },
      ],
    },
  });
}

export async function seedE2EData(): Promise<E2EData> {
  await resetLoginAttempts();
  const admin = await upsertUser(
    USERS.admin,
    'مدير الاختبار',
    'SUPER_ADMIN',
    ADMIN_TOTP_SECRET,
  );
  await upsertUser(USERS.sales, 'مندوب الاختبار', 'SALES_AGENT');
  await upsertUser(USERS.designer, 'مصمم الاختبار', 'GRAPHIC_DESIGNER');

  const legalName = 'عميل اختبار المتصفح';
  const existing = await prisma.client.findFirst({ where: { legalName } });
  const client = existing
    ? await prisma.client.update({
        where: { id: existing.id },
        data: { deletedAt: null, status: 'ACTIVE', accountManagerId: admin.id },
      })
    : await prisma.client.create({
        data: {
          legalName,
          brandName: 'اختبار المتصفح',
          industry: 'OTHER',
          status: 'ACTIVE',
          countryCode: 'EG',
          accountManagerId: admin.id,
          createdById: admin.id,
        },
      });

  await prisma.contact.deleteMany({ where: { clientId: client.id } });
  await prisma.contact.createMany({
    data: [
      {
        clientId: client.id,
        name: 'المسؤول المالي',
        type: 'FINANCE',
        email: 'e2e.finance@example.com',
        isPrimary: true,
      },
      {
        clientId: client.id,
        name: 'صاحب القرار',
        type: 'DECISION_MAKER',
        email: 'e2e.boss@example.com',
      },
    ],
  });

  const number = 'E2E-INV-0001';
  await prisma.invoice.deleteMany({ where: { number } });
  const invoice = await prisma.invoice.create({
    data: {
      number,
      clientId: client.id,
      status: 'DRAFT',
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 14 * 86_400_000),
      currency: 'EGP',
      subtotalMinor: 500_000n,
      totalMinor: 500_000n,
      createdById: admin.id,
      items: {
        create: [
          {
            nameAr: 'خدمة اختبار',
            nameEn: 'Test service',
            quantity: 1,
            unitPriceMinor: 500_000n,
            taxRate: 0,
            subtotalMinor: 500_000n,
            totalMinor: 500_000n,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  // عميل محتمل مسنَد للمدير — المندوب نطاقه OWN فلا يراه، والوصول المباشر
  // بمعرّفه يجب أن يعيد 404 لا 403 حتى لا يكشف وجوده.
  const leadId = 'e2e-out-of-scope-lead';
  const lead = await prisma.lead.upsert({
    where: { id: leadId },
    create: {
      id: leadId,
      fullName: 'عميل محتمل خارج النطاق',
      phone: '01000000001',
      phoneNormalized: '201000000001',
      status: 'NEW',
      priority: 'LOW',
      currency: 'EGP',
      assignedToId: admin.id,
      createdById: admin.id,
    },
    update: { assignedToId: admin.id, deletedAt: null },
  });

  // عميل محتمل جاهز للتحويل — غير محوَّل بعد في بداية كل تشغيل، ليختبر مسار
  // «تحويل إلى عميل» من الواجهة فعليًا لا من الخدمة مباشرة.
  const convertibleLeadId = 'e2e-convertible-lead';
  const convertibleLeadPhone = '01099998888';
  await prisma.client.deleteMany({ where: { legalName: 'مصنع الاختبار للتحويل' } });
  await prisma.lead.upsert({
    where: { id: convertibleLeadId },
    create: {
      id: convertibleLeadId,
      fullName: 'مصنع الاختبار للتحويل',
      phone: convertibleLeadPhone,
      phoneNormalized: `20${convertibleLeadPhone.slice(1)}`,
      email: 'e2e.convert@example.com',
      status: 'QUALIFIED',
      priority: 'MEDIUM',
      currency: 'EGP',
      assignedToId: admin.id,
      createdById: admin.id,
    },
    update: {
      assignedToId: admin.id,
      deletedAt: null,
      convertedClientId: null,
      convertedAt: null,
    },
  });

  return {
    clientId: client.id,
    invoiceId: invoice.id,
    invoiceNumber: number,
    outOfScopeLeadId: lead.id,
    convertibleLeadId,
    convertibleLeadPhone,
  };
}

import { vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '@/server/auth/password';
import { buildPermissionMap, type Scope } from '@/server/auth/permissions';
import type { CurrentUser } from '@/server/auth/session';

export const prisma = new PrismaClient();

/** المستخدم الفعّال في الاختبار الحالي — يقرأه mock الجلسة. */
let activeUser: CurrentUser | null = null;

export function getActiveUser() {
  return activeUser;
}

export function clearUser() {
  activeUser = null;
}

/**
 * تُستدعى من كل ملف اختبار قبل الاستيرادات التي تعتمد على الجلسة.
 * تستبدل طبقة الجلسة بحيث تعيد المستخدم الذي يحدده الاختبار.
 */
export function mockSession() {
  vi.mock('@/server/auth/session', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/auth/session')>();
    const helpers = await import('./helpers');
    return {
      // نبقي الدوال التي لا تعتمد على الكوكيز كما هي (مثل buildActor)، ونستبدل
      // ما يقرأ الجلسة فقط. استبدال الوحدة بالكامل كان يخفي دوالّ حقيقية.
      ...actual,
      SESSION_COOKIE: 'bp_session',
      getCurrentUser: async () => helpers.getActiveUser(),
      getRequestMeta: async () => ({ ip: '127.0.0.1', userAgent: 'vitest' }),
      createSession: async () => 'test-token',
      destroyCurrentSession: async () => undefined,
      // إبطال الجلسات ينفَّذ فعليًا: المحاكاة هنا للتحكم في هوية المستخدم الحالي
      // فقط، ولو عطّلناه لمرّت اختبارات أمنية تظنّ أن الجلسات أُبطلت وهي لم تُبطل.
      revokeAllSessions: async (userId: string) => {
        const { prisma } = await import('./helpers');
        await prisma.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      },
      // تحدي المصادقة الثنائية يعتمد على الكوكيز وهي غير متاحة خارج طلب Next.
      setTwoFactorChallenge: async () => undefined,
      readTwoFactorChallenge: async () => null,
      clearTwoFactorChallenge: async () => undefined,
      TWO_FACTOR_COOKIE: 'bp_2fa',
    };
  });
}

/** يبني هوية مستخدم كاملة من قاعدة البيانات (نفس منطق الإنتاج). */
export async function actAs(email: string): Promise<CurrentUser> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { role: { include: { permissions: true } }, overrides: true },
  });

  const teamRows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE team AS (
      SELECT id FROM users WHERE id = ${user.id}
      UNION
      SELECT u.id FROM users u JOIN team t ON u."managerId" = t.id
    )
    SELECT id FROM team
  `;

  activeUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    nameEn: user.nameEn,
    avatarUrl: user.avatarUrl,
    roleId: user.roleId,
    roleKey: user.role.key,
    departmentId: user.departmentId,
    locale: user.locale,
    timezone: user.timezone,
    mustResetPassword: user.mustResetPassword,
    permissions: buildPermissionMap(
      user.role.permissions.map((p) => ({
        module: p.module,
        action: p.action,
        scope: p.scope as Scope,
      })),
      user.overrides.map((o) => ({
        module: o.module,
        action: o.action,
        scope: o.scope as Scope,
        allow: o.allow,
      })),
    ),
    teamIds: teamRows.map((r) => r.id),
    sessionId: 'test-session',
  };
  return activeUser;
}

export async function createTestUser(params: {
  email: string;
  name: string;
  roleKey: string;
  managerEmail?: string;
}) {
  const role = await prisma.role.findUniqueOrThrow({ where: { key: params.roleKey } });
  const manager = params.managerEmail
    ? await prisma.user.findUnique({ where: { email: params.managerEmail } })
    : null;

  return prisma.user.upsert({
    where: { email: params.email },
    create: {
      email: params.email,
      name: params.name,
      passwordHash: await hashPassword('TestPass#2026'),
      roleId: role.id,
      managerId: manager?.id,
    },
    update: { roleId: role.id, managerId: manager?.id, isActive: true, deletedAt: null },
  });
}

/** ينظّف بيانات الأعمال بين ملفات الاختبار مع إبقاء البيانات المرجعية. */
export async function resetBusinessData() {
  // سجل التدقيق محمي بمشغّل يمنع الحذف. تنظيفه بين ملفات الاختبار استثناء
  // مقصود ومحصور هنا: نعطّل المشغّل داخل نفس المعاملة ثم نعيده فورًا.
  await prisma.$transaction([
    prisma.$executeRawUnsafe('ALTER TABLE "audit_logs" DISABLE TRIGGER USER'),
    prisma.auditLog.deleteMany(),
    prisma.$executeRawUnsafe('ALTER TABLE "audit_logs" ENABLE TRIGGER USER'),
  ]);

  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.commentMention.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.timeEntry.deleteMany(),
    prisma.checklistItem.deleteMany(),
    prisma.taskDependency.deleteMany(),
    prisma.taskAssignee.deleteMany(),
    prisma.approval.deleteMany(),
    prisma.revisionRequest.deleteMany(),
    prisma.task.deleteMany(),
    prisma.deliverable.deleteMany(),
    prisma.milestone.deleteMany(),
    prisma.projectService.deleteMany(),
    prisma.projectMember.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.invoiceItem.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.project.deleteMany(),
    prisma.contractService.deleteMany(),
    prisma.contract.deleteMany(),
    prisma.quotationInstallment.deleteMany(),
    prisma.quotationItem.deleteMany(),
    prisma.quotation.deleteMany(),
    prisma.stageHistory.deleteMany(),
    prisma.followUp.deleteMany(),
    prisma.deal.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.contact.deleteMany(),
    prisma.client.deleteMany(),
    prisma.fileObject.deleteMany(),
  ]);
}

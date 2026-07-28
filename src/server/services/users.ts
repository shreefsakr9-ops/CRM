import 'server-only';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { requirePermission, BadRequest, NotFound, Conflict, scopeWhere } from '@/server/auth/guard';
import { hashPassword, randomToken, validatePasswordStrength } from '@/server/auth/password';
import { revokeAllSessions } from '@/server/auth/session';
import { audit, diff } from './audit';
import { ACTIONS, MODULES, type Scope } from '@/server/auth/permissions';

export const userInputSchema = z.object({
  name: z.string().trim().min(3, 'الاسم مطلوب'),
  nameEn: z.string().trim().optional().nullable(),
  email: z.string().trim().toLowerCase().email('بريد إلكتروني غير صالح'),
  phone: z.string().trim().optional().nullable(),
  jobTitle: z.string().trim().optional().nullable(),
  roleId: z.string().min(1, 'الدور مطلوب'),
  departmentId: z.string().optional().nullable(),
  managerId: z.string().optional().nullable(),
  locale: z.enum(['ar', 'en']).default('ar'),
  timezone: z.string().default('Africa/Cairo'),
  salesTarget: z.coerce.number().min(0).default(0),
  isActive: z.boolean().default(true),
});

export type UserInput = z.infer<typeof userInputSchema>;

export async function listUsers(params: { q?: string; roleId?: string; active?: string }) {
  const user = await requirePermission('users', 'view');
  const where = {
    deletedAt: null,
    ...scopeWhere(user, 'users', ['managerId', 'id']),
    ...(params.roleId ? { roleId: params.roleId } : {}),
    ...(params.active === 'inactive' ? { isActive: false } : {}),
    ...(params.active === 'active' ? { isActive: true } : {}),
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: 'insensitive' as const } },
            { email: { contains: params.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  return prisma.user.findMany({
    where,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: {
      role: { select: { key: true, nameAr: true } },
      department: { select: { nameAr: true } },
      manager: { select: { name: true } },
      _count: { select: { sessions: true } },
    },
  });
}

export async function createUser(input: UserInput) {
  const actor = await requirePermission('users', 'manage');
  const data = userInputSchema.parse(input);

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw Conflict('البريد الإلكتروني مستخدم بالفعل');

  // كلمة مرور مؤقتة قوية + إجبار التغيير عند أول دخول.
  const temporaryPassword = `Bp#${randomToken(9)}`;
  const created = await prisma.user.create({
    data: {
      name: data.name,
      nameEn: data.nameEn || null,
      email: data.email,
      phone: data.phone || null,
      jobTitle: data.jobTitle || null,
      roleId: data.roleId,
      departmentId: data.departmentId || null,
      managerId: data.managerId || null,
      locale: data.locale,
      timezone: data.timezone,
      salesTargetMinor: BigInt(Math.round(data.salesTarget * 100)),
      isActive: data.isActive,
      passwordHash: await hashPassword(temporaryPassword),
      mustResetPassword: true,
    },
  });

  await audit({
    userId: actor.id,
    action: 'CREATE',
    module: 'users',
    entityType: 'USER',
    entityId: created.id,
    summary: `إنشاء مستخدم ${created.email}`,
    newValue: { email: created.email, roleId: created.roleId, isActive: created.isActive },
  });

  return { id: created.id, temporaryPassword };
}

export async function updateUser(id: string, input: UserInput) {
  const actor = await requirePermission('users', 'manage');
  const data = userInputSchema.parse(input);
  const before = await prisma.user.findUnique({ where: { id } });
  if (!before || before.deletedAt) throw NotFound('المستخدم غير موجود');

  if (data.managerId === id) throw BadRequest('لا يمكن أن يكون المستخدم مديرًا لنفسه');

  const updated = await prisma.user.update({
    where: { id },
    data: {
      name: data.name,
      nameEn: data.nameEn || null,
      email: data.email,
      phone: data.phone || null,
      jobTitle: data.jobTitle || null,
      roleId: data.roleId,
      departmentId: data.departmentId || null,
      managerId: data.managerId || null,
      locale: data.locale,
      timezone: data.timezone,
      salesTargetMinor: BigInt(Math.round(data.salesTarget * 100)),
      isActive: data.isActive,
    },
  });

  // تعطيل الحساب أو تغيير الدور يُبطل الجلسات فورًا.
  if (before.isActive && !updated.isActive) await revokeAllSessions(id);
  if (before.roleId !== updated.roleId) {
    await revokeAllSessions(id);
    await audit({
      userId: actor.id,
      action: 'PERMISSION_CHANGE',
      module: 'users',
      entityType: 'USER',
      entityId: id,
      summary: 'تغيير دور المستخدم',
      oldValue: { roleId: before.roleId },
      newValue: { roleId: updated.roleId },
    });
  }

  const d = diff(before as unknown as Record<string, unknown>, {
    name: updated.name,
    email: updated.email,
    isActive: updated.isActive,
    departmentId: updated.departmentId,
    managerId: updated.managerId,
  });
  if (d.changed) {
    await audit({
      userId: actor.id,
      action: 'UPDATE',
      module: 'users',
      entityType: 'USER',
      entityId: id,
      summary: `تعديل بيانات ${updated.email}`,
      oldValue: d.oldValue,
      newValue: d.newValue,
    });
  }
  return updated;
}

export async function forcePasswordReset(id: string) {
  const actor = await requirePermission('users', 'manage');
  const temporaryPassword = `Bp#${randomToken(9)}`;
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(temporaryPassword), mustResetPassword: true },
  });
  await revokeAllSessions(id);
  await audit({
    userId: actor.id,
    action: 'PASSWORD_RESET',
    module: 'users',
    entityType: 'USER',
    entityId: id,
    summary: 'إعادة تعيين إجبارية لكلمة المرور وإبطال الجلسات',
  });
  return { temporaryPassword };
}

export async function deactivateUser(id: string) {
  const actor = await requirePermission('users', 'manage');
  if (actor.id === id) throw BadRequest('لا يمكنك تعطيل حسابك الشخصي');
  await prisma.user.update({ where: { id }, data: { isActive: false } });
  await revokeAllSessions(id);
  await audit({
    userId: actor.id,
    action: 'UPDATE',
    module: 'users',
    entityType: 'USER',
    entityId: id,
    summary: 'تعطيل الحساب',
    newValue: { isActive: false },
  });
}

/* ── الأدوار والصلاحيات ─────────────────────────────── */

export async function listRolesWithPermissions() {
  await requirePermission('roles', 'view');
  return prisma.role.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { permissions: true, _count: { select: { users: true } } },
  });
}

const permissionUpdateSchema = z.object({
  roleId: z.string(),
  grants: z.array(
    z.object({
      module: z.enum(MODULES),
      action: z.enum(ACTIONS),
      scope: z.enum(['OWN', 'TEAM', 'ALL']),
    }),
  ),
});

export async function updateRolePermissions(input: unknown) {
  const actor = await requirePermission('roles', 'manage');
  const { roleId, grants } = permissionUpdateSchema.parse(input);

  const role = await prisma.role.findUnique({ where: { id: roleId }, include: { permissions: true } });
  if (!role) throw NotFound('الدور غير موجود');
  if (role.key === 'SUPER_ADMIN') {
    throw BadRequest('لا يمكن تعديل صلاحيات دور المدير الأعلى — هذا يمنع فقدان الوصول للنظام');
  }

  const before = role.permissions.map((p) => `${p.module}.${p.action}:${p.scope}`).sort();

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({
      data: grants.map((g) => ({ roleId, module: g.module, action: g.action, scope: g.scope as Scope })),
      skipDuplicates: true,
    }),
  ]);

  // تغيير الصلاحيات يُبطل جلسات أصحاب الدور حتى تُطبَّق فورًا.
  const users = await prisma.user.findMany({ where: { roleId }, select: { id: true } });
  for (const u of users) await revokeAllSessions(u.id);

  await audit({
    userId: actor.id,
    action: 'PERMISSION_CHANGE',
    module: 'roles',
    entityType: 'ROLE',
    entityId: roleId,
    summary: `تعديل صلاحيات الدور ${role.nameAr}`,
    oldValue: before,
    newValue: grants.map((g) => `${g.module}.${g.action}:${g.scope}`).sort(),
  });
}

export async function updateOwnProfile(
  userId: string,
  input: { name: string; phone?: string; locale: 'ar' | 'en'; timezone: string },
) {
  const schema = z.object({
    name: z.string().trim().min(3, 'الاسم مطلوب'),
    phone: z.string().trim().optional(),
    locale: z.enum(['ar', 'en']),
    timezone: z.string().min(1),
  });
  const data = schema.parse(input);
  await prisma.user.update({
    where: { id: userId },
    data: { name: data.name, phone: data.phone || null, locale: data.locale, timezone: data.timezone },
  });
  await audit({
    userId,
    action: 'UPDATE',
    module: 'users',
    entityType: 'USER',
    entityId: userId,
    summary: 'تحديث الملف الشخصي',
    newValue: data,
  });
}

export function passwordPolicyError(password: string) {
  return validatePasswordStrength(password);
}

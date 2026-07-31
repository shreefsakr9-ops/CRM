import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import {
  requirePermission,
  requireUser,
  can,
  scopeOf,
  scopeWhere,
  NotFound,
  BadRequest,
  Forbidden,
} from '@/server/auth/guard';
import { audit, diff } from './audit';
import { nextNumber } from './numbering';
import { notify } from './notifications';
import { getSettings } from './settings';
import { projectProfit } from './money';
import { isMentionedOn } from './mentions';

const OWNER_FIELDS = ['ownerId', 'accountManagerId', 'createdById'];

/** المشاريع مرئية أيضًا لأعضاء الفريق المسندين إليها. */
const memberCondition = (userId: string) => [{ members: { some: { userId } } }];

export const projectSchema = z.object({
  name: z.string().trim().min(2, 'اسم المشروع مطلوب'),
  clientId: z.string().min(1, 'العميل مطلوب'),
  dealId: z.string().optional().nullable(),
  quotationId: z.string().optional().nullable(),
  contractId: z.string().optional().nullable(),
  templateId: z.string().optional().nullable(),
  ownerId: z.string().optional().nullable(),
  accountManagerId: z.string().optional().nullable(),
  startDate: z.string().min(1, 'تاريخ البداية مطلوب'),
  endDate: z.string().optional().nullable(),
  status: z
    .enum([
      'ONBOARDING',
      'PLANNING',
      'IN_PROGRESS',
      'INTERNAL_REVIEW',
      'CLIENT_REVIEW',
      'ON_HOLD',
      'AT_RISK',
      'COMPLETED',
      'CANCELLED',
    ])
    .default('ONBOARDING'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  budget: z.coerce.number().min(0).default(0),
  currency: z.string().default('EGP'),
  progressMode: z.enum(['TASKS', 'DELIVERABLES', 'MANUAL']).default('TASKS'),
  progressPercent: z.coerce.number().int().min(0).max(100).default(0),
  memberIds: z.array(z.string()).default([]),
  serviceIds: z.array(z.string()).default([]),
  internalNotes: z.string().trim().optional().nullable(),
  clientNotes: z.string().trim().optional().nullable(),
});

export type ProjectInput = z.infer<typeof projectSchema>;

export async function listProjects(filters: {
  q?: string;
  status?: string;
  clientId?: string;
  ownerId?: string;
  page?: number;
  pageSize?: number;
}) {
  const user = await requirePermission('projects', 'view');
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, filters.pageSize ?? 25);

  const where: Prisma.ProjectWhereInput = {
    deletedAt: null,
    ...scopeWhere(user, 'projects', OWNER_FIELDS, memberCondition(user.id)),
    ...(filters.status ? { status: filters.status as never } : {}),
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
    ...(filters.q
      ? {
          OR: [
            { name: { contains: filters.q, mode: 'insensitive' } },
            { code: { contains: filters.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: [{ status: 'asc' }, { endDate: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        client: { select: { id: true, legalName: true, brandName: true } },
        owner: { select: { id: true, name: true, avatarUrl: true } },
        accountManager: { select: { id: true, name: true } },
        members: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        _count: { select: { tasks: true, deliverables: true } },
      },
    }),
    prisma.project.count({ where }),
  ]);

  const showMoney = can(user, 'projects', 'view_financial');
  return {
    rows: rows.map((r) => ({ ...r, budgetMinor: showMoney ? r.budgetMinor : null })),
    total,
    page,
    pageSize,
  };
}

export async function getProject(id: string) {
  const user = await requireUser();
  const hasView = can(user, 'projects', 'view');

  // إشارة (@) صريحة لهذا المستخدم في تعليق على هذا المشروع تمنحه قراءته
  // بعينه بصرف النظر عن نطاق دوره أو صلاحيته المعتادة على المشاريع.
  let scopeCondition: Record<string, unknown> = {};
  if (!hasView || scopeOf(user, 'projects') !== 'ALL') {
    const mentioned = await isMentionedOn(user.id, 'PROJECT', id);
    if (!mentioned) {
      if (!hasView) throw Forbidden('ليس لديك صلاحية «view» على «projects»');
      scopeCondition = scopeWhere(user, 'projects', OWNER_FIELDS, memberCondition(user.id));
    }
  }

  const project = await prisma.project.findFirst({
    where: {
      id,
      deletedAt: null,
      ...scopeCondition,
    },
    include: {
      client: { select: { id: true, legalName: true, brandName: true } },
      owner: { select: { id: true, name: true, avatarUrl: true } },
      accountManager: { select: { id: true, name: true } },
      members: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      services: { include: { service: { select: { id: true, nameAr: true } } } },
      milestones: { orderBy: { sortOrder: 'asc' } },
      deliverables: { orderBy: { createdAt: 'asc' } },
      contract: { select: { id: true, number: true } },
      quotation: { select: { id: true, number: true } },
      deal: { select: { id: true, title: true } },
      tasks: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { dueDate: 'asc' }],
        include: {
          assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
          checklist: { orderBy: { sortOrder: 'asc' } },
          department: { select: { nameAr: true } },
          dependencies: { include: { dependsOn: { select: { id: true, title: true, status: true } } } },
        },
      },
    },
  });
  if (!project) throw NotFound('المشروع غير موجود');

  const showMoney = can(user, 'projects', 'view_financial');
  const showProfit = can(user, 'projects', 'view_cost_profit');

  let finance: {
    budgetMinor: number;
    invoicedMinor: number;
    collectedMinor: number;
    directCostsMinor: number;
    profitMinor: number | null;
    marginPercent: number | null;
    includedIndirect: boolean;
  } | null = null;

  if (showMoney) {
    const settings = await getSettings();
    const [invoices, expenses] = await Promise.all([
      prisma.invoice.aggregate({
        where: { projectId: id, deletedAt: null, status: { notIn: ['DRAFT', 'CANCELLED'] } },
        _sum: { totalMinor: true, paidMinor: true },
      }),
      prisma.expense.aggregate({
        where: { projectId: id, deletedAt: null },
        _sum: { amountMinor: true },
      }),
    ]);
    const revenue = invoices._sum.paidMinor ?? 0n;
    const costs = expenses._sum.amountMinor ?? 0n;
    const profit = projectProfit({
      recognizedRevenueMinor: revenue,
      directCostsMinor: costs,
      includeIndirect: settings.finance.includeIndirectCosts,
    });
    finance = {
      budgetMinor: Number(project.budgetMinor),
      invoicedMinor: Number(invoices._sum.totalMinor ?? 0n),
      collectedMinor: Number(revenue),
      directCostsMinor: showProfit ? Number(costs) : 0,
      profitMinor: showProfit ? Number(profit.profitMinor) : null,
      marginPercent: showProfit ? profit.marginPercent : null,
      includedIndirect: profit.includedIndirect,
    };
  }

  return { ...project, budgetMinor: showMoney ? project.budgetMinor : null, finance, showProfit };
}

/**
 * إنشاء مشروع — مع توليد المهام من القالب إن وُجد:
 * تواريخ نسبية من تاريخ البداية، اعتماديات، Checklists، وخطوات اعتماد.
 */
export async function createProject(input: ProjectInput) {
  const user = await requirePermission('projects', 'create');
  const data = projectSchema.parse(input);
  const startDate = new Date(data.startDate);

  const project = await prisma.$transaction(async (tx) => {
    const code = await nextNumber('PROJECT', tx);
    const created = await tx.project.create({
      data: {
        code,
        name: data.name,
        clientId: data.clientId,
        dealId: data.dealId || null,
        quotationId: data.quotationId || null,
        contractId: data.contractId || null,
        templateId: data.templateId || null,
        ownerId: data.ownerId || user.id,
        accountManagerId: data.accountManagerId || null,
        startDate,
        endDate: data.endDate ? new Date(data.endDate) : null,
        status: data.status,
        priority: data.priority,
        budgetMinor: BigInt(Math.round(data.budget * 100)),
        currency: data.currency,
        progressMode: data.progressMode,
        internalNotes: data.internalNotes || null,
        clientNotes: data.clientNotes || null,
        createdById: user.id,
        members: { create: data.memberIds.map((userId) => ({ userId })) },
        services: { create: data.serviceIds.map((serviceId) => ({ serviceId })) },
      },
    });

    if (data.templateId) {
      const template = await tx.projectTemplate.findUnique({
        where: { id: data.templateId },
        include: { tasks: { orderBy: { orderIndex: 'asc' } } },
      });
      if (template) {
        const departments = Object.fromEntries(
          (await tx.department.findMany()).map((d) => [d.key, d.id]),
        );
        // من يحمل الدور المطلوب لكل مهمة، مع تفضيل أعضاء الفريق المسندين للمشروع.
        const roleUsers = await tx.user.findMany({
          where: { isActive: true, deletedAt: null },
          select: { id: true, roleId: true, role: { select: { key: true } } },
        });
        const pickAssignee = (roleKey: string | null) => {
          if (!roleKey) return null;
          const candidates = roleUsers.filter((u) => u.role.key === roleKey);
          const member = candidates.find((c) => data.memberIds.includes(c.id));
          return (member ?? candidates[0])?.id ?? null;
        };

        const createdIds: string[] = [];
        for (const [i, t] of template.tasks.entries()) {
          const assignee = pickAssignee(t.assigneeRoleKey);
          const task = await tx.task.create({
            data: {
              title: t.titleAr,
              description: t.description,
              projectId: created.id,
              clientId: data.clientId,
              departmentId: t.departmentKey ? (departments[t.departmentKey] ?? null) : null,
              creatorId: user.id,
              reviewerId: t.requiresApproval ? (data.ownerId || user.id) : null,
              requiresApproval: t.requiresApproval,
              priority: t.priority,
              startDate: new Date(startDate.getTime() + t.offsetStartDays * 86_400_000),
              dueDate: new Date(startDate.getTime() + t.offsetDueDays * 86_400_000),
              estimateMinutes: t.estimateMinutes,
              recurrenceRule: t.recurrenceRule,
              sortOrder: i,
              assignees: assignee ? { create: [{ userId: assignee }] } : undefined,
              checklist: {
                create: ((t.checklist as string[]) ?? []).map((title, ci) => ({
                  title,
                  isRequired: ci === 0,
                  sortOrder: ci,
                })),
              },
            },
          });
          createdIds.push(task.id);
        }

        for (const [i, t] of template.tasks.entries()) {
          if (t.dependsOnIndex === null || t.dependsOnIndex === undefined) continue;
          const dependsOn = createdIds[t.dependsOnIndex];
          if (dependsOn) {
            await tx.taskDependency.create({
              data: { taskId: createdIds[i]!, dependsOnTaskId: dependsOn },
            });
          }
        }
      }
    }

    return created;
  });

  // إشعار أعضاء الفريق بالإسناد.
  for (const memberId of data.memberIds) {
    if (memberId === user.id) continue;
    await notify({
      userId: memberId,
      type: 'TASK_ASSIGNED',
      title: `تمت إضافتك لمشروع: ${project.name}`,
      entityType: 'PROJECT',
      entityId: project.id,
      link: `/projects/${project.id}`,
      dedupeKey: `PROJECT_MEMBER:${project.id}:${memberId}`,
    });
  }

  await audit({
    userId: user.id,
    action: 'CREATE',
    module: 'projects',
    entityType: 'PROJECT',
    entityId: project.id,
    summary: `إنشاء مشروع ${project.code} — ${project.name}`,
    newValue: { code: project.code, templateId: data.templateId },
  });

  await recalcProgress(project.id);
  return project;
}

export async function updateProject(id: string, input: ProjectInput) {
  const user = await requirePermission('projects', 'edit');
  const data = projectSchema.parse(input);
  const before = await prisma.project.findFirst({
    where: {
      id,
      deletedAt: null,
      ...scopeWhere(user, 'projects', OWNER_FIELDS, memberCondition(user.id)),
    },
  });
  if (!before) throw NotFound('المشروع غير موجود');

  const updated = await prisma.$transaction(async (tx) => {
    await tx.projectMember.deleteMany({ where: { projectId: id } });
    await tx.projectService.deleteMany({ where: { projectId: id } });
    return tx.project.update({
      where: { id },
      data: {
        name: data.name,
        clientId: data.clientId,
        ownerId: data.ownerId || before.ownerId,
        accountManagerId: data.accountManagerId || null,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        status: data.status,
        priority: data.priority,
        budgetMinor: BigInt(Math.round(data.budget * 100)),
        currency: data.currency,
        progressMode: data.progressMode,
        progressPercent: data.progressMode === 'MANUAL' ? data.progressPercent : before.progressPercent,
        internalNotes: data.internalNotes || null,
        clientNotes: data.clientNotes || null,
        completedAt: data.status === 'COMPLETED' ? (before.completedAt ?? new Date()) : null,
        updatedById: user.id,
        members: { create: data.memberIds.map((userId) => ({ userId })) },
        services: { create: data.serviceIds.map((serviceId) => ({ serviceId })) },
      },
    });
  });

  const d = diff(before as unknown as Record<string, unknown>, {
    name: updated.name,
    status: updated.status,
    ownerId: updated.ownerId,
    endDate: updated.endDate,
    budgetMinor: updated.budgetMinor,
  });
  if (d.changed) {
    await audit({
      userId: user.id,
      action: before.status !== updated.status ? 'STATUS_CHANGE' : 'UPDATE',
      module: 'projects',
      entityType: 'PROJECT',
      entityId: id,
      summary: `تعديل المشروع ${updated.code}`,
      oldValue: d.oldValue,
      newValue: d.newValue,
    });
  }

  if (data.progressMode !== 'MANUAL') await recalcProgress(id);
  return updated;
}

/** يحسب نسبة الإنجاز حسب طريقة الاحتساب المحددة للمشروع. */
export async function recalcProgress(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { progressMode: true },
  });
  if (!project || project.progressMode === 'MANUAL') return;

  let percent = 0;
  if (project.progressMode === 'TASKS') {
    const [done, total] = await Promise.all([
      prisma.task.count({
        where: { projectId, deletedAt: null, status: { in: ['COMPLETED', 'APPROVED'] } },
      }),
      prisma.task.count({ where: { projectId, deletedAt: null, status: { not: 'CANCELLED' } } }),
    ]);
    percent = total > 0 ? Math.round((done / total) * 100) : 0;
  } else {
    const [done, total] = await Promise.all([
      prisma.deliverable.count({
        where: { projectId, status: { in: ['APPROVED', 'DELIVERED'] } },
      }),
      prisma.deliverable.count({ where: { projectId, status: { not: 'CANCELLED' } } }),
    ]);
    percent = total > 0 ? Math.round((done / total) * 100) : 0;
  }

  await prisma.project.update({ where: { id: projectId }, data: { progressPercent: percent } });
  return percent;
}

/** تقييم المخاطر حسب القواعد المعلنة في docs/03-workflows.md (BR-P03). */
export async function evaluateProjectRisk(projectId: string) {
  const settings = await getSettings();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, endDate: true, progressPercent: true, status: true },
  });
  if (!project || ['COMPLETED', 'CANCELLED'].includes(project.status)) return null;

  const now = Date.now();
  const reasons: string[] = [];

  if (
    project.endDate &&
    project.endDate.getTime() - now < settings.projects.atRiskDaysBeforeEnd * 86_400_000 &&
    project.progressPercent < settings.projects.atRiskProgressThreshold
  ) {
    reasons.push('اقتراب موعد التسليم مع تقدم منخفض');
  }

  const lateTask = await prisma.task.findFirst({
    where: {
      projectId,
      deletedAt: null,
      status: { notIn: ['COMPLETED', 'CANCELLED', 'APPROVED'] },
      dueDate: { lt: new Date(now - 3 * 86_400_000) },
    },
    select: { id: true },
  });
  if (lateTask) reasons.push('توجد مهمة متأخرة أكثر من ٣ أيام');

  const waiting = await prisma.task.findFirst({
    where: {
      projectId,
      deletedAt: null,
      status: 'WAITING_CLIENT',
      waitingSince: { lt: new Date(now - settings.projects.clientWaitAlertDays * 86_400_000) },
    },
    select: { id: true },
  });
  if (waiting) reasons.push('انتظار العميل لفترة طويلة');

  return reasons.length ? reasons : null;
}

export async function softDeleteProject(id: string) {
  const user = await requirePermission('projects', 'delete');
  const project = await prisma.project.findFirst({ where: { id, deletedAt: null } });
  if (!project) throw NotFound('المشروع غير موجود');
  await prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({
    userId: user.id,
    action: 'DELETE',
    module: 'projects',
    entityType: 'PROJECT',
    entityId: id,
    summary: `حذف المشروع ${project.code}`,
  });
}

export async function addDeliverable(projectId: string, input: { name: string; dueDate?: string }) {
  const user = await requirePermission('projects', 'edit');
  if (!input.name?.trim()) throw BadRequest('اسم المخرج مطلوب');
  const deliverable = await prisma.deliverable.create({
    data: {
      projectId,
      name: input.name.trim(),
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
    },
  });
  await audit({
    userId: user.id,
    action: 'CREATE',
    module: 'projects',
    entityType: 'DELIVERABLE',
    entityId: deliverable.id,
    summary: `إضافة مخرج: ${deliverable.name}`,
  });
  await recalcProgress(projectId);
  return deliverable;
}

export async function projectFormOptions() {
  await requirePermission('projects', 'view');
  const [clients, users, services, templates, contracts, quotations, deals] = await Promise.all([
    prisma.client.findMany({
      where: { deletedAt: null },
      select: { id: true, legalName: true, brandName: true, currency: true },
      orderBy: { legalName: 'asc' },
    }),
    prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true, role: { select: { key: true, nameAr: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.service.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, nameAr: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.projectTemplate.findMany({
      where: { isActive: true },
      select: { id: true, nameAr: true, _count: { select: { tasks: true } } },
    }),
    prisma.contract.findMany({
      where: { deletedAt: null, status: { in: ['ACTIVE', 'AWAITING_SIGNATURE', 'DRAFT'] } },
      select: { id: true, number: true, clientId: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.quotation.findMany({
      where: { deletedAt: null, status: 'ACCEPTED' },
      select: { id: true, number: true, clientId: true, totalMinor: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.deal.findMany({
      where: { deletedAt: null },
      select: { id: true, title: true, clientId: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);
  return { clients, users, services, templates, contracts, quotations, deals };
}

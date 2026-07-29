import 'server-only';
import { z } from 'zod';
import type { Prisma, TaskStatus } from '@prisma/client';
import { prisma } from '@/server/db';
import {
  requirePermission,
  requireUser,
  can,
  scopeWhere,
  NotFound,
  BadRequest,
  Forbidden,
} from '@/server/auth/guard';
import { audit, diff } from './audit';
import { notify } from './notifications';
import { recalcProgress } from './projects';

const OWNER_FIELDS = ['creatorId', 'reviewerId'];
const assigneeCondition = (userId: string) => [{ assignees: { some: { userId } } }];

export const taskSchema = z.object({
  title: z.string().trim().min(2, 'عنوان المهمة مطلوب'),
  description: z.string().trim().optional().nullable(),
  clientId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  deliverableId: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  parentTaskId: z.string().optional().nullable(),
  reviewerId: z.string().optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  status: z
    .enum([
      'TODO',
      'IN_PROGRESS',
      'WAITING_INTERNAL_REVIEW',
      'REVISIONS_REQUIRED',
      'WAITING_CLIENT',
      'APPROVED',
      'COMPLETED',
      'ON_HOLD',
      'CANCELLED',
    ])
    .default('TODO'),
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  estimateMinutes: z.coerce.number().int().min(0).optional().nullable(),
  requiresApproval: z.coerce.boolean().default(false),
  recurrenceRule: z.string().optional().nullable(),
  assigneeIds: z.array(z.string()).default([]),
  checklist: z
    .array(z.object({ title: z.string().min(1), isRequired: z.coerce.boolean().default(false) }))
    .default([]),
  dependsOnIds: z.array(z.string()).default([]),
});

export type TaskInput = z.infer<typeof taskSchema>;

export async function listTasks(filters: {
  q?: string;
  status?: string;
  priority?: string;
  projectId?: string;
  assigneeId?: string;
  departmentId?: string;
  filter?: 'mine' | 'overdue' | 'today' | 'week';
  page?: number;
  pageSize?: number;
}) {
  const user = await requirePermission('tasks', 'view');
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, filters.pageSize ?? 50);
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setUTCHours(23, 59, 59, 999);

  const where: Prisma.TaskWhereInput = {
    deletedAt: null,
    ...scopeWhere(user, 'tasks', OWNER_FIELDS, assigneeCondition(user.id)),
    ...(filters.status ? { status: filters.status as TaskStatus } : {}),
    ...(filters.priority ? { priority: filters.priority as never } : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.assigneeId ? { assignees: { some: { userId: filters.assigneeId } } } : {}),
    ...(filters.filter === 'mine' ? { assignees: { some: { userId: user.id } } } : {}),
    ...(filters.filter === 'overdue'
      ? { dueDate: { lt: now }, status: { notIn: ['COMPLETED', 'CANCELLED', 'APPROVED'] } }
      : {}),
    ...(filters.filter === 'today'
      ? { dueDate: { lte: endOfToday }, status: { notIn: ['COMPLETED', 'CANCELLED', 'APPROVED'] } }
      : {}),
    ...(filters.filter === 'week'
      ? {
          dueDate: { gte: now, lte: new Date(now.getTime() + 7 * 86_400_000) },
          status: { notIn: ['COMPLETED', 'CANCELLED', 'APPROVED'] },
        }
      : {}),
    ...(filters.q ? { title: { contains: filters.q, mode: 'insensitive' } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        project: { select: { id: true, name: true, code: true } },
        client: { select: { id: true, legalName: true, brandName: true } },
        department: { select: { nameAr: true } },
        assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        checklist: { select: { id: true, isDone: true, isRequired: true } },
        _count: { select: { subtasks: true, dependencies: true } },
      },
    }),
    prisma.task.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}

export async function getTask(id: string) {
  const user = await requirePermission('tasks', 'view');
  const task = await prisma.task.findFirst({
    where: {
      id,
      deletedAt: null,
      ...scopeWhere(user, 'tasks', OWNER_FIELDS, assigneeCondition(user.id)),
    },
    include: {
      project: { select: { id: true, name: true, code: true } },
      client: { select: { id: true, legalName: true, brandName: true } },
      department: { select: { id: true, nameAr: true } },
      creator: { select: { id: true, name: true, avatarUrl: true } },
      reviewer: { select: { id: true, name: true } },
      assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      checklist: { orderBy: { sortOrder: 'asc' } },
      subtasks: {
        where: { deletedAt: null },
        select: { id: true, title: true, status: true, dueDate: true },
      },
      dependencies: {
        include: { dependsOn: { select: { id: true, title: true, status: true } } },
      },
      dependents: { include: { task: { select: { id: true, title: true, status: true } } } },
      timeEntries: {
        orderBy: { spentOn: 'desc' },
        include: { user: { select: { name: true } } },
      },
      deliverable: { select: { id: true, name: true, status: true } },
    },
  });
  if (!task) throw NotFound('المهمة غير موجودة');

  const [comments, revisions, approvals, files] = await Promise.all([
    prisma.comment.findMany({
      where: { entityType: 'TASK', entityId: id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
        mentions: { include: { user: { select: { id: true, name: true } } } },
      },
    }),
    prisma.revisionRequest.findMany({
      where: { entityType: 'TASK', entityId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        requestedBy: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
    }),
    prisma.approval.findMany({
      where: { entityType: 'TASK', entityId: id },
      orderBy: { createdAt: 'desc' },
      include: { approver: { select: { name: true } } },
    }),
    prisma.fileObject.findMany({
      where: { entityType: 'TASK', entityId: id, deletedAt: null },
      orderBy: [{ version: 'desc' }],
      include: { uploadedBy: { select: { name: true } } },
    }),
  ]);

  return { ...task, comments, revisions, approvals, files };
}

async function canModifyTask(taskId: string) {
  const user = await requirePermission('tasks', 'edit');
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      deletedAt: null,
      ...scopeWhere(user, 'tasks', OWNER_FIELDS, assigneeCondition(user.id)),
    },
    include: {
      checklist: true,
      dependencies: { include: { dependsOn: { select: { status: true, title: true } } } },
    },
  });
  if (!task) throw NotFound('المهمة غير موجودة');
  return { user, task };
}

export async function createTask(input: TaskInput) {
  const user = await requirePermission('tasks', 'create');
  const data = taskSchema.parse(input);

  const assigneeIds = can(user, 'tasks', 'assign')
    ? data.assigneeIds
    : data.assigneeIds.length
      ? [user.id]
      : [];

  const task = await prisma.task.create({
    data: {
      title: data.title,
      description: data.description || null,
      clientId: data.clientId || null,
      projectId: data.projectId || null,
      deliverableId: data.deliverableId || null,
      departmentId: data.departmentId || null,
      parentTaskId: data.parentTaskId || null,
      creatorId: user.id,
      reviewerId: data.reviewerId || null,
      priority: data.priority,
      status: data.status,
      startDate: data.startDate ? new Date(data.startDate) : null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      estimateMinutes: data.estimateMinutes ?? null,
      requiresApproval: data.requiresApproval,
      recurrenceRule: data.recurrenceRule || null,
      createdById: user.id,
      assignees: { create: assigneeIds.map((userId) => ({ userId })) },
      checklist: {
        create: data.checklist.map((c, i) => ({
          title: c.title,
          isRequired: c.isRequired,
          sortOrder: i,
        })),
      },
      dependencies: { create: data.dependsOnIds.map((dependsOnTaskId) => ({ dependsOnTaskId })) },
    },
  });

  for (const assigneeId of assigneeIds) {
    if (assigneeId === user.id) continue;
    await notify({
      userId: assigneeId,
      type: 'TASK_ASSIGNED',
      title: `مهمة جديدة: ${task.title}`,
      entityType: 'TASK',
      entityId: task.id,
      link: `/tasks/${task.id}`,
      dedupeKey: `TASK_ASSIGNED:${task.id}:${assigneeId}`,
    });
  }

  await audit({
    userId: user.id,
    action: 'CREATE',
    module: 'tasks',
    entityType: 'TASK',
    entityId: task.id,
    summary: `إنشاء مهمة: ${task.title}`,
  });

  if (task.projectId) await recalcProgress(task.projectId);
  return task;
}

export async function updateTask(id: string, input: TaskInput) {
  const { user, task: before } = await canModifyTask(id);
  const data = taskSchema.parse(input);

  const updated = await prisma.$transaction(async (tx) => {
    if (can(user, 'tasks', 'assign')) {
      await tx.taskAssignee.deleteMany({ where: { taskId: id } });
    }
    await tx.taskDependency.deleteMany({ where: { taskId: id } });
    return tx.task.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description || null,
        clientId: data.clientId || null,
        projectId: data.projectId || null,
        deliverableId: data.deliverableId || null,
        departmentId: data.departmentId || null,
        reviewerId: data.reviewerId || null,
        priority: data.priority,
        startDate: data.startDate ? new Date(data.startDate) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        estimateMinutes: data.estimateMinutes ?? null,
        requiresApproval: data.requiresApproval,
        recurrenceRule: data.recurrenceRule || null,
        updatedById: user.id,
        ...(can(user, 'tasks', 'assign')
          ? { assignees: { create: data.assigneeIds.map((userId) => ({ userId })) } }
          : {}),
        dependencies: { create: data.dependsOnIds.map((dependsOnTaskId) => ({ dependsOnTaskId })) },
      },
    });
  });

  const d = diff(before as unknown as Record<string, unknown>, {
    title: updated.title,
    dueDate: updated.dueDate,
    priority: updated.priority,
    reviewerId: updated.reviewerId,
  });
  if (d.changed) {
    await audit({
      userId: user.id,
      action: 'UPDATE',
      module: 'tasks',
      entityType: 'TASK',
      entityId: id,
      summary: `تعديل المهمة ${updated.title}`,
      oldValue: d.oldValue,
      newValue: d.newValue,
    });
  }
  return updated;
}

/**
 * تغيير حالة المهمة مع فرض قواعد العمل:
 * - لا إغلاق قبل إكمال عناصر الـ Checklist الإلزامية (BR-T01).
 * - لا بدء قبل اكتمال الاعتماديات (BR-T02).
 * - احتساب وقت انتظار العميل (BR-T04).
 */
export async function changeTaskStatus(
  id: string,
  status: TaskStatus,
  extra: { delayReason?: string; blockedNote?: string } = {},
) {
  const { user, task } = await canModifyTask(id);

  const closing = ['COMPLETED', 'APPROVED'].includes(status);
  if (closing) {
    const pendingRequired = task.checklist.filter((c) => c.isRequired && !c.isDone);
    if (pendingRequired.length > 0) {
      throw BadRequest(
        `لا يمكن إغلاق المهمة قبل إكمال ${pendingRequired.length} عنصر إلزامي في قائمة التحقق`,
      );
    }
    if (task.requiresApproval && status === 'COMPLETED') {
      throw BadRequest('هذه المهمة تتطلب اعتمادًا — أرسلها للمراجعة الداخلية أولًا');
    }
  }

  if (status === 'IN_PROGRESS') {
    const blocking = task.dependencies.filter(
      (d) => !['COMPLETED', 'APPROVED', 'CANCELLED'].includes(d.dependsOn.status),
    );
    if (blocking.length > 0) {
      throw BadRequest(
        `المهمة معطّلة باعتمادية غير مكتملة: ${blocking.map((b) => b.dependsOn.title).join('، ')}`,
      );
    }
  }

  const now = new Date();
  // إغلاق نافذة انتظار العميل واحتساب مدتها.
  let clientWaitMinutes = task.clientWaitMinutes;
  if (task.status === 'WAITING_CLIENT' && task.waitingSince) {
    clientWaitMinutes += Math.round((now.getTime() - task.waitingSince.getTime()) / 60_000);
  }
  let reviewMinutes = task.reviewMinutes;
  if (task.status === 'WAITING_INTERNAL_REVIEW' && task.waitingSince) {
    reviewMinutes += Math.round((now.getTime() - task.waitingSince.getTime()) / 60_000);
  }

  const updated = await prisma.task.update({
    where: { id },
    data: {
      status,
      waitingSince: ['WAITING_CLIENT', 'WAITING_INTERNAL_REVIEW'].includes(status) ? now : null,
      clientWaitMinutes,
      reviewMinutes,
      completedAt: closing ? now : null,
      delayReason: (extra.delayReason as never) ?? task.delayReason,
      blockedNote: extra.blockedNote ?? task.blockedNote,
      updatedById: user.id,
    },
  });

  // إشعار المراجع عند طلب المراجعة الداخلية.
  if (status === 'WAITING_INTERNAL_REVIEW' && task.reviewerId) {
    await notify({
      userId: task.reviewerId,
      type: 'APPROVAL_REQUESTED',
      title: `مطلوب مراجعة: ${task.title}`,
      entityType: 'TASK',
      entityId: id,
      link: `/tasks/${id}`,
      dedupeKey: `REVIEW:${id}:${task.reviewerId}:${now.getTime()}`,
    });
    await prisma.approval.create({
      data: { entityType: 'TASK', entityId: id, step: 'INTERNAL', approverId: task.reviewerId },
    });
  }

  await audit({
    userId: user.id,
    action: 'STATUS_CHANGE',
    module: 'tasks',
    entityType: 'TASK',
    entityId: id,
    summary: `تغيير حالة المهمة ${task.title} إلى ${status}`,
    oldValue: { status: task.status },
    newValue: { status },
  });

  if (updated.projectId) await recalcProgress(updated.projectId);
  return updated;
}

export async function toggleChecklistItem(itemId: string, isDone: boolean) {
  const user = await requirePermission('tasks', 'edit');
  const item = await prisma.checklistItem.findUnique({ where: { id: itemId } });
  if (!item) throw NotFound('عنصر قائمة التحقق غير موجود');
  await prisma.checklistItem.update({
    where: { id: itemId },
    data: { isDone, doneById: isDone ? user.id : null, doneAt: isDone ? new Date() : null },
  });
}

export async function logTime(taskId: string, minutes: number, spentOn: string, note?: string) {
  const user = await requirePermission('tasks', 'edit');
  if (minutes <= 0) throw BadRequest('عدد الدقائق يجب أن يكون أكبر من صفر');
  await prisma.$transaction([
    prisma.timeEntry.create({
      data: { taskId, userId: user.id, minutes, spentOn: new Date(spentOn), note },
    }),
    prisma.task.update({ where: { id: taskId }, data: { actualMinutes: { increment: minutes } } }),
  ]);
}

/* ── التعليقات والإشارات ────────────────────────────── */

export async function addComment(
  entityType: 'TASK' | 'PROJECT' | 'CLIENT' | 'LEAD' | 'QUOTATION',
  entityId: string,
  body: string,
  mentionIds: string[] = [],
) {
  const user = await requireUser();
  if (!body.trim()) throw BadRequest('التعليق فارغ');

  const comment = await prisma.comment.create({
    data: {
      entityType,
      entityId,
      authorId: user.id,
      body: body.trim(),
      mentions: { create: mentionIds.filter((id) => id !== user.id).map((userId) => ({ userId })) },
    },
  });

  const link =
    entityType === 'TASK'
      ? `/tasks/${entityId}`
      : entityType === 'PROJECT'
        ? `/projects/${entityId}`
        : entityType === 'CLIENT'
          ? `/clients/${entityId}`
          : entityType === 'LEAD'
            ? `/leads/${entityId}`
            : `/quotations/${entityId}`;

  for (const userId of mentionIds) {
    if (userId === user.id) continue;
    await notify({
      userId,
      type: 'USER_MENTIONED',
      title: `${user.name} أشار إليك في تعليق`,
      body: body.slice(0, 140),
      entityType,
      entityId,
      link,
      dedupeKey: `MENTION:${comment.id}:${userId}`,
    });
  }

  // إشعار بقية المسندين بالتعليق الجديد على المهمة.
  if (entityType === 'TASK') {
    const assignees = await prisma.taskAssignee.findMany({
      where: { taskId: entityId, userId: { notIn: [user.id, ...mentionIds] } },
      select: { userId: true },
    });
    for (const a of assignees) {
      await notify({
        userId: a.userId,
        type: 'COMMENT_ADDED',
        title: `تعليق جديد على مهمة مسندة إليك`,
        body: body.slice(0, 140),
        entityType,
        entityId,
        link,
        dedupeKey: `COMMENT:${comment.id}:${a.userId}`,
      });
    }
  }

  await prisma.activity.create({
    data: {
      entityType,
      entityId,
      type: 'COMMENT',
      subject: 'تعليق جديد',
      body: body.slice(0, 400),
      userId: user.id,
    },
  });

  return comment;
}

/* ── التعديلات والاعتمادات ──────────────────────────── */

export const revisionSchema = z.object({
  entityType: z.enum(['TASK', 'DELIVERABLE', 'PROJECT', 'QUOTATION']),
  entityId: z.string().min(1),
  source: z.enum(['INTERNAL', 'CLIENT']),
  description: z.string().trim().min(3, 'وصف التعديل مطلوب'),
  assignedToId: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  versionFileId: z.string().optional().nullable(),
});

export async function requestRevision(input: unknown) {
  const user = await requirePermission('approvals', 'view');
  const data = revisionSchema.parse(input);

  const revision = await prisma.revisionRequest.create({
    data: {
      entityType: data.entityType,
      entityId: data.entityId,
      source: data.source,
      description: data.description,
      requestedById: user.id,
      assignedToId: data.assignedToId || null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      versionFileId: data.versionFileId || null,
    },
  });

  if (data.entityType === 'TASK') {
    const task = await prisma.task.findUnique({
      where: { id: data.entityId },
      include: { assignees: true },
    });
    if (task) {
      // التعديل من العميل يضع المهمة في انتظار العميل، والداخلي يعيدها للتنفيذ.
      await prisma.task.update({
        where: { id: data.entityId },
        data: {
          status: 'REVISIONS_REQUIRED',
          delayReason: data.source === 'CLIENT' ? 'CLIENT_WAITING' : 'INTERNAL_DELAY',
          waitingSince: null,
        },
      });
      const targets = data.assignedToId
        ? [data.assignedToId]
        : task.assignees.map((a) => a.userId);
      for (const userId of targets) {
        await notify({
          userId,
          type: 'REVISION_REQUESTED',
          title: `طلب تعديل (${data.source === 'CLIENT' ? 'من العميل' : 'داخلي'}): ${task.title}`,
          body: data.description.slice(0, 140),
          entityType: 'TASK',
          entityId: data.entityId,
          link: `/tasks/${data.entityId}`,
          dedupeKey: `REVISION:${revision.id}:${userId}`,
        });
      }
    }
  }

  if (data.entityType === 'DELIVERABLE') {
    await prisma.deliverable.update({
      where: { id: data.entityId },
      data: { revisionCount: { increment: 1 }, status: 'IN_PRODUCTION' },
    });
  }

  await audit({
    userId: user.id,
    action: 'UPDATE',
    module: 'approvals',
    entityType: data.entityType,
    entityId: data.entityId,
    summary: `طلب تعديل ${data.source === 'CLIENT' ? 'من العميل' : 'داخلي'}`,
    newValue: { description: data.description },
  });

  return revision;
}

export async function completeRevision(revisionId: string) {
  const user = await requirePermission('approvals', 'view');
  const revision = await prisma.revisionRequest.findUnique({ where: { id: revisionId } });
  if (!revision) throw NotFound('طلب التعديل غير موجود');

  await prisma.revisionRequest.update({
    where: { id: revisionId },
    data: { status: 'DONE', completedAt: new Date() },
  });
  await audit({
    userId: user.id,
    action: 'UPDATE',
    module: 'approvals',
    entityType: revision.entityType,
    entityId: revision.entityId,
    summary: 'إغلاق طلب تعديل',
  });
}

export async function decideApproval(approvalId: string, approve: boolean, comment?: string) {
  const user = await requirePermission('approvals', 'approve');
  const approval = await prisma.approval.findUnique({ where: { id: approvalId } });
  if (!approval) throw NotFound('طلب الاعتماد غير موجود');
  if (approval.approverId !== user.id && !can(user, 'approvals', 'approve')) {
    throw Forbidden('طلب الاعتماد مسند لمستخدم آخر');
  }
  if (approval.status !== 'PENDING') throw BadRequest('تم اتخاذ قرار في هذا الطلب بالفعل');

  await prisma.approval.update({
    where: { id: approvalId },
    data: {
      status: approve ? 'APPROVED' : 'REJECTED',
      comment,
      decidedAt: new Date(),
    },
  });

  if (approval.entityType === 'TASK') {
    const task = await prisma.task.findUnique({
      where: { id: approval.entityId },
      include: { assignees: true },
    });
    if (task) {
      await prisma.task.update({
        where: { id: approval.entityId },
        data: {
          status: approve ? 'APPROVED' : 'REVISIONS_REQUIRED',
          completedAt: approve ? new Date() : null,
          waitingSince: null,
        },
      });
      for (const a of task.assignees) {
        await notify({
          userId: a.userId,
          type: approve ? 'WORK_APPROVED' : 'REVISION_REQUESTED',
          title: approve ? `تم اعتماد: ${task.title}` : `مطلوب تعديل: ${task.title}`,
          body: comment,
          entityType: 'TASK',
          entityId: approval.entityId,
          link: `/tasks/${approval.entityId}`,
          dedupeKey: `APPROVAL_DECISION:${approvalId}:${a.userId}`,
        });
      }
      if (task.projectId) await recalcProgress(task.projectId);
    }
  }

  await audit({
    userId: user.id,
    action: approve ? 'APPROVE' : 'REJECT',
    module: 'approvals',
    entityType: approval.entityType,
    entityId: approval.entityId,
    summary: approve ? 'اعتماد العمل' : 'رفض واعتماد التعديل',
    newValue: { comment },
  });
}

export async function listApprovalQueue() {
  const user = await requirePermission('approvals', 'view');
  const mine = can(user, 'approvals', 'approve');

  const [approvals, revisions] = await Promise.all([
    prisma.approval.findMany({
      where: { status: 'PENDING', ...(mine ? { approverId: user.id } : {}) },
      orderBy: { createdAt: 'asc' },
      include: { approver: { select: { name: true } } },
    }),
    prisma.revisionRequest.findMany({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        ...(mine ? {} : { assignedToId: user.id }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        requestedBy: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
    }),
  ]);

  // جلب عناوين الكيانات المرتبطة لعرضها في قائمة الاعتمادات.
  const taskIds = [
    ...approvals.filter((a) => a.entityType === 'TASK').map((a) => a.entityId),
    ...revisions.filter((r) => r.entityType === 'TASK').map((r) => r.entityId),
  ];
  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    select: { id: true, title: true, project: { select: { name: true } } },
  });
  const titles = Object.fromEntries(
    tasks.map((t) => [t.id, `${t.title}${t.project ? ` — ${t.project.name}` : ''}`]),
  );

  return {
    approvals: approvals.map((a) => ({ ...a, title: titles[a.entityId] ?? a.entityId })),
    revisions: revisions.map((r) => ({ ...r, title: titles[r.entityId] ?? r.entityId })),
  };
}

export async function softDeleteTask(id: string) {
  const user = await requirePermission('tasks', 'delete');
  const task = await prisma.task.findFirst({ where: { id, deletedAt: null } });
  if (!task) throw NotFound('المهمة غير موجودة');
  await prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({
    userId: user.id,
    action: 'DELETE',
    module: 'tasks',
    entityType: 'TASK',
    entityId: id,
    summary: `حذف المهمة ${task.title}`,
  });
  if (task.projectId) await recalcProgress(task.projectId);
}

export async function taskFormOptions() {
  await requirePermission('tasks', 'view');
  const [users, projects, clients, departments] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.project.findMany({
      where: { deletedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      select: { id: true, name: true, code: true, clientId: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.client.findMany({
      where: { deletedAt: null },
      select: { id: true, legalName: true, brandName: true },
      orderBy: { legalName: 'asc' },
    }),
    prisma.department.findMany({ where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } }),
  ]);
  return { users, projects, clients, departments };
}

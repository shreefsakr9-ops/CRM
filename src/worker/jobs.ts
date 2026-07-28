import { prisma } from '@/server/db';
import { notify } from '@/server/services/notifications';
import { getSettings } from '@/server/services/settings';
import { refreshOverdueInvoices } from '@/server/services/invoices';
import { evaluateProjectRisk } from '@/server/services/projects';

/**
 * وظائف مجدولة تعمل في عملية مستقلة عن الويب.
 * التنبيهات لا تعتمد على فتح المتصفح إطلاقًا.
 */

export interface JobResult {
  key: string;
  count: number;
  message?: string;
}

const day = 86_400_000;

/** عملاء محتملون بلا تواصل خلال المهلة المحددة. */
export async function jobUncontactedLeads(): Promise<JobResult> {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.leads.uncontactedAlertHours * 3_600_000);

  const leads = await prisma.lead.findMany({
    where: {
      deletedAt: null,
      firstContactAt: null,
      status: { in: ['NEW', 'WORKING'] },
      createdAt: { lt: cutoff },
      assignedToId: { not: null },
    },
    select: { id: true, fullName: true, assignedToId: true, createdAt: true },
    take: 500,
  });

  let count = 0;
  for (const lead of leads) {
    const bucket = Math.floor(Date.now() / day); // إشعار واحد يوميًا كحد أقصى
    if (
      await notify({
        userId: lead.assignedToId!,
        type: 'LEAD_NOT_CONTACTED',
        title: `عميل محتمل بدون تواصل: ${lead.fullName}`,
        body: 'مضى وقت على إضافته دون تسجيل أول تواصل.',
        entityType: 'LEAD',
        entityId: lead.id,
        link: `/leads/${lead.id}`,
        dedupeKey: `LEAD_NOT_CONTACTED:${lead.id}:${bucket}`,
      })
    )
      count++;
  }
  return { key: 'uncontacted_leads', count };
}

/** المتابعات المستحقة والمتأخرة. */
export async function jobFollowUps(): Promise<JobResult> {
  const now = new Date();
  const soon = new Date(now.getTime() + day);

  const [due, overdue] = await Promise.all([
    prisma.followUp.findMany({
      where: { status: 'PENDING', dueAt: { gte: now, lte: soon } },
      include: { lead: { select: { fullName: true } } },
      take: 500,
    }),
    prisma.followUp.findMany({
      where: { status: 'PENDING', dueAt: { lt: now } },
      include: { lead: { select: { fullName: true } } },
      take: 500,
    }),
  ]);

  let count = 0;
  const bucket = Math.floor(Date.now() / day);

  for (const f of due) {
    if (
      await notify({
        userId: f.assignedToId,
        type: 'FOLLOW_UP_DUE',
        title: `متابعة مستحقة: ${f.title}`,
        body: f.lead?.fullName,
        entityType: 'LEAD',
        entityId: f.leadId ?? f.id,
        link: f.leadId ? `/leads/${f.leadId}` : '/leads',
        dedupeKey: `FOLLOW_UP_DUE:${f.id}:${bucket}`,
      })
    )
      count++;
  }

  for (const f of overdue) {
    if (
      await notify({
        userId: f.assignedToId,
        type: 'FOLLOW_UP_OVERDUE',
        title: `متابعة متأخرة: ${f.title}`,
        body: f.lead?.fullName,
        entityType: 'LEAD',
        entityId: f.leadId ?? f.id,
        link: f.leadId ? `/leads/${f.leadId}` : '/leads',
        dedupeKey: `FOLLOW_UP_OVERDUE:${f.id}:${bucket}`,
      })
    )
      count++;
  }

  // المتابعات المتأخرة أكثر من يومين تُعلَّم كفائتة.
  await prisma.followUp.updateMany({
    where: { status: 'PENDING', dueAt: { lt: new Date(now.getTime() - 2 * day) } },
    data: { status: 'MISSED' },
  });

  return { key: 'follow_ups', count };
}

/** المهام المقتربة والمتأخرة. */
export async function jobTaskReminders(): Promise<JobResult> {
  const now = new Date();
  const soon = new Date(now.getTime() + day);
  const openStatuses = ['TODO', 'IN_PROGRESS', 'REVISIONS_REQUIRED', 'WAITING_INTERNAL_REVIEW'];

  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      status: { in: openStatuses as never },
      dueDate: { lte: soon },
    },
    include: { assignees: { select: { userId: true } } },
    take: 1000,
  });

  let count = 0;
  const bucket = Math.floor(Date.now() / day);

  for (const task of tasks) {
    const overdue = task.dueDate! < now;
    for (const a of task.assignees) {
      if (
        await notify({
          userId: a.userId,
          type: overdue ? 'TASK_OVERDUE' : 'TASK_DUE_SOON',
          title: overdue ? `مهمة متأخرة: ${task.title}` : `مهمة تستحق قريبًا: ${task.title}`,
          entityType: 'TASK',
          entityId: task.id,
          link: `/tasks/${task.id}`,
          dedupeKey: `${overdue ? 'TASK_OVERDUE' : 'TASK_DUE_SOON'}:${task.id}:${a.userId}:${bucket}`,
        })
      )
        count++;
    }
  }
  return { key: 'task_reminders', count };
}

/** عروض الأسعار المنتهية والقريبة من الانتهاء. */
export async function jobQuotationExpiry(): Promise<JobResult> {
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * day);

  const expiring = await prisma.quotation.findMany({
    where: {
      deletedAt: null,
      status: { in: ['SENT', 'UNDER_REVIEW', 'REVISED'] },
      expiryDate: { gte: now, lte: soon },
    },
    select: { id: true, number: true, preparedById: true },
    take: 500,
  });

  let count = 0;
  const bucket = Math.floor(Date.now() / day);
  for (const q of expiring) {
    if (
      await notify({
        userId: q.preparedById,
        type: 'QUOTATION_EXPIRING',
        title: `عرض سعر يقارب الانتهاء: ${q.number}`,
        entityType: 'QUOTATION',
        entityId: q.id,
        link: `/quotations/${q.id}`,
        dedupeKey: `QUOTATION_EXPIRING:${q.id}:${bucket}`,
      })
    )
      count++;
  }

  const expired = await prisma.quotation.updateMany({
    where: {
      deletedAt: null,
      status: { in: ['SENT', 'UNDER_REVIEW', 'REVISED', 'APPROVED_INTERNALLY'] },
      expiryDate: { lt: now },
    },
    data: { status: 'EXPIRED' },
  });

  return { key: 'quotation_expiry', count, message: `${expired.count} عرض انتهت صلاحيته` };
}

/** تنبيهات تجديد العقود حسب إعدادات كل عقد. */
export async function jobContractRenewals(): Promise<JobResult> {
  const settings = await getSettings();
  const now = new Date();

  const contracts = await prisma.contract.findMany({
    where: {
      deletedAt: null,
      status: { in: ['ACTIVE', 'EXPIRING_SOON'] },
      renewalDate: { not: null },
    },
    include: { client: { select: { legalName: true, accountManagerId: true } } },
    take: 500,
  });

  let count = 0;
  for (const contract of contracts) {
    const daysLeft = Math.ceil((contract.renewalDate!.getTime() - now.getTime()) / day);
    if (!contract.reminderDays.includes(daysLeft)) continue;

    const targets = new Set<string>([contract.ownerId]);
    if (contract.client.accountManagerId) targets.add(contract.client.accountManagerId);

    for (const userId of targets) {
      if (
        await notify({
          userId,
          type: 'CONTRACT_EXPIRING',
          title: `تجديد عقد بعد ${daysLeft} يوم: ${contract.number}`,
          body: contract.client.legalName,
          entityType: 'CONTRACT',
          entityId: contract.id,
          link: `/contracts/${contract.id}`,
          dedupeKey: `CONTRACT_EXPIRING:${contract.id}:${userId}:${daysLeft}`,
        })
      )
        count++;
    }
  }

  // تحديث حالة العقود المقتربة والمنتهية.
  await prisma.contract.updateMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      endDate: { gte: now, lte: new Date(now.getTime() + settings.contract.expiringSoonDays * day) },
    },
    data: { status: 'EXPIRING_SOON' },
  });
  await prisma.contract.updateMany({
    where: { deletedAt: null, status: { in: ['ACTIVE', 'EXPIRING_SOON'] }, endDate: { lt: now } },
    data: { status: 'EXPIRED' },
  });

  return { key: 'contract_renewals', count };
}

/** الفواتير المتأخرة. */
export async function jobOverdueInvoices(): Promise<JobResult> {
  const count = await refreshOverdueInvoices();
  return { key: 'overdue_invoices', count };
}

/** تقييم المشاريع المعرضة للخطر وتحديث حالتها وإشعار المسؤولين. */
export async function jobProjectRisk(): Promise<JobResult> {
  const projects = await prisma.project.findMany({
    where: { deletedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    select: { id: true, name: true, ownerId: true, accountManagerId: true, status: true },
    take: 500,
  });

  let count = 0;
  const bucket = Math.floor(Date.now() / day);
  for (const project of projects) {
    const reasons = await evaluateProjectRisk(project.id);
    if (!reasons) continue;

    if (project.status !== 'AT_RISK') {
      await prisma.project.update({
        where: { id: project.id },
        data: { status: 'AT_RISK', riskNote: reasons.join('؛ ') },
      });
    }

    const targets = new Set<string>([project.ownerId]);
    if (project.accountManagerId) targets.add(project.accountManagerId);
    for (const userId of targets) {
      if (
        await notify({
          userId,
          type: 'PROJECT_AT_RISK',
          title: `مشروع معرض للخطر: ${project.name}`,
          body: reasons.join('؛ '),
          entityType: 'PROJECT',
          entityId: project.id,
          link: `/projects/${project.id}`,
          dedupeKey: `PROJECT_AT_RISK:${project.id}:${userId}:${bucket}`,
        })
      )
        count++;
    }
  }
  return { key: 'project_risk', count };
}

/** العملاء بلا تواصل لفترة طويلة + مواعيد التجديد. */
export async function jobClientHealth(): Promise<JobResult> {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - 30 * day);

  const clients = await prisma.client.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      OR: [{ lastContactAt: { lt: staleCutoff } }, { lastContactAt: null }],
      accountManagerId: { not: null },
    },
    select: { id: true, legalName: true, accountManagerId: true, renewalDate: true },
    take: 300,
  });

  let count = 0;
  const bucket = Math.floor(Date.now() / (7 * day)); // أسبوعيًا
  for (const client of clients) {
    if (
      await notify({
        userId: client.accountManagerId!,
        type: 'CLIENT_INACTIVE',
        title: `عميل بدون تواصل: ${client.legalName}`,
        body: 'مضى أكثر من ٣٠ يومًا على آخر تواصل مسجَّل.',
        entityType: 'CLIENT',
        entityId: client.id,
        link: `/clients/${client.id}`,
        dedupeKey: `CLIENT_INACTIVE:${client.id}:${bucket}`,
      })
    )
      count++;
  }
  return { key: 'client_health', count };
}

/** توليد المهام المتكررة (Recurring Tasks) — من الـ Worker لا من الواجهة. */
export async function jobRecurringTasks(): Promise<JobResult> {
  const now = new Date();
  const templates = await prisma.task.findMany({
    where: {
      deletedAt: null,
      recurrenceRule: { not: null },
      status: { in: ['COMPLETED', 'APPROVED'] },
      OR: [{ nextRecurrenceAt: null }, { nextRecurrenceAt: { lte: now } }],
    },
    include: { assignees: true, checklist: true },
    take: 200,
  });

  let count = 0;
  for (const task of templates) {
    const intervalDays =
      task.recurrenceRule === 'WEEKLY' ? 7 : task.recurrenceRule === 'MONTHLY' ? 30 : 1;
    const nextDue = task.dueDate
      ? new Date(task.dueDate.getTime() + intervalDays * day)
      : new Date(now.getTime() + intervalDays * day);

    await prisma.task.create({
      data: {
        title: task.title,
        description: task.description,
        clientId: task.clientId,
        projectId: task.projectId,
        departmentId: task.departmentId,
        creatorId: task.creatorId,
        reviewerId: task.reviewerId,
        priority: task.priority,
        status: 'TODO',
        startDate: now,
        dueDate: nextDue,
        estimateMinutes: task.estimateMinutes,
        requiresApproval: task.requiresApproval,
        recurrenceRule: task.recurrenceRule,
        recurrenceParentId: task.id,
        assignees: { create: task.assignees.map((a) => ({ userId: a.userId })) },
        checklist: {
          create: task.checklist.map((c, i) => ({
            title: c.title,
            isRequired: c.isRequired,
            sortOrder: i,
          })),
        },
      },
    });

    await prisma.task.update({
      where: { id: task.id },
      data: { nextRecurrenceAt: new Date(nextDue.getTime() + intervalDays * day) },
    });
    count++;
  }
  return { key: 'recurring_tasks', count };
}

export const ALL_JOBS = [
  jobUncontactedLeads,
  jobFollowUps,
  jobTaskReminders,
  jobQuotationExpiry,
  jobContractRenewals,
  jobOverdueInvoices,
  jobProjectRisk,
  jobClientHealth,
  jobRecurringTasks,
];

export async function runAllJobs() {
  const results: JobResult[] = [];
  for (const job of ALL_JOBS) {
    const startedAt = new Date();
    try {
      const result = await job();
      results.push(result);
      await prisma.jobRun.create({
        data: {
          key: result.key,
          status: 'SUCCESS',
          itemCount: result.count,
          message: result.message,
          startedAt,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[worker] فشل تنفيذ ${job.name}:`, message);
      await prisma.jobRun
        .create({
          data: { key: job.name, status: 'FAILED', message: message.slice(0, 500), startedAt },
        })
        .catch(() => undefined);
      results.push({ key: job.name, count: 0, message: `FAILED: ${message}` });
    }
  }
  return results;
}

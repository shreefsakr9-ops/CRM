import 'server-only';
import { prisma, Prisma } from '@/server/db';
import { can, scopeWhere, scopeOf } from '@/server/auth/guard';
import type { ModuleKey } from '@/server/auth/permissions';
import type { CurrentUser } from '@/server/auth/session';
import { weightedForecast } from './money';

const day = 86_400_000;

export interface ExecutiveBlock {
  activeClients: number;
  newClients: number;
  wonRevenueMinor: number;
  collectedMinor: number;
  outstandingMinor: number;
  pipelineValueMinor: number;
  weightedForecastMinor: number;
  activeProjects: number;
  delayedProjects: number;
  overdueTasks: number;
  renewingContracts: number;
  overdueInvoices: number;
  topServices: { label: string; value: number }[];
  topSources: { label: string; value: number }[];
  atRiskProjects: { id: string; name: string; reason: string }[];
  revenueTrend: { label: string; value: number }[];
  wonRevenuePrevMinor: number;
}

export interface SalesBlock {
  newLeads: number;
  uncontacted: number;
  followUpsDue: number;
  followUpsOverdue: number;
  pipelineValueMinor: number;
  weightedForecastMinor: number;
  wonCount: number;
  lostCount: number;
  avgResponseHours: number | null;
  conversionRate: number | null;
  targetMinor: number;
  achievedMinor: number;
  byStage: { label: string; value: number }[];
}

export interface EmployeeBlock {
  myTasks: number;
  dueToday: number;
  upcoming: number;
  overdue: number;
  mentions: number;
  unreadNotifications: number;
  projects: number;
  weeklyMinutes: number;
  recentComments: {
    id: string;
    body: string;
    author: string;
    createdAt: string;
    entityType: string;
    entityId: string;
  }[];
  agenda: { id: string; title: string; dueDate: string | null; status: string; priority: string }[];
}

export interface OperationsBlock {
  activeProjects: number;
  atRisk: number;
  delayedDeliverables: number;
  pendingInternalReviews: number;
  pendingClientApprovals: number;
  onTimeDeliveryRate: number | null;
  revisionsInternal: number;
  revisionsClient: number;
  workload: { label: string; value: number }[];
}

export interface DashboardData {
  executive?: ExecutiveBlock;
  sales?: SalesBlock;
  employee: EmployeeBlock;
  operations?: OperationsBlock;
}

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function buildDashboard(user: CurrentUser): Promise<DashboardData> {
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfPrevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  const data: DashboardData = { employee: await employeeBlock(user, now) };

  if (can(user, 'reports', 'view_financial') && can(user, 'clients', 'view')) {
    data.executive = await executiveBlock(user, now, startOfMonth, startOfPrevMonth);
  }
  if (can(user, 'leads', 'view') || can(user, 'deals', 'view')) {
    data.sales = await salesBlock(user, now, startOfMonth);
  }
  if (can(user, 'projects', 'view') && can(user, 'tasks', 'view')) {
    data.operations = await operationsBlock(user, now);
  }
  return data;
}

async function employeeBlock(user: CurrentUser, now: Date): Promise<EmployeeBlock> {
  const endOfToday = new Date(now);
  endOfToday.setUTCHours(23, 59, 59, 999);
  const mine: Prisma.TaskWhereInput = {
    deletedAt: null,
    assignees: { some: { userId: user.id } },
    status: { notIn: ['COMPLETED', 'CANCELLED', 'APPROVED'] },
  };

  const [myTasks, dueToday, upcoming, overdue, mentions, unread, projects, weekly, comments, agenda] =
    await Promise.all([
      prisma.task.count({ where: mine }),
      prisma.task.count({ where: { ...mine, dueDate: { lte: endOfToday, gte: new Date(now.getTime() - day) } } }),
      prisma.task.count({
        where: { ...mine, dueDate: { gt: endOfToday, lte: new Date(now.getTime() + 7 * day) } },
      }),
      prisma.task.count({ where: { ...mine, dueDate: { lt: now } } }),
      prisma.commentMention.count({ where: { userId: user.id } }),
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
      prisma.project.count({
        where: {
          deletedAt: null,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          OR: [
            { ownerId: user.id },
            { accountManagerId: user.id },
            { members: { some: { userId: user.id } } },
          ],
        },
      }),
      prisma.timeEntry.aggregate({
        where: { userId: user.id, spentOn: { gte: new Date(now.getTime() - 7 * day) } },
        _sum: { minutes: true },
      }),
      prisma.comment.findMany({
        where: { deletedAt: null, mentions: { some: { userId: user.id } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { author: { select: { name: true } } },
      }),
      prisma.task.findMany({
        where: mine,
        orderBy: [{ dueDate: 'asc' }],
        take: 8,
        select: { id: true, title: true, dueDate: true, status: true, priority: true },
      }),
    ]);

  return {
    myTasks,
    dueToday,
    upcoming,
    overdue,
    mentions,
    unreadNotifications: unread,
    projects,
    weeklyMinutes: weekly._sum.minutes ?? 0,
    recentComments: comments.map((c) => ({
      id: c.id,
      body: c.body.slice(0, 160),
      author: c.author.name,
      createdAt: c.createdAt.toISOString(),
      entityType: c.entityType,
      entityId: c.entityId,
    })),
    agenda: agenda.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate?.toISOString() ?? null,
      status: t.status,
      priority: t.priority,
    })),
  };
}

async function salesBlock(user: CurrentUser, now: Date, startOfMonth: Date): Promise<SalesBlock> {
  const leadScope = scopeWhere(user, 'leads', ['assignedToId', 'createdById']);
  const dealScope = scopeWhere(user, 'deals', ['ownerId', 'createdById']);

  const [newLeads, uncontacted, followUpsDue, followUpsOverdue, openDeals, won, lost, leadTotal, wonFromLeads] =
    await Promise.all([
      prisma.lead.count({ where: { deletedAt: null, ...leadScope, createdAt: { gte: startOfMonth } } }),
      prisma.lead.count({
        where: { deletedAt: null, ...leadScope, firstContactAt: null, status: { in: ['NEW', 'WORKING'] } },
      }),
      prisma.followUp.count({
        where: {
          status: 'PENDING',
          assignedToId: { in: scopeIds(user, 'leads') },
          dueAt: { gte: now, lte: new Date(now.getTime() + 2 * day) },
        },
      }),
      prisma.followUp.count({
        where: { status: 'PENDING', assignedToId: { in: scopeIds(user, 'leads') }, dueAt: { lt: now } },
      }),
      prisma.deal.findMany({
        where: { deletedAt: null, ...dealScope, status: 'OPEN' },
        select: { valueMinor: true, probability: true, stage: { select: { nameAr: true } } },
      }),
      prisma.deal.count({ where: { deletedAt: null, ...dealScope, status: 'WON', actualCloseDate: { gte: startOfMonth } } }),
      prisma.deal.count({ where: { deletedAt: null, ...dealScope, status: 'LOST' } }),
      prisma.lead.count({ where: { deletedAt: null, ...leadScope } }),
      prisma.lead.count({ where: { deletedAt: null, ...leadScope, status: 'CONVERTED' } }),
    ]);

  const pipelineValue = openDeals.reduce((s, d) => s + d.valueMinor, 0n);
  const forecast = openDeals.reduce(
    (s, d) => s + weightedForecast(d.valueMinor, d.probability.toString()),
    0n,
  );

  const byStageMap = new Map<string, number>();
  for (const d of openDeals) {
    const k = d.stage.nameAr;
    byStageMap.set(k, (byStageMap.get(k) ?? 0) + Number(d.valueMinor) / 100);
  }

  // متوسط زمن الاستجابة = الفارق بين إنشاء الـ Lead وأول تواصل
  const responded = await prisma.lead.findMany({
    where: { deletedAt: null, ...leadScope, firstContactAt: { not: null } },
    select: { createdAt: true, firstContactAt: true },
    take: 300,
    orderBy: { createdAt: 'desc' },
  });
  // نتجاهل القيم السالبة (بيانات مستوردة أو مصححة يدويًا) حتى لا يظهر زمن استجابة سالب.
  const responseHours = responded
    .map((l) => (l.firstContactAt!.getTime() - l.createdAt.getTime()) / 3_600_000)
    .filter((h) => h >= 0);
  const avgResponseHours = responseHours.length
    ? responseHours.reduce((a, b) => a + b, 0) / responseHours.length
    : null;

  const wonRevenue = await prisma.deal.aggregate({
    where: { deletedAt: null, ...dealScope, status: 'WON', actualCloseDate: { gte: startOfMonth } },
    _sum: { valueMinor: true },
  });

  const target = await prisma.user.aggregate({
    where: { id: { in: scopeIds(user, 'deals') } },
    _sum: { salesTargetMinor: true },
  });

  return {
    newLeads,
    uncontacted,
    followUpsDue,
    followUpsOverdue,
    pipelineValueMinor: Number(pipelineValue),
    weightedForecastMinor: Number(forecast),
    wonCount: won,
    lostCount: lost,
    avgResponseHours,
    conversionRate: leadTotal > 0 ? (wonFromLeads / leadTotal) * 100 : null,
    targetMinor: Number(target._sum.salesTargetMinor ?? 0n),
    achievedMinor: Number(wonRevenue._sum.valueMinor ?? 0n),
    byStage: Array.from(byStageMap, ([label, value]) => ({ label, value })).sort(
      (a, b) => b.value - a.value,
    ),
  };
}

/**
 * قائمة المستخدمين الذين يحق للمستخدم رؤية سجلاتهم.
 * `undefined` تعني ALL — أي بدون تقييد على المستخدم.
 */
function scopeIds(user: CurrentUser, module: ModuleKey): string[] | undefined {
  const scope = scopeOf(user, module);
  if (scope === 'ALL') return undefined;
  return scope === 'TEAM' ? user.teamIds : [user.id];
}

async function executiveBlock(
  user: CurrentUser,
  now: Date,
  startOfMonth: Date,
  startOfPrevMonth: Date,
): Promise<ExecutiveBlock> {
  const [
    activeClients,
    newClients,
    wonAgg,
    wonPrevAgg,
    collectedAgg,
    invoiceAgg,
    openDeals,
    activeProjects,
    delayedProjects,
    overdueTasks,
    renewingContracts,
    overdueInvoices,
    topServicesRaw,
    topSourcesRaw,
    atRisk,
    payments12,
  ] = await Promise.all([
    prisma.client.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
    prisma.client.count({ where: { deletedAt: null, createdAt: { gte: startOfMonth } } }),
    prisma.deal.aggregate({
      where: { deletedAt: null, status: 'WON', actualCloseDate: { gte: startOfMonth } },
      _sum: { valueMinor: true },
    }),
    prisma.deal.aggregate({
      where: {
        deletedAt: null,
        status: 'WON',
        actualCloseDate: { gte: startOfPrevMonth, lt: startOfMonth },
      },
      _sum: { valueMinor: true },
    }),
    prisma.payment.aggregate({ where: { deletedAt: null }, _sum: { amountMinor: true } }),
    prisma.invoice.aggregate({
      where: { deletedAt: null, status: { notIn: ['DRAFT', 'CANCELLED'] } },
      _sum: { totalMinor: true, paidMinor: true },
    }),
    prisma.deal.findMany({
      where: { deletedAt: null, status: 'OPEN' },
      select: { valueMinor: true, probability: true },
    }),
    prisma.project.count({
      where: { deletedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    }),
    prisma.project.count({
      where: {
        deletedAt: null,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
        endDate: { lt: now },
      },
    }),
    prisma.task.count({
      where: {
        deletedAt: null,
        status: { notIn: ['COMPLETED', 'CANCELLED', 'APPROVED'] },
        dueDate: { lt: now },
      },
    }),
    prisma.contract.count({
      where: {
        deletedAt: null,
        status: { in: ['ACTIVE', 'EXPIRING_SOON'] },
        renewalDate: { gte: now, lte: new Date(now.getTime() + 30 * day) },
      },
    }),
    prisma.invoice.count({ where: { deletedAt: null, status: 'OVERDUE' } }),
    prisma.deal.groupBy({
      by: ['serviceId'],
      where: { deletedAt: null, status: 'WON', serviceId: { not: null } },
      _sum: { valueMinor: true },
      orderBy: { _sum: { valueMinor: 'desc' } },
      take: 6,
    }),
    prisma.lead.groupBy({
      by: ['sourceId'],
      where: { deletedAt: null, sourceId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { sourceId: 'desc' } },
      take: 6,
    }),
    prisma.project.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
        OR: [
          { status: 'AT_RISK' },
          { endDate: { lt: new Date(now.getTime() + 7 * day) }, progressPercent: { lt: 70 } },
        ],
      },
      select: { id: true, name: true, endDate: true, progressPercent: true, status: true },
      take: 6,
    }),
    prisma.payment.findMany({
      where: { deletedAt: null, paidAt: { gte: new Date(now.getTime() - 365 * day) } },
      select: { amountMinor: true, paidAt: true },
    }),
  ]);

  const serviceNames = Object.fromEntries(
    (
      await prisma.service.findMany({
        where: { id: { in: topServicesRaw.map((s) => s.serviceId!).filter(Boolean) } },
        select: { id: true, nameAr: true },
      })
    ).map((s) => [s.id, s.nameAr]),
  );
  const sourceNames = Object.fromEntries(
    (
      await prisma.leadSource.findMany({
        where: { id: { in: topSourcesRaw.map((s) => s.sourceId!).filter(Boolean) } },
        select: { id: true, nameAr: true },
      })
    ).map((s) => [s.id, s.nameAr]),
  );

  const trendMap = new Map<string, number>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    trendMap.set(monthKey(d), 0);
  }
  for (const p of payments12) {
    const k = monthKey(p.paidAt);
    if (trendMap.has(k)) trendMap.set(k, trendMap.get(k)! + Number(p.amountMinor) / 100);
  }

  const total = Number(invoiceAgg._sum.totalMinor ?? 0n);
  const paid = Number(invoiceAgg._sum.paidMinor ?? 0n);

  return {
    activeClients,
    newClients,
    wonRevenueMinor: Number(wonAgg._sum.valueMinor ?? 0n),
    wonRevenuePrevMinor: Number(wonPrevAgg._sum.valueMinor ?? 0n),
    collectedMinor: Number(collectedAgg._sum.amountMinor ?? 0n),
    outstandingMinor: Math.max(0, total - paid),
    pipelineValueMinor: Number(openDeals.reduce((s, d) => s + d.valueMinor, 0n)),
    weightedForecastMinor: Number(
      openDeals.reduce((s, d) => s + weightedForecast(d.valueMinor, d.probability.toString()), 0n),
    ),
    activeProjects,
    delayedProjects,
    overdueTasks,
    renewingContracts,
    overdueInvoices,
    topServices: topServicesRaw.map((s) => ({
      label: serviceNames[s.serviceId!] ?? '—',
      value: Number(s._sum.valueMinor ?? 0n) / 100,
    })),
    topSources: topSourcesRaw.map((s) => ({
      label: sourceNames[s.sourceId!] ?? '—',
      value: s._count._all,
    })),
    atRiskProjects: atRisk.map((p) => ({
      id: p.id,
      name: p.name,
      reason:
        p.status === 'AT_RISK'
          ? 'معلَّم كمعرض للخطر'
          : `التقدم ${p.progressPercent}% مع اقتراب موعد التسليم`,
    })),
    revenueTrend: Array.from(trendMap, ([label, value]) => ({ label: label.slice(5), value })),
  };
}

async function operationsBlock(user: CurrentUser, now: Date): Promise<OperationsBlock> {
  const [
    activeProjects,
    atRisk,
    delayedDeliverables,
    pendingInternalReviews,
    pendingClientApprovals,
    completedTasks,
    onTimeTasks,
    revisionsInternal,
    revisionsClient,
    workloadRaw,
  ] = await Promise.all([
    prisma.project.count({ where: { deletedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
    prisma.project.count({ where: { deletedAt: null, status: 'AT_RISK' } }),
    prisma.deliverable.count({
      where: { status: { notIn: ['APPROVED', 'DELIVERED', 'CANCELLED'] }, dueDate: { lt: now } },
    }),
    prisma.task.count({ where: { deletedAt: null, status: 'WAITING_INTERNAL_REVIEW' } }),
    prisma.task.count({ where: { deletedAt: null, status: 'WAITING_CLIENT' } }),
    prisma.task.count({ where: { deletedAt: null, status: { in: ['COMPLETED', 'APPROVED'] } } }),
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM tasks
      WHERE "deletedAt" IS NULL AND "completedAt" IS NOT NULL
        AND ("dueDate" IS NULL OR "completedAt" <= "dueDate")
    `,
    prisma.revisionRequest.count({ where: { source: 'INTERNAL' } }),
    prisma.revisionRequest.count({ where: { source: 'CLIENT' } }),
    prisma.taskAssignee.groupBy({
      by: ['userId'],
      _count: { _all: true },
      orderBy: { _count: { userId: 'desc' } },
      take: 8,
    }),
  ]);

  const names = Object.fromEntries(
    (
      await prisma.user.findMany({
        where: { id: { in: workloadRaw.map((w) => w.userId) } },
        select: { id: true, name: true },
      })
    ).map((u) => [u.id, u.name]),
  );

  const onTime = Number(onTimeTasks[0]?.count ?? 0n);

  return {
    activeProjects,
    atRisk,
    delayedDeliverables,
    pendingInternalReviews,
    pendingClientApprovals,
    onTimeDeliveryRate: completedTasks > 0 ? (onTime / completedTasks) * 100 : null,
    revisionsInternal,
    revisionsClient,
    workload: workloadRaw.map((w) => ({ label: names[w.userId] ?? '—', value: w._count._all })),
  };
}

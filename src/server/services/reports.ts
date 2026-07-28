import 'server-only';
import { prisma } from '@/server/db';
import { requirePermission, can, scopeWhere } from '@/server/auth/guard';
import { audit } from './audit';
import { cpl, conversionRate, roas, projectProfit, weightedForecast } from './money';
import { getSettings } from './settings';

export interface DateRange {
  from: Date;
  to: Date;
}

export function parseRange(fromStr?: string, toStr?: string): DateRange {
  const to = toStr ? new Date(toStr) : new Date();
  const from = fromStr ? new Date(fromStr) : new Date(to.getTime() - 30 * 86_400_000);
  to.setUTCHours(23, 59, 59, 999);
  return { from, to };
}

/** الفترة السابقة بنفس الطول — للمقارنة. */
export function previousRange(range: DateRange): DateRange {
  const length = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - length), to: new Date(range.from.getTime() - 1) };
}

/* ── تقارير المبيعات ────────────────────────────────── */

export async function salesReport(range: DateRange) {
  const user = await requirePermission('reports', 'view');
  const leadScope = scopeWhere(user, 'leads', ['assignedToId', 'createdById']);
  const dealScope = scopeWhere(user, 'deals', ['ownerId', 'createdById']);
  const showMoney = can(user, 'reports', 'view_financial');

  const inRange = { gte: range.from, lte: range.to };

  const [
    leadsBySource,
    leadsByCampaign,
    leadsByAgent,
    leadsByService,
    uncontacted,
    totalLeads,
    convertedLeads,
    qualifiedLeads,
    openDeals,
    wonDeals,
    lostDeals,
    lossReasons,
    ownerPerformance,
    responseRows,
    followUpStats,
  ] = await Promise.all([
    prisma.lead.groupBy({
      by: ['sourceId'],
      where: { deletedAt: null, ...leadScope, createdAt: inRange },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ['campaign'],
      where: { deletedAt: null, ...leadScope, createdAt: inRange, campaign: { not: null } },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ['assignedToId'],
      where: { deletedAt: null, ...leadScope, createdAt: inRange },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ['interestedServiceId'],
      where: {
        deletedAt: null,
        ...leadScope,
        createdAt: inRange,
        interestedServiceId: { not: null },
      },
      _count: { _all: true },
    }),
    prisma.lead.count({
      where: { deletedAt: null, ...leadScope, firstContactAt: null, status: { in: ['NEW', 'WORKING'] } },
    }),
    prisma.lead.count({ where: { deletedAt: null, ...leadScope, createdAt: inRange } }),
    prisma.lead.count({ where: { deletedAt: null, ...leadScope, status: 'CONVERTED', createdAt: inRange } }),
    prisma.lead.count({
      where: { deletedAt: null, ...leadScope, status: { in: ['QUALIFIED', 'CONVERTED'] }, createdAt: inRange },
    }),
    prisma.deal.findMany({
      where: { deletedAt: null, ...dealScope, status: 'OPEN' },
      select: { valueMinor: true, probability: true },
    }),
    prisma.deal.findMany({
      where: { deletedAt: null, ...dealScope, status: 'WON', actualCloseDate: inRange },
      select: { valueMinor: true, createdAt: true, actualCloseDate: true },
    }),
    prisma.deal.count({ where: { deletedAt: null, ...dealScope, status: 'LOST', actualCloseDate: inRange } }),
    prisma.deal.groupBy({
      by: ['lossReasonId'],
      where: { deletedAt: null, ...dealScope, status: 'LOST', lossReasonId: { not: null } },
      _count: { _all: true },
    }),
    prisma.deal.groupBy({
      by: ['ownerId'],
      where: { deletedAt: null, ...dealScope, status: 'WON', actualCloseDate: inRange },
      _sum: { valueMinor: true },
      _count: { _all: true },
    }),
    prisma.lead.findMany({
      where: { deletedAt: null, ...leadScope, firstContactAt: { not: null }, createdAt: inRange },
      select: { createdAt: true, firstContactAt: true },
      take: 1000,
    }),
    prisma.followUp.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const [sources, agents, services, reasons] = await Promise.all([
    prisma.leadSource.findMany({ select: { id: true, nameAr: true } }),
    prisma.user.findMany({ select: { id: true, name: true } }),
    prisma.service.findMany({ select: { id: true, nameAr: true } }),
    prisma.lossReason.findMany({ select: { id: true, nameAr: true } }),
  ]);
  const nameOf = <T extends { id: string }>(list: T[], id: string | null, key: keyof T) =>
    (id ? (list.find((x) => x.id === id)?.[key] as string | undefined) : undefined) ?? 'غير محدد';

  const wonValue = wonDeals.reduce((s, d) => s + d.valueMinor, 0n);
  const responseHours = responseRows
    .map((l) => (l.firstContactAt!.getTime() - l.createdAt.getTime()) / 3_600_000)
    .filter((h) => h >= 0);
  const avgResponseHours = responseHours.length
    ? responseHours.reduce((a, b) => a + b, 0) / responseHours.length
    : null;
  const cycleDays = wonDeals
    .map((d) => (d.actualCloseDate!.getTime() - d.createdAt.getTime()) / 86_400_000)
    .filter((d) => d >= 0);
  const avgCycleDays = cycleDays.length
    ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length
    : null;

  const totalFollowUps = followUpStats.reduce((s, f) => s + f._count._all, 0);
  const doneFollowUps = followUpStats.find((f) => f.status === 'DONE')?._count._all ?? 0;

  return {
    showMoney,
    totals: {
      leads: totalLeads,
      uncontacted,
      qualified: qualifiedLeads,
      converted: convertedLeads,
      wonCount: wonDeals.length,
      lostCount: lostDeals,
      pipelineValueMinor: showMoney ? Number(openDeals.reduce((s, d) => s + d.valueMinor, 0n)) : null,
      weightedForecastMinor: showMoney
        ? Number(
            openDeals.reduce((s, d) => s + weightedForecast(d.valueMinor, d.probability.toString()), 0n),
          )
        : null,
      wonValueMinor: showMoney ? Number(wonValue) : null,
      avgDealValueMinor: showMoney && wonDeals.length ? Number(wonValue) / wonDeals.length : null,
      leadToWonRate: totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : null,
      qualifiedToWonRate: qualifiedLeads > 0 ? (wonDeals.length / qualifiedLeads) * 100 : null,
      winRate:
        wonDeals.length + lostDeals > 0
          ? (wonDeals.length / (wonDeals.length + lostDeals)) * 100
          : null,
      avgResponseHours,
      avgCycleDays,
      followUpCompliance: totalFollowUps > 0 ? (doneFollowUps / totalFollowUps) * 100 : null,
    },
    bySource: leadsBySource.map((r) => ({
      label: nameOf(sources, r.sourceId, 'nameAr'),
      value: r._count._all,
    })),
    byCampaign: leadsByCampaign.map((r) => ({ label: r.campaign ?? 'غير محدد', value: r._count._all })),
    byAgent: leadsByAgent.map((r) => ({
      label: nameOf(agents, r.assignedToId, 'name'),
      value: r._count._all,
    })),
    byService: leadsByService.map((r) => ({
      label: nameOf(services, r.interestedServiceId, 'nameAr'),
      value: r._count._all,
    })),
    lossReasons: lossReasons.map((r) => ({
      label: nameOf(reasons, r.lossReasonId, 'nameAr'),
      value: r._count._all,
    })),
    ownerPerformance: ownerPerformance.map((r) => ({
      label: nameOf(agents, r.ownerId, 'name'),
      value: showMoney ? Number(r._sum.valueMinor ?? 0n) / 100 : r._count._all,
      count: r._count._all,
    })),
  };
}

/* ── تقارير العمليات ────────────────────────────────── */

export async function operationsReport(range: DateRange) {
  await requirePermission('reports', 'view');
  const inRange = { gte: range.from, lte: range.to };

  const [
    projectsByStatus,
    overdueTasks,
    blockedTasks,
    workload,
    timeStats,
    revisionsBySource,
    delayBreakdown,
    completedTasks,
    onTimeRows,
    deptBottlenecks,
  ] = await Promise.all([
    prisma.project.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.task.count({
      where: {
        deletedAt: null,
        status: { notIn: ['COMPLETED', 'CANCELLED', 'APPROVED'] },
        dueDate: { lt: new Date() },
      },
    }),
    prisma.task.count({ where: { deletedAt: null, delayReason: 'BLOCKED' } }),
    prisma.taskAssignee.groupBy({ by: ['userId'], _count: { _all: true } }),
    prisma.task.aggregate({
      where: { deletedAt: null, completedAt: inRange },
      _sum: { actualMinutes: true, estimateMinutes: true, clientWaitMinutes: true, reviewMinutes: true },
      _count: { _all: true },
    }),
    prisma.revisionRequest.groupBy({ by: ['source'], _count: { _all: true } }),
    prisma.task.groupBy({
      by: ['delayReason'],
      where: { deletedAt: null, delayReason: { not: 'NONE' } },
      _count: { _all: true },
    }),
    prisma.task.count({ where: { deletedAt: null, completedAt: inRange } }),
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM tasks
      WHERE "deletedAt" IS NULL AND "completedAt" IS NOT NULL
        AND "completedAt" BETWEEN ${range.from} AND ${range.to}
        AND ("dueDate" IS NULL OR "completedAt" <= "dueDate")
    `,
    prisma.task.groupBy({
      by: ['departmentId'],
      where: {
        deletedAt: null,
        status: { notIn: ['COMPLETED', 'CANCELLED', 'APPROVED'] },
        departmentId: { not: null },
      },
      _count: { _all: true },
    }),
  ]);

  const [users, departments] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true } }),
    prisma.department.findMany({ select: { id: true, nameAr: true } }),
  ]);

  const onTime = Number(onTimeRows[0]?.count ?? 0n);

  return {
    projectsByStatus: projectsByStatus.map((r) => ({ label: r.status, value: r._count._all })),
    overdueTasks,
    blockedTasks,
    completedTasks,
    onTimeDeliveryRate: completedTasks > 0 ? (onTime / completedTasks) * 100 : null,
    estimatedMinutes: timeStats._sum.estimateMinutes ?? 0,
    actualMinutes: timeStats._sum.actualMinutes ?? 0,
    clientWaitMinutes: timeStats._sum.clientWaitMinutes ?? 0,
    reviewMinutes: timeStats._sum.reviewMinutes ?? 0,
    workload: workload
      .map((w) => ({
        label: users.find((u) => u.id === w.userId)?.name ?? '—',
        value: w._count._all,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12),
    revisionsBySource: revisionsBySource.map((r) => ({ label: r.source, value: r._count._all })),
    delayBreakdown: delayBreakdown.map((r) => ({ label: r.delayReason, value: r._count._all })),
    departmentBottlenecks: deptBottlenecks.map((r) => ({
      label: departments.find((d) => d.id === r.departmentId)?.nameAr ?? '—',
      value: r._count._all,
    })),
  };
}

/* ── التقارير المالية ───────────────────────────────── */

export async function financialReport(range: DateRange) {
  const user = await requirePermission('reports', 'view_financial');
  const showProfit = can(user, 'reports', 'view_cost_profit');
  const settings = await getSettings();
  const inRange = { gte: range.from, lte: range.to };

  const [invoiceAgg, collected, overdueAgg, byClient, byService, byCurrency, expenses, recurring] =
    await Promise.all([
      prisma.invoice.aggregate({
        where: { deletedAt: null, status: { notIn: ['DRAFT', 'CANCELLED'] }, issueDate: inRange },
        _sum: { totalMinor: true, paidMinor: true },
        _count: { _all: true },
      }),
      prisma.payment.aggregate({
        where: { deletedAt: null, paidAt: inRange },
        _sum: { amountMinor: true },
      }),
      prisma.invoice.aggregate({
        where: { deletedAt: null, status: 'OVERDUE' },
        _sum: { totalMinor: true, paidMinor: true },
        _count: { _all: true },
      }),
      prisma.invoice.groupBy({
        by: ['clientId'],
        where: { deletedAt: null, status: { notIn: ['DRAFT', 'CANCELLED'] }, issueDate: inRange },
        _sum: { totalMinor: true, paidMinor: true },
      }),
      prisma.deal.groupBy({
        by: ['serviceId'],
        where: { deletedAt: null, status: 'WON', actualCloseDate: inRange, serviceId: { not: null } },
        _sum: { valueMinor: true },
      }),
      prisma.invoice.groupBy({
        by: ['currency'],
        where: { deletedAt: null, status: { notIn: ['DRAFT', 'CANCELLED'] }, issueDate: inRange },
        _sum: { totalMinor: true },
      }),
      prisma.expense.groupBy({
        by: ['category'],
        where: { deletedAt: null, spentOn: inRange },
        _sum: { amountMinor: true },
      }),
      prisma.contract.aggregate({
        where: { deletedAt: null, status: { in: ['ACTIVE', 'EXPIRING_SOON'] } },
        _sum: { valueMinor: true },
        _count: { _all: true },
      }),
    ]);

  const [clients, services] = await Promise.all([
    prisma.client.findMany({ select: { id: true, legalName: true, brandName: true } }),
    prisma.service.findMany({ select: { id: true, nameAr: true } }),
  ]);

  const totalExpensesMinor = expenses.reduce((s, e) => s + Number(e._sum.amountMinor ?? 0n), 0);
  const collectedMinor = Number(collected._sum.amountMinor ?? 0n);

  // ربحية المشاريع — الإيراد المعترف به مقابل التكاليف المباشرة.
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    take: 100,
  });
  const profitability = showProfit
    ? await Promise.all(
        projects.map(async (p) => {
          const [inv, exp] = await Promise.all([
            prisma.invoice.aggregate({
              where: { projectId: p.id, deletedAt: null, status: { notIn: ['DRAFT', 'CANCELLED'] } },
              _sum: { paidMinor: true },
            }),
            prisma.expense.aggregate({
              where: { projectId: p.id, deletedAt: null },
              _sum: { amountMinor: true },
            }),
          ]);
          const result = projectProfit({
            recognizedRevenueMinor: inv._sum.paidMinor ?? 0n,
            directCostsMinor: exp._sum.amountMinor ?? 0n,
            includeIndirect: settings.finance.includeIndirectCosts,
          });
          return {
            id: p.id,
            name: p.name,
            revenueMinor: Number(inv._sum.paidMinor ?? 0n),
            costsMinor: Number(exp._sum.amountMinor ?? 0n),
            profitMinor: Number(result.profitMinor),
            marginPercent: result.marginPercent,
          };
        }),
      )
    : [];

  return {
    showProfit,
    includedIndirect: settings.finance.includeIndirectCosts,
    invoicedMinor: Number(invoiceAgg._sum.totalMinor ?? 0n),
    invoiceCount: invoiceAgg._count._all,
    collectedMinor,
    outstandingMinor: Number((invoiceAgg._sum.totalMinor ?? 0n) - (invoiceAgg._sum.paidMinor ?? 0n)),
    overdueMinor: Number((overdueAgg._sum.totalMinor ?? 0n) - (overdueAgg._sum.paidMinor ?? 0n)),
    overdueCount: overdueAgg._count._all,
    recurringValueMinor: Number(recurring._sum.valueMinor ?? 0n),
    recurringCount: recurring._count._all,
    expensesMinor: totalExpensesMinor,
    byClient: byClient
      .map((r) => {
        const c = clients.find((x) => x.id === r.clientId);
        return {
          label: c?.brandName || c?.legalName || '—',
          value: Number(r._sum.totalMinor ?? 0n) / 100,
          collected: Number(r._sum.paidMinor ?? 0n) / 100,
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 10),
    byService: byService.map((r) => ({
      label: services.find((s) => s.id === r.serviceId)?.nameAr ?? '—',
      value: Number(r._sum.valueMinor ?? 0n) / 100,
    })),
    byCurrency: byCurrency.map((r) => ({
      label: r.currency,
      value: Number(r._sum.totalMinor ?? 0n) / 100,
    })),
    expensesByCategory: expenses.map((r) => ({
      label: r.category,
      value: Number(r._sum.amountMinor ?? 0n) / 100,
    })),
    profitability: profitability.sort((a, b) => b.profitMinor - a.profitMinor).slice(0, 15),
  };
}

/* ── تقارير أداء التسويق ────────────────────────────── */

export async function marketingReport(range: DateRange) {
  await requirePermission('reports', 'view');
  const rows = await prisma.campaignPerformance.findMany({
    where: { periodStart: { gte: range.from }, periodEnd: { lte: range.to } },
    orderBy: { periodStart: 'desc' },
  });

  return rows.map((r) => {
    const cplMetric = cpl(r.adSpendMinor, r.leadsCount);
    const convMetric = conversionRate(r.salesCount, r.leadsCount);
    const roasMetric = roas(r.revenueMinor, r.adSpendMinor);
    return {
      id: r.id,
      platform: r.platform,
      campaignName: r.campaignName,
      periodStart: r.periodStart.toISOString(),
      periodEnd: r.periodEnd.toISOString(),
      adSpendMinor: Number(r.adSpendMinor),
      currency: r.currency,
      leads: r.leadsCount,
      qualified: r.qualifiedCount,
      bookings: r.bookingsCount,
      sales: r.salesCount,
      revenueMinor: Number(r.revenueMinor),
      // القسمة على صفر تُعاد كحالة «بيانات غير كافية» بدلًا من رقم مضلل.
      cpl: cplMetric.sufficient ? cplMetric.value : null,
      conversionRate: convMetric.sufficient ? convMetric.value : null,
      roas: roasMetric.sufficient ? roasMetric.value : null,
    };
  });
}

export async function logReportExport(reportKey: string, rowCount: number) {
  const user = await requirePermission('reports', 'export');
  await audit({
    userId: user.id,
    action: 'EXPORT',
    module: 'reports',
    entityType: 'SETTING',
    entityId: reportKey,
    summary: `تصدير تقرير ${reportKey} (${rowCount} صف)`,
  });
}

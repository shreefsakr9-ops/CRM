import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import {
  requirePermission,
  can,
  scopeWhere,
  NotFound,
  BadRequest,
} from '@/server/auth/guard';
import { audit, diff } from './audit';
import { weightedForecast } from './money';

const OWNER_FIELDS = ['ownerId', 'createdById'];

export const dealSchema = z.object({
  title: z.string().trim().min(2, 'عنوان الصفقة مطلوب'),
  clientId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  serviceId: z.string().optional().nullable(),
  value: z.coerce.number().min(0).default(0),
  currency: z.string().default('EGP'),
  stageId: z.string().min(1, 'المرحلة مطلوبة'),
  ownerId: z.string().optional().nullable(),
  expectedCloseDate: z.string().optional().nullable(),
  competitor: z.string().trim().optional().nullable(),
  objections: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export type DealInput = z.infer<typeof dealSchema>;

export async function listDeals(filters: {
  q?: string;
  stageId?: string;
  status?: string;
  ownerId?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  dir?: 'asc' | 'desc';
}) {
  const user = await requirePermission('deals', 'view');
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, filters.pageSize ?? 25);

  const where: Prisma.DealWhereInput = {
    deletedAt: null,
    ...scopeWhere(user, 'deals', OWNER_FIELDS),
    ...(filters.stageId ? { stageId: filters.stageId } : {}),
    ...(filters.status ? { status: filters.status as never } : {}),
    ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
    ...(filters.q ? { title: { contains: filters.q, mode: 'insensitive' } } : {}),
  };

  const sortable: Record<string, string> = {
    title: 'title',
    value: 'valueMinor',
    expectedCloseDate: 'expectedCloseDate',
    createdAt: 'createdAt',
  };
  const orderBy = sortable[filters.sort ?? '']
    ? { [sortable[filters.sort!]!]: filters.dir ?? 'desc' }
    : { createdAt: 'desc' as const };

  const [rows, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        stage: { select: { id: true, nameAr: true, color: true, probability: true } },
        owner: { select: { id: true, name: true, avatarUrl: true } },
        client: { select: { id: true, legalName: true, brandName: true } },
        lead: { select: { id: true, fullName: true } },
        service: { select: { nameAr: true } },
        lossReason: { select: { nameAr: true } },
      },
    }),
    prisma.deal.count({ where }),
  ]);

  const showMoney = can(user, 'deals', 'view_financial');
  return {
    rows: rows.map((r) => ({ ...r, valueMinor: showMoney ? r.valueMinor : null })),
    total,
    page,
    pageSize,
  };
}

/** لوحة Kanban — كل مرحلة مع صفقاتها ومجموع قيمتها. */
export async function pipelineBoard(ownerId?: string) {
  const user = await requirePermission('deals', 'view');
  const showMoney = can(user, 'deals', 'view_financial');

  const [stages, deals] = await Promise.all([
    prisma.pipelineStage.findMany({
      where: { pipeline: 'DEAL', isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.deal.findMany({
      where: {
        deletedAt: null,
        status: 'OPEN',
        ...scopeWhere(user, 'deals', OWNER_FIELDS),
        ...(ownerId ? { ownerId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        owner: { select: { id: true, name: true, avatarUrl: true } },
        client: { select: { legalName: true, brandName: true } },
        lead: { select: { fullName: true } },
      },
    }),
  ]);

  return stages.map((stage) => {
    const items = deals.filter((d) => d.stageId === stage.id);
    const totalMinor = items.reduce((s, d) => s + d.valueMinor, 0n);
    return {
      stage: {
        id: stage.id,
        nameAr: stage.nameAr,
        nameEn: stage.nameEn,
        color: stage.color,
        probability: Number(stage.probability),
        isWon: stage.isWon,
        isLost: stage.isLost,
      },
      totalMinor: showMoney ? Number(totalMinor) : null,
      weightedMinor: showMoney
        ? Number(weightedForecast(totalMinor, stage.probability.toString()))
        : null,
      deals: items.map((d) => ({
        id: d.id,
        title: d.title,
        valueMinor: showMoney ? Number(d.valueMinor) : null,
        currency: d.currency,
        expectedCloseDate: d.expectedCloseDate?.toISOString() ?? null,
        owner: d.owner,
        clientName: d.client?.brandName || d.client?.legalName || d.lead?.fullName || null,
      })),
    };
  });
}

export async function getDeal(id: string) {
  const user = await requirePermission('deals', 'view');
  const deal = await prisma.deal.findFirst({
    where: { id, deletedAt: null, ...scopeWhere(user, 'deals', OWNER_FIELDS) },
    include: {
      stage: true,
      owner: { select: { id: true, name: true, avatarUrl: true } },
      client: { select: { id: true, legalName: true, brandName: true } },
      lead: { select: { id: true, fullName: true } },
      service: { select: { id: true, nameAr: true } },
      lossReason: true,
      quotations: {
        where: { deletedAt: null },
        select: { id: true, number: true, status: true, totalMinor: true, currency: true },
      },
      projects: { where: { deletedAt: null }, select: { id: true, name: true, status: true } },
      stageHistory: {
        orderBy: { movedAt: 'desc' },
        include: {
          fromStage: { select: { nameAr: true } },
          toStage: { select: { nameAr: true } },
          movedBy: { select: { name: true } },
        },
      },
    },
  });
  if (!deal) throw NotFound('الصفقة غير موجودة');

  const showMoney = can(user, 'deals', 'view_financial');
  return {
    ...deal,
    valueMinor: showMoney ? deal.valueMinor : null,
    quotations: deal.quotations.map((q) => ({ ...q, totalMinor: showMoney ? q.totalMinor : null })),
  };
}

export async function createDeal(input: DealInput) {
  const user = await requirePermission('deals', 'create');
  const data = dealSchema.parse(input);
  const stage = await prisma.pipelineStage.findUnique({ where: { id: data.stageId } });
  if (!stage) throw BadRequest('المرحلة غير موجودة');

  const ownerId = can(user, 'deals', 'assign') ? (data.ownerId ?? user.id) : user.id;

  const deal = await prisma.deal.create({
    data: {
      title: data.title,
      clientId: data.clientId || null,
      leadId: data.leadId || null,
      serviceId: data.serviceId || null,
      valueMinor: BigInt(Math.round(data.value * 100)),
      currency: data.currency,
      probability: stage.probability,
      stageId: stage.id,
      ownerId,
      expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : null,
      competitor: data.competitor || null,
      objections: data.objections || null,
      notes: data.notes || null,
      createdById: user.id,
    },
  });

  await prisma.stageHistory.create({
    data: { dealId: deal.id, toStageId: stage.id, movedById: user.id },
  });
  await audit({
    userId: user.id,
    action: 'CREATE',
    module: 'deals',
    entityType: 'DEAL',
    entityId: deal.id,
    summary: `إنشاء صفقة: ${deal.title}`,
    newValue: { title: deal.title, value: data.value, stage: stage.nameAr },
  });
  return deal;
}

export async function updateDeal(id: string, input: DealInput) {
  const user = await requirePermission('deals', 'edit');
  const data = dealSchema.parse(input);
  const before = await prisma.deal.findFirst({
    where: { id, deletedAt: null, ...scopeWhere(user, 'deals', OWNER_FIELDS) },
  });
  if (!before) throw NotFound('الصفقة غير موجودة');

  const updated = await prisma.deal.update({
    where: { id },
    data: {
      title: data.title,
      clientId: data.clientId || null,
      serviceId: data.serviceId || null,
      valueMinor: BigInt(Math.round(data.value * 100)),
      currency: data.currency,
      ownerId: can(user, 'deals', 'assign') ? (data.ownerId ?? before.ownerId) : before.ownerId,
      expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : null,
      competitor: data.competitor || null,
      objections: data.objections || null,
      notes: data.notes || null,
      updatedById: user.id,
    },
  });

  const d = diff(before as unknown as Record<string, unknown>, {
    title: updated.title,
    valueMinor: updated.valueMinor,
    ownerId: updated.ownerId,
    expectedCloseDate: updated.expectedCloseDate,
  });
  if (d.changed) {
    await audit({
      userId: user.id,
      action: before.valueMinor !== updated.valueMinor ? 'PRICE_CHANGE' : 'UPDATE',
      module: 'deals',
      entityType: 'DEAL',
      entityId: id,
      summary: `تعديل الصفقة ${updated.title}`,
      oldValue: d.oldValue,
      newValue: d.newValue,
    });
  }
  return updated;
}

const moveSchema = z.object({
  stageId: z.string().min(1),
  lossReasonId: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

/**
 * نقل صفقة بين المراحل مع تسجيل التاريخ ومدة البقاء في المرحلة السابقة.
 * الفوز يضبط تاريخ الإغلاق الفعلي، والخسارة تتطلب سببًا.
 */
export async function moveDealStage(id: string, input: unknown) {
  const user = await requirePermission('deals', 'edit');
  const data = moveSchema.parse(input);

  const deal = await prisma.deal.findFirst({
    where: { id, deletedAt: null, ...scopeWhere(user, 'deals', OWNER_FIELDS) },
  });
  if (!deal) throw NotFound('الصفقة غير موجودة');

  const stage = await prisma.pipelineStage.findUnique({ where: { id: data.stageId } });
  if (!stage) throw BadRequest('المرحلة غير موجودة');
  if (stage.isLost && !data.lossReasonId) throw BadRequest('سبب الخسارة مطلوب');

  const lastMove = await prisma.stageHistory.findFirst({
    where: { dealId: id },
    orderBy: { movedAt: 'desc' },
  });
  const durationSeconds = lastMove
    ? Math.round((Date.now() - lastMove.movedAt.getTime()) / 1000)
    : null;

  const status = stage.isWon ? 'WON' : stage.isLost ? 'LOST' : 'OPEN';

  const [updated] = await prisma.$transaction([
    prisma.deal.update({
      where: { id },
      data: {
        stageId: stage.id,
        probability: stage.probability,
        status: status as never,
        actualCloseDate: stage.isWon || stage.isLost ? new Date() : null,
        lossReasonId: stage.isLost ? data.lossReasonId : null,
        updatedById: user.id,
      },
    }),
    prisma.stageHistory.create({
      data: {
        dealId: id,
        fromStageId: deal.stageId,
        toStageId: stage.id,
        movedById: user.id,
        durationSeconds,
        note: data.note ?? null,
      },
    }),
  ]);

  await audit({
    userId: user.id,
    action: 'STATUS_CHANGE',
    module: 'deals',
    entityType: 'DEAL',
    entityId: id,
    summary: `نقل الصفقة إلى ${stage.nameAr}`,
    oldValue: { stageId: deal.stageId, status: deal.status },
    newValue: { stageId: stage.id, status },
  });

  return updated;
}

export async function softDeleteDeal(id: string) {
  const user = await requirePermission('deals', 'delete');
  const deal = await prisma.deal.findFirst({
    where: { id, deletedAt: null, ...scopeWhere(user, 'deals', OWNER_FIELDS) },
  });
  if (!deal) throw NotFound('الصفقة غير موجودة');
  await prisma.deal.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({
    userId: user.id,
    action: 'DELETE',
    module: 'deals',
    entityType: 'DEAL',
    entityId: id,
    summary: `حذف الصفقة ${deal.title}`,
  });
}

/** مؤشرات المبيعات المجمّعة — تُستخدم في تقارير المبيعات. */
export async function salesMetrics(range: { from: Date; to: Date }) {
  const user = await requirePermission('reports', 'view');
  const scope = scopeWhere(user, 'deals', OWNER_FIELDS);

  const [open, won, lost, byReason, bySource, byOwner, byService, cycleRows] = await Promise.all([
    prisma.deal.findMany({
      where: { deletedAt: null, status: 'OPEN', ...scope },
      select: { valueMinor: true, probability: true },
    }),
    prisma.deal.findMany({
      where: { deletedAt: null, status: 'WON', actualCloseDate: { gte: range.from, lte: range.to }, ...scope },
      select: { valueMinor: true, createdAt: true, actualCloseDate: true },
    }),
    prisma.deal.count({
      where: { deletedAt: null, status: 'LOST', actualCloseDate: { gte: range.from, lte: range.to }, ...scope },
    }),
    prisma.deal.groupBy({
      by: ['lossReasonId'],
      where: { deletedAt: null, status: 'LOST', lossReasonId: { not: null }, ...scope },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ['sourceId'],
      where: { deletedAt: null, sourceId: { not: null } },
      _count: { _all: true },
    }),
    prisma.deal.groupBy({
      by: ['ownerId'],
      where: { deletedAt: null, status: 'WON', actualCloseDate: { gte: range.from, lte: range.to }, ...scope },
      _sum: { valueMinor: true },
      _count: { _all: true },
    }),
    prisma.deal.groupBy({
      by: ['serviceId'],
      where: { deletedAt: null, status: 'WON', serviceId: { not: null }, ...scope },
      _sum: { valueMinor: true },
    }),
    prisma.deal.findMany({
      where: { deletedAt: null, status: 'WON', actualCloseDate: { not: null }, ...scope },
      select: { createdAt: true, actualCloseDate: true },
      take: 500,
    }),
  ]);

  const wonValue = won.reduce((s, d) => s + d.valueMinor, 0n);
  const avgCycleDays = cycleRows.length
    ? cycleRows.reduce(
        (s, d) => s + (d.actualCloseDate!.getTime() - d.createdAt.getTime()) / 86_400_000,
        0,
      ) / cycleRows.length
    : null;

  return {
    pipelineValueMinor: Number(open.reduce((s, d) => s + d.valueMinor, 0n)),
    weightedForecastMinor: Number(
      open.reduce((s, d) => s + weightedForecast(d.valueMinor, d.probability.toString()), 0n),
    ),
    wonCount: won.length,
    wonValueMinor: Number(wonValue),
    lostCount: lost,
    winRate: won.length + lost > 0 ? (won.length / (won.length + lost)) * 100 : null,
    avgDealValueMinor: won.length ? Number(wonValue) / won.length : 0,
    avgCycleDays,
    byReason,
    bySource,
    byOwner,
    byService,
  };
}

export async function dealFormOptions() {
  await requirePermission('deals', 'view');
  const [stages, users, clients, services, lossReasons] = await Promise.all([
    prisma.pipelineStage.findMany({
      where: { pipeline: 'DEAL', isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.client.findMany({
      where: { deletedAt: null },
      select: { id: true, legalName: true, brandName: true },
      orderBy: { legalName: 'asc' },
    }),
    prisma.service.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, nameAr: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.lossReason.findMany({ where: { isActive: true } }),
  ]);
  return { stages, users, clients, services, lossReasons };
}

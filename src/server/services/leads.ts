import 'server-only';
import { z } from 'zod';
import type { ActivityType, Prisma } from '@prisma/client';
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
import { normalizeEmail, normalizePhone } from '@/lib/utils';
import { audit, diff } from './audit';
import { notify } from './notifications';
import { getSettings } from './settings';

/* ── Schemas ─────────────────────────────────────────── */

export const leadSchema = z.object({
  fullName: z.string().trim().min(2, 'اسم العميل مطلوب'),
  phone: z.string().trim().optional().nullable(),
  whatsapp: z.string().trim().optional().nullable(),
  email: z.string().trim().email('بريد غير صالح').optional().or(z.literal('')).nullable(),
  companyName: z.string().trim().optional().nullable(),
  businessType: z.string().trim().optional().nullable(),
  countryCode: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  sourceId: z.string().optional().nullable(),
  campaign: z.string().trim().optional().nullable(),
  interestedServiceId: z.string().optional().nullable(),
  estimatedValue: z.coerce.number().min(0).default(0),
  currency: z.string().default('EGP'),
  assignedToId: z.string().optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  score: z.coerce.number().int().min(0).max(100).default(0),
  stageId: z.string().optional().nullable(),
  nextFollowUpAt: z.string().optional().nullable(),
  expectedCloseDate: z.string().optional().nullable(),
  noFollowUpReason: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export type LeadInput = z.infer<typeof leadSchema>;

const OWNER_FIELDS = ['assignedToId', 'createdById'];

function toDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ── Queries ─────────────────────────────────────────── */

export interface LeadFilters {
  q?: string;
  status?: string;
  stageId?: string;
  sourceId?: string;
  assignedToId?: string;
  priority?: string;
  filter?: 'uncontacted' | 'followup' | 'followup-overdue' | 'deleted';
  sort?: string;
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export async function listLeads(filters: LeadFilters) {
  const user = await requirePermission('leads', 'view');
  const now = new Date();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, filters.pageSize ?? 25);

  const where: Prisma.LeadWhereInput = {
    deletedAt: filters.filter === 'deleted' ? { not: null } : null,
    ...scopeWhere(user, 'leads', OWNER_FIELDS),
    ...(filters.status ? { status: filters.status as never } : {}),
    ...(filters.stageId ? { stageId: filters.stageId } : {}),
    ...(filters.sourceId ? { sourceId: filters.sourceId } : {}),
    ...(filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
    ...(filters.priority ? { priority: filters.priority as never } : {}),
    ...(filters.filter === 'uncontacted'
      ? { firstContactAt: null, status: { in: ['NEW', 'WORKING'] } }
      : {}),
    ...(filters.filter === 'followup'
      ? { nextFollowUpAt: { gte: now, lte: new Date(now.getTime() + 2 * 86_400_000) } }
      : {}),
    ...(filters.filter === 'followup-overdue' ? { nextFollowUpAt: { lt: now } } : {}),
    ...(filters.q
      ? {
          OR: [
            { fullName: { contains: filters.q, mode: 'insensitive' } },
            { companyName: { contains: filters.q, mode: 'insensitive' } },
            { email: { contains: filters.q, mode: 'insensitive' } },
            { phone: { contains: filters.q } },
            { whatsapp: { contains: filters.q } },
          ],
        }
      : {}),
  };

  const sortable: Record<string, string> = {
    fullName: 'fullName',
    createdAt: 'createdAt',
    nextFollowUpAt: 'nextFollowUpAt',
    estimatedValue: 'estimatedValueMinor',
    score: 'score',
    lastContactAt: 'lastContactAt',
  };
  const orderBy = sortable[filters.sort ?? '']
    ? { [sortable[filters.sort!]!]: filters.dir ?? 'desc' }
    : { createdAt: 'desc' as const };

  const [rows, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        source: { select: { nameAr: true } },
        assignedTo: { select: { id: true, name: true, avatarUrl: true } },
        stage: { select: { id: true, nameAr: true, color: true } },
        interestedService: { select: { nameAr: true } },
      },
    }),
    prisma.lead.count({ where }),
  ]);

  const showMoney = can(user, 'leads', 'view_financial') || can(user, 'deals', 'view_financial');
  return {
    rows: rows.map((r) => ({
      ...r,
      estimatedValueMinor: showMoney ? r.estimatedValueMinor : null,
    })),
    total,
    page,
    pageSize,
  };
}

export async function getLead(id: string) {
  const user = await requirePermission('leads', 'view');
  const lead = await prisma.lead.findFirst({
    where: { id, ...scopeWhere(user, 'leads', OWNER_FIELDS) },
    include: {
      source: true,
      assignedTo: { select: { id: true, name: true, avatarUrl: true, email: true } },
      stage: true,
      interestedService: { select: { id: true, nameAr: true } },
      lossReason: true,
      convertedClient: { select: { id: true, legalName: true } },
      followUps: { orderBy: { dueAt: 'asc' }, include: { assignedTo: { select: { name: true } } } },
      deals: {
        where: { deletedAt: null },
        select: { id: true, title: true, status: true, valueMinor: true, currency: true },
      },
      quotations: {
        where: { deletedAt: null },
        select: { id: true, number: true, status: true, totalMinor: true, currency: true },
      },
    },
  });
  // 404 وليس 403 حتى لا نكشف وجود سجل خارج نطاق المستخدم.
  if (!lead) throw NotFound('العميل المحتمل غير موجود');

  const activities = await prisma.activity.findMany({
    where: { entityType: 'LEAD', entityId: id },
    orderBy: { occurredAt: 'desc' },
    take: 100,
    include: { user: { select: { name: true, avatarUrl: true } } },
  });

  const showMoney = can(user, 'leads', 'view_financial') || can(user, 'deals', 'view_financial');
  return {
    ...lead,
    estimatedValueMinor: showMoney ? lead.estimatedValueMinor : null,
    deals: lead.deals.map((d) => ({ ...d, valueMinor: showMoney ? d.valueMinor : null })),
    quotations: lead.quotations.map((q) => ({ ...q, totalMinor: showMoney ? q.totalMinor : null })),
    activities,
  };
}

/** كشف التكرار بالهاتف/الواتساب/الإيميل المُطبَّعين. */
export async function findDuplicates(input: {
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  excludeId?: string;
}) {
  await requirePermission('leads', 'view');
  const phone = normalizePhone(input.phone);
  const whatsapp = normalizePhone(input.whatsapp);
  const email = normalizeEmail(input.email);
  const or: Prisma.LeadWhereInput[] = [];
  if (phone) or.push({ phoneNormalized: phone }, { whatsappNormalized: phone });
  if (whatsapp) or.push({ phoneNormalized: whatsapp }, { whatsappNormalized: whatsapp });
  if (email) or.push({ emailNormalized: email });
  if (or.length === 0) return [];

  return prisma.lead.findMany({
    where: { deletedAt: null, OR: or, ...(input.excludeId ? { NOT: { id: input.excludeId } } : {}) },
    take: 5,
    select: {
      id: true,
      fullName: true,
      companyName: true,
      phone: true,
      email: true,
      status: true,
      assignedTo: { select: { name: true } },
    },
  });
}

/* ── Mutations ───────────────────────────────────────── */

export async function createLead(input: LeadInput, opts: { allowDuplicate?: boolean } = {}) {
  const user = await requirePermission('leads', 'create');
  const data = leadSchema.parse(input);
  const settings = await getSettings();

  if (!opts.allowDuplicate) {
    const dups = await findDuplicates({ phone: data.phone, whatsapp: data.whatsapp, email: data.email });
    if (dups.length > 0) {
      throw BadRequest(
        `يوجد ${dups.length} عميل محتمل بنفس الهاتف أو البريد. راجع السجلات المشابهة أو أكّد الإنشاء رغم التكرار.`,
      );
    }
  }

  // من لا يملك صلاحية الإسناد يُسنِد لنفسه فقط.
  const assignedToId = can(user, 'leads', 'assign') ? (data.assignedToId ?? user.id) : user.id;

  if (settings.leads.requireNextFollowUp && !data.nextFollowUpAt && !data.noFollowUpReason) {
    throw BadRequest('يجب تحديد موعد متابعة قادم، أو تسجيل سبب واضح لعدم تحديده');
  }

  const lead = await prisma.lead.create({
    data: {
      fullName: data.fullName,
      phone: data.phone || null,
      phoneNormalized: normalizePhone(data.phone),
      whatsapp: data.whatsapp || null,
      whatsappNormalized: normalizePhone(data.whatsapp),
      email: data.email || null,
      emailNormalized: normalizeEmail(data.email),
      companyName: data.companyName || null,
      businessType: data.businessType || null,
      countryCode: data.countryCode || null,
      city: data.city || null,
      sourceId: data.sourceId || null,
      campaign: data.campaign || null,
      interestedServiceId: data.interestedServiceId || null,
      estimatedValueMinor: BigInt(Math.round(data.estimatedValue * 100)),
      currency: data.currency,
      assignedToId,
      priority: data.priority,
      score: data.score,
      stageId: data.stageId || null,
      nextFollowUpAt: toDate(data.nextFollowUpAt),
      expectedCloseDate: toDate(data.expectedCloseDate),
      noFollowUpReason: data.noFollowUpReason || null,
      notes: data.notes || null,
      createdById: user.id,
      updatedById: user.id,
    },
  });

  await logActivity(lead.id, 'SYSTEM', 'تم إنشاء العميل المحتمل', undefined, user.id);
  await audit({
    userId: user.id,
    action: 'CREATE',
    module: 'leads',
    entityType: 'LEAD',
    entityId: lead.id,
    summary: `إنشاء عميل محتمل: ${lead.fullName}`,
    newValue: { fullName: lead.fullName, assignedToId },
  });

  if (assignedToId !== user.id) {
    await notify({
      userId: assignedToId,
      type: 'LEAD_ASSIGNED',
      title: `تم إسناد عميل محتمل إليك: ${lead.fullName}`,
      entityType: 'LEAD',
      entityId: lead.id,
      link: `/leads/${lead.id}`,
      dedupeKey: `LEAD_ASSIGNED:${lead.id}:${assignedToId}`,
    });
  }

  return lead;
}

export async function updateLead(id: string, input: LeadInput) {
  const user = await requirePermission('leads', 'edit');
  const data = leadSchema.parse(input);
  const before = await prisma.lead.findFirst({
    where: { id, deletedAt: null, ...scopeWhere(user, 'leads', OWNER_FIELDS) },
  });
  if (!before) throw NotFound('العميل المحتمل غير موجود');

  const settings = await getSettings();
  const activeStatuses = ['NEW', 'WORKING', 'QUALIFIED'];
  if (
    settings.leads.requireNextFollowUp &&
    activeStatuses.includes(before.status) &&
    !data.nextFollowUpAt &&
    !data.noFollowUpReason
  ) {
    throw BadRequest('العميل النشط يجب أن يحمل موعد متابعة قادم أو سببًا مسجلًا لعدم تحديده');
  }

  const assignedToId = can(user, 'leads', 'assign')
    ? (data.assignedToId ?? before.assignedToId)
    : before.assignedToId;

  const updated = await prisma.lead.update({
    where: { id },
    data: {
      fullName: data.fullName,
      phone: data.phone || null,
      phoneNormalized: normalizePhone(data.phone),
      whatsapp: data.whatsapp || null,
      whatsappNormalized: normalizePhone(data.whatsapp),
      email: data.email || null,
      emailNormalized: normalizeEmail(data.email),
      companyName: data.companyName || null,
      businessType: data.businessType || null,
      countryCode: data.countryCode || null,
      city: data.city || null,
      sourceId: data.sourceId || null,
      campaign: data.campaign || null,
      interestedServiceId: data.interestedServiceId || null,
      estimatedValueMinor: BigInt(Math.round(data.estimatedValue * 100)),
      currency: data.currency,
      assignedToId,
      priority: data.priority,
      score: data.score,
      nextFollowUpAt: toDate(data.nextFollowUpAt),
      expectedCloseDate: toDate(data.expectedCloseDate),
      noFollowUpReason: data.noFollowUpReason || null,
      notes: data.notes || null,
      updatedById: user.id,
    },
  });

  const d = diff(before as unknown as Record<string, unknown>, {
    fullName: updated.fullName,
    phone: updated.phone,
    email: updated.email,
    assignedToId: updated.assignedToId,
    priority: updated.priority,
    estimatedValueMinor: updated.estimatedValueMinor,
    nextFollowUpAt: updated.nextFollowUpAt,
  });
  if (d.changed) {
    await audit({
      userId: user.id,
      action: 'UPDATE',
      module: 'leads',
      entityType: 'LEAD',
      entityId: id,
      summary: `تعديل بيانات ${updated.fullName}`,
      oldValue: d.oldValue,
      newValue: d.newValue,
    });
  }

  if (before.assignedToId !== updated.assignedToId && updated.assignedToId) {
    await logActivity(id, 'ASSIGNMENT', 'تغيير المسؤول عن العميل المحتمل', undefined, user.id);
    await notify({
      userId: updated.assignedToId,
      type: 'LEAD_ASSIGNED',
      title: `تم إسناد عميل محتمل إليك: ${updated.fullName}`,
      entityType: 'LEAD',
      entityId: id,
      link: `/leads/${id}`,
      dedupeKey: `LEAD_ASSIGNED:${id}:${updated.assignedToId}:${Date.now()}`,
    });
  }

  return updated;
}

export async function assignLeads(ids: string[], assigneeId: string) {
  const user = await requirePermission('leads', 'assign');
  const leads = await prisma.lead.findMany({
    where: { id: { in: ids }, deletedAt: null, ...scopeWhere(user, 'leads', OWNER_FIELDS) },
    select: { id: true, fullName: true },
  });
  if (leads.length === 0) throw NotFound('لا توجد سجلات ضمن نطاقك');

  await prisma.lead.updateMany({
    where: { id: { in: leads.map((l) => l.id) } },
    data: { assignedToId: assigneeId, updatedById: user.id },
  });

  for (const lead of leads) {
    await logActivity(lead.id, 'ASSIGNMENT', 'إسناد جماعي للعميل المحتمل', undefined, user.id);
    await notify({
      userId: assigneeId,
      type: 'LEAD_ASSIGNED',
      title: `تم إسناد عميل محتمل إليك: ${lead.fullName}`,
      entityType: 'LEAD',
      entityId: lead.id,
      link: `/leads/${lead.id}`,
      dedupeKey: `LEAD_ASSIGNED:${lead.id}:${assigneeId}:${Date.now()}`,
    });
  }
  await audit({
    userId: user.id,
    action: 'ASSIGN',
    module: 'leads',
    entityType: 'LEAD',
    entityId: leads.map((l) => l.id).join(','),
    summary: `إسناد ${leads.length} عميل محتمل`,
    newValue: { assigneeId },
  });
  return leads.length;
}

const stageChangeSchema = z.object({
  stageId: z.string().min(1),
  lossReasonId: z.string().optional().nullable(),
  lostNotes: z.string().optional().nullable(),
  dealValue: z.coerce.number().optional(),
  nextFollowUpAt: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

/**
 * نقل العميل المحتمل بين مراحل المسار مع تطبيق قواعد العمل:
 * - Lost يتطلب سببًا.
 * - Qualified يتطلب قيمة صفقة ويُنشئ Deal تلقائيًا.
 * - المراحل النشطة تتطلب متابعة قادمة.
 */
export async function changeLeadStage(id: string, input: unknown) {
  const user = await requirePermission('leads', 'edit');
  const data = stageChangeSchema.parse(input);
  const settings = await getSettings();

  const lead = await prisma.lead.findFirst({
    where: { id, deletedAt: null, ...scopeWhere(user, 'leads', OWNER_FIELDS) },
    include: { stage: true },
  });
  if (!lead) throw NotFound('العميل المحتمل غير موجود');

  const stage = await prisma.pipelineStage.findUnique({ where: { id: data.stageId } });
  if (!stage) throw BadRequest('المرحلة غير موجودة');

  if (stage.isLost && !data.lossReasonId) throw BadRequest('سبب الخسارة مطلوب عند النقل إلى «خسارة»');
  if (stage.key === 'QUALIFIED' && !data.dealValue && lead.estimatedValueMinor === 0n) {
    throw BadRequest('قيمة الصفقة التقديرية مطلوبة عند تأهيل العميل');
  }
  if (
    settings.leads.requireNextFollowUp &&
    !stage.isLost &&
    !stage.isWon &&
    !data.nextFollowUpAt &&
    !lead.nextFollowUpAt
  ) {
    throw BadRequest('حدد الإجراء التالي (موعد متابعة) قبل استمرار الصفقة');
  }

  const status = stage.isWon ? 'QUALIFIED' : stage.isLost ? 'LOST' : lead.status === 'NEW' ? 'WORKING' : lead.status;

  const updated = await prisma.lead.update({
    where: { id },
    data: {
      stageId: stage.id,
      status: status as never,
      lossReasonId: stage.isLost ? data.lossReasonId : null,
      lostNotes: stage.isLost ? (data.lostNotes ?? null) : null,
      nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : lead.nextFollowUpAt,
      estimatedValueMinor: data.dealValue
        ? BigInt(Math.round(data.dealValue * 100))
        : lead.estimatedValueMinor,
      lastContactAt: new Date(),
      updatedById: user.id,
    },
  });

  await logActivity(
    id,
    'STATUS_CHANGE',
    `نقل من «${lead.stage?.nameAr ?? '—'}» إلى «${stage.nameAr}»`,
    data.note ?? undefined,
    user.id,
  );
  await audit({
    userId: user.id,
    action: 'STATUS_CHANGE',
    module: 'leads',
    entityType: 'LEAD',
    entityId: id,
    summary: `تغيير مرحلة إلى ${stage.nameAr}`,
    oldValue: { stageId: lead.stageId, status: lead.status },
    newValue: { stageId: stage.id, status },
  });

  // التأهيل ينشئ صفقة مرتبطة تلقائيًا بدون إعادة إدخال البيانات.
  if (stage.key === 'QUALIFIED') {
    const existing = await prisma.deal.findFirst({ where: { leadId: id, deletedAt: null } });
    if (!existing) {
      const deal = await prisma.deal.create({
        data: {
          title: `${lead.companyName ?? lead.fullName} — ${new Date().getFullYear()}`,
          leadId: id,
          serviceId: lead.interestedServiceId,
          valueMinor: updated.estimatedValueMinor,
          currency: lead.currency,
          probability: stage.probability,
          stageId: stage.id,
          ownerId: lead.assignedToId ?? user.id,
          expectedCloseDate: lead.expectedCloseDate,
          createdById: user.id,
        },
      });
      await prisma.stageHistory.create({
        data: { dealId: deal.id, toStageId: stage.id, movedById: user.id },
      });
      await logActivity(id, 'SYSTEM', `تم إنشاء صفقة مرتبطة: ${deal.title}`, undefined, user.id);
    }
  }

  return updated;
}

export async function logActivity(
  leadId: string,
  type: ActivityType,
  subject: string,
  body?: string,
  userId?: string,
  extra: { durationMin?: number; outcome?: string; occurredAt?: Date } = {},
) {
  await prisma.activity.create({
    data: {
      entityType: 'LEAD',
      entityId: leadId,
      type,
      subject,
      body,
      userId,
      durationMin: extra.durationMin,
      outcome: extra.outcome,
      occurredAt: extra.occurredAt ?? new Date(),
    },
  });
}

const contactSchema = z.object({
  type: z.enum(['CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'NOTE']),
  subject: z.string().trim().min(2, 'العنوان مطلوب'),
  body: z.string().trim().optional().nullable(),
  durationMin: z.coerce.number().int().min(0).optional(),
  outcome: z.string().trim().optional().nullable(),
  nextFollowUpAt: z.string().optional().nullable(),
});

/** تسجيل تواصل — يضبط أول تواصل ويحدّث آخر تواصل والمتابعة القادمة. */
export async function logContact(leadId: string, input: unknown) {
  const user = await requirePermission('leads', 'edit');
  const data = contactSchema.parse(input);
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, deletedAt: null, ...scopeWhere(user, 'leads', OWNER_FIELDS) },
  });
  if (!lead) throw NotFound('العميل المحتمل غير موجود');

  const now = new Date();
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      firstContactAt: lead.firstContactAt ?? now,
      lastContactAt: now,
      status: lead.status === 'NEW' ? 'WORKING' : lead.status,
      nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : lead.nextFollowUpAt,
      updatedById: user.id,
    },
  });

  await logActivity(leadId, data.type, data.subject, data.body ?? undefined, user.id, {
    durationMin: data.durationMin,
    outcome: data.outcome ?? undefined,
  });

  if (data.nextFollowUpAt) {
    await prisma.followUp.create({
      data: {
        leadId,
        title: `متابعة: ${data.subject}`,
        dueAt: new Date(data.nextFollowUpAt),
        assignedToId: lead.assignedToId ?? user.id,
        createdById: user.id,
      },
    });
  }
}

export async function completeFollowUp(followUpId: string, outcome?: string) {
  const user = await requirePermission('leads', 'edit');
  const followUp = await prisma.followUp.findUnique({ where: { id: followUpId } });
  if (!followUp) throw NotFound('المتابعة غير موجودة');
  if (followUp.assignedToId !== user.id && !can(user, 'leads', 'assign')) {
    throw Forbidden('لا يمكنك إغلاق متابعة مسندة لغيرك');
  }
  await prisma.followUp.update({
    where: { id: followUpId },
    data: { status: 'DONE', completedAt: new Date(), outcome },
  });
  if (followUp.leadId) {
    await logActivity(followUp.leadId, 'FOLLOW_UP', 'إغلاق متابعة', outcome, user.id);
  }
}

export async function softDeleteLead(id: string) {
  const user = await requirePermission('leads', 'delete');
  const lead = await prisma.lead.findFirst({
    where: { id, deletedAt: null, ...scopeWhere(user, 'leads', OWNER_FIELDS) },
  });
  if (!lead) throw NotFound('العميل المحتمل غير موجود');

  await prisma.lead.update({
    where: { id },
    data: { deletedAt: new Date(), deletedById: user.id },
  });
  await audit({
    userId: user.id,
    action: 'DELETE',
    module: 'leads',
    entityType: 'LEAD',
    entityId: id,
    summary: `حذف ناعم للعميل المحتمل ${lead.fullName}`,
  });
}

export async function restoreLead(id: string) {
  const user = await requirePermission('leads', 'restore');
  const lead = await prisma.lead.findFirst({ where: { id, deletedAt: { not: null } } });
  if (!lead) throw NotFound('السجل المحذوف غير موجود');
  await prisma.lead.update({ where: { id }, data: { deletedAt: null, deletedById: null } });
  await audit({
    userId: user.id,
    action: 'RESTORE',
    module: 'leads',
    entityType: 'LEAD',
    entityId: id,
    summary: `استرجاع العميل المحتمل ${lead.fullName}`,
  });
}

/**
 * تحويل عميل محتمل إلى عميل فعلي — بدون إعادة إدخال أي بيانات.
 * يُنشئ Client + جهة اتصال أساسية، ويربط الصفقات والكوتيشنات، ويقفل الـ Lead كـ Converted.
 */
export async function convertLeadToClient(
  id: string,
  overrides: { legalName?: string; accountManagerId?: string } = {},
) {
  const user = await requirePermission('clients', 'create');
  const lead = await prisma.lead.findFirst({
    where: { id, deletedAt: null, ...scopeWhere(user, 'leads', OWNER_FIELDS) },
  });
  if (!lead) throw NotFound('العميل المحتمل غير موجود');
  if (lead.convertedClientId) throw BadRequest('تم تحويل هذا العميل المحتمل بالفعل');

  const client = await prisma.$transaction(async (tx) => {
    const created = await tx.client.create({
      data: {
        legalName: overrides.legalName || lead.companyName || lead.fullName,
        brandName: lead.companyName,
        type: lead.companyName ? 'COMPANY' : 'INDIVIDUAL',
        industry: lead.businessType,
        countryCode: lead.countryCode,
        city: lead.city,
        currency: lead.currency,
        accountManagerId: overrides.accountManagerId || null,
        salesOwnerId: lead.assignedToId,
        status: 'ACTIVE',
        onboardedAt: new Date(),
        lastContactAt: lead.lastContactAt,
        createdById: user.id,
        contacts: {
          create: [
            {
              name: lead.fullName,
              type: 'MAIN',
              phone: lead.phone,
              whatsapp: lead.whatsapp,
              email: lead.email,
              isPrimary: true,
            },
          ],
        },
      },
    });

    await tx.lead.update({
      where: { id },
      data: { convertedClientId: created.id, convertedAt: new Date(), status: 'CONVERTED' },
    });
    await tx.deal.updateMany({ where: { leadId: id }, data: { clientId: created.id } });
    await tx.quotation.updateMany({ where: { leadId: id }, data: { clientId: created.id } });
    return created;
  });

  await logActivity(id, 'SYSTEM', `تم التحويل إلى عميل: ${client.legalName}`, undefined, user.id);
  await audit({
    userId: user.id,
    action: 'UPDATE',
    module: 'leads',
    entityType: 'LEAD',
    entityId: id,
    summary: `تحويل العميل المحتمل إلى عميل ${client.legalName}`,
    newValue: { clientId: client.id },
  });

  return client;
}

/* ── Import ──────────────────────────────────────────── */

export interface ImportRow {
  fullName: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  companyName?: string;
  city?: string;
  sourceKey?: string;
  campaign?: string;
  estimatedValue?: string;
  notes?: string;
}

export async function importLeads(rows: ImportRow[], assigneeId?: string) {
  const user = await requirePermission('leads', 'create');
  const sources = Object.fromEntries(
    (await prisma.leadSource.findMany()).map((s) => [s.key.toUpperCase(), s.id]),
  );

  let created = 0;
  const duplicates: string[] = [];
  const errors: { row: number; message: string }[] = [];

  for (const [i, row] of rows.entries()) {
    if (!row.fullName?.trim()) {
      errors.push({ row: i + 1, message: 'اسم العميل مفقود' });
      continue;
    }
    const phone = normalizePhone(row.phone);
    const email = normalizeEmail(row.email);
    const exists =
      (phone || email) &&
      (await prisma.lead.findFirst({
        where: {
          deletedAt: null,
          OR: [
            ...(phone ? [{ phoneNormalized: phone }, { whatsappNormalized: phone }] : []),
            ...(email ? [{ emailNormalized: email }] : []),
          ],
        },
        select: { id: true },
      }));
    if (exists) {
      duplicates.push(row.fullName);
      continue;
    }

    await prisma.lead.create({
      data: {
        fullName: row.fullName.trim(),
        phone: row.phone || null,
        phoneNormalized: phone,
        whatsapp: row.whatsapp || null,
        whatsappNormalized: normalizePhone(row.whatsapp),
        email: row.email || null,
        emailNormalized: email,
        companyName: row.companyName || null,
        city: row.city || null,
        sourceId: row.sourceKey ? (sources[row.sourceKey.toUpperCase()] ?? null) : null,
        campaign: row.campaign || null,
        estimatedValueMinor: BigInt(Math.round(Number(row.estimatedValue || 0) * 100)),
        notes: row.notes || null,
        assignedToId: assigneeId || user.id,
        createdById: user.id,
      },
    });
    created++;
  }

  await audit({
    userId: user.id,
    action: 'IMPORT',
    module: 'leads',
    entityType: 'LEAD',
    entityId: 'bulk',
    summary: `استيراد ${created} عميل محتمل (${duplicates.length} مكرر، ${errors.length} خطأ)`,
    newValue: { created, duplicates: duplicates.length, errors: errors.length },
  });

  return { created, duplicates, errors };
}

export async function exportLeads(filters: LeadFilters) {
  const user = await requirePermission('leads', 'export');
  const { rows } = await listLeads({ ...filters, pageSize: 5000, page: 1 });
  await audit({
    userId: user.id,
    action: 'EXPORT',
    module: 'leads',
    entityType: 'LEAD',
    entityId: 'bulk',
    summary: `تصدير ${rows.length} عميل محتمل`,
  });
  return rows;
}

export async function leadFormOptions() {
  await requireUser();
  const [sources, stages, services, users, countries] = await Promise.all([
    prisma.leadSource.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.pipelineStage.findMany({
      where: { pipeline: 'DEAL', isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.service.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, nameAr: true },
    }),
    prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.country.findMany({ where: { isActive: true } }),
  ]);
  const lossReasons = await prisma.lossReason.findMany({ where: { isActive: true } });
  return { sources, stages, services, users, countries, lossReasons };
}

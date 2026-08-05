import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { requirePermission, can, scopeWhere, NotFound, BadRequest } from '@/server/auth/guard';
import { audit, diff } from './audit';
import { nextNumber } from './numbering';
import { getSettings } from './settings';

const OWNER_FIELDS = ['ownerId', 'createdById'];

export const contractSchema = z.object({
  title: z.string().trim().min(2, 'عنوان العقد مطلوب'),
  clientId: z.string().min(1, 'العميل مطلوب'),
  quotationId: z.string().optional().nullable(),
  startDate: z.string().min(1, 'تاريخ البداية مطلوب'),
  endDate: z.string().min(1, 'تاريخ الانتهاء مطلوب'),
  renewalDate: z.string().optional().nullable(),
  autoRenew: z.coerce.boolean().default(false),
  value: z.coerce.number().min(0).default(0),
  currency: z.string().default('EGP'),
  paymentTerms: z.string().trim().optional().nullable(),
  ownerId: z.string().optional().nullable(),
  status: z
    .enum([
      'DRAFT',
      'AWAITING_SIGNATURE',
      'ACTIVE',
      'EXPIRING_SOON',
      'EXPIRED',
      'RENEWED',
      'SUSPENDED',
      'TERMINATED',
    ])
    .default('DRAFT'),
  reminderDays: z.array(z.coerce.number().int().min(0)).default([30, 14, 7, 1]),
  serviceIds: z.array(z.string()).default([]),
  notes: z.string().trim().optional().nullable(),
});

export type ContractInput = z.infer<typeof contractSchema>;

export async function listContracts(filters: {
  q?: string;
  status?: string;
  clientId?: string;
  filter?: 'renewing';
  page?: number;
  pageSize?: number;
}) {
  const user = await requirePermission('contracts', 'view');
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, filters.pageSize ?? 25);
  const settings = await getSettings();

  const where: Prisma.ContractWhereInput = {
    deletedAt: null,
    ...scopeWhere(user, 'contracts', OWNER_FIELDS),
    ...(filters.status ? { status: filters.status as never } : {}),
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.filter === 'renewing'
      ? {
          status: { in: ['ACTIVE', 'EXPIRING_SOON'] },
          renewalDate: {
            gte: new Date(),
            lte: new Date(Date.now() + settings.contract.expiringSoonDays * 86_400_000),
          },
        }
      : {}),
    ...(filters.q
      ? {
          OR: [
            { number: { contains: filters.q, mode: 'insensitive' } },
            { title: { contains: filters.q, mode: 'insensitive' } },
            { client: { legalName: { contains: filters.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.contract.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        client: { select: { id: true, legalName: true, brandName: true } },
        owner: { select: { id: true, name: true } },
        quotation: { select: { id: true, number: true } },
        services: { include: { service: { select: { nameAr: true } } } },
      },
    }),
    prisma.contract.count({ where }),
  ]);

  const showMoney = can(user, 'contracts', 'view_financial');
  return {
    rows: rows.map((r) => ({ ...r, valueMinor: showMoney ? r.valueMinor : null })),
    total,
    page,
    pageSize,
  };
}

export async function getContract(id: string) {
  const user = await requirePermission('contracts', 'view');
  const contract = await prisma.contract.findFirst({
    where: { id, deletedAt: null, ...scopeWhere(user, 'contracts', OWNER_FIELDS) },
    include: {
      client: { select: { id: true, legalName: true, brandName: true } },
      owner: { select: { id: true, name: true } },
      quotation: { select: { id: true, number: true, totalMinor: true } },
      services: { include: { service: { select: { id: true, nameAr: true } } } },
      projects: { where: { deletedAt: null }, select: { id: true, name: true, status: true } },
      invoices: {
        where: { deletedAt: null },
        select: { id: true, number: true, status: true, totalMinor: true, paidMinor: true, currency: true },
      },
    },
  });
  if (!contract) throw NotFound('العقد غير موجود');
  const showMoney = can(user, 'contracts', 'view_financial');
  return {
    ...contract,
    valueMinor: showMoney ? contract.valueMinor : null,
    invoices: showMoney ? contract.invoices : [],
  };
}

export async function createContract(input: ContractInput) {
  const user = await requirePermission('contracts', 'create');
  const data = contractSchema.parse(input);
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  if (end <= start) throw BadRequest('تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية');
  if (data.status === 'ACTIVE' && data.value <= 0) {
    throw BadRequest('العقد الساري يجب أن يحمل قيمة وعملة');
  }

  const contract = await prisma.$transaction(async (tx) => {
    const number = await nextNumber('CONTRACT', tx);
    return tx.contract.create({
      data: {
        number,
        title: data.title,
        clientId: data.clientId,
        quotationId: data.quotationId || null,
        startDate: start,
        endDate: end,
        renewalDate: data.renewalDate ? new Date(data.renewalDate) : end,
        autoRenew: data.autoRenew,
        valueMinor: BigInt(Math.round(data.value * 100)),
        currency: data.currency,
        paymentTerms: data.paymentTerms || null,
        ownerId: data.ownerId || user.id,
        status: data.status,
        reminderDays: data.reminderDays,
        notes: data.notes || null,
        createdById: user.id,
        services: { create: data.serviceIds.map((serviceId) => ({ serviceId })) },
      },
    });
  });

  await audit({
    userId: user.id,
    action: 'CREATE',
    module: 'contracts',
    entityType: 'CONTRACT',
    entityId: contract.id,
    summary: `إنشاء عقد ${contract.number}`,
    newValue: { number: contract.number, value: data.value },
  });
  return contract;
}

export async function updateContract(id: string, input: ContractInput) {
  const user = await requirePermission('contracts', 'edit');
  const data = contractSchema.parse(input);
  const before = await prisma.contract.findFirst({
    where: { id, deletedAt: null, ...scopeWhere(user, 'contracts', OWNER_FIELDS) },
  });
  if (!before) throw NotFound('العقد غير موجود');

  // من لا يملك view_financial لا يرى القيمة الحالية أصلًا — نموذج التعديل عنده
  // يُعبَّأ بصفر، فتمرير هذه القيمة كما هي يمحو القيمة الحقيقية للعقد فعليًا
  // عند أي تعديل عادي (تغيير الحالة، تاريخ التجديد، إلخ). نحافظ على القيمة
  // الحالية في قاعدة البيانات بدل الثقة بما أُرسل من نموذج لا يراها صاحبه.
  const canEditValue = can(user, 'contracts', 'view_financial');

  const updated = await prisma.$transaction(async (tx) => {
    await tx.contractService.deleteMany({ where: { contractId: id } });
    return tx.contract.update({
      where: { id },
      data: {
        title: data.title,
        clientId: data.clientId,
        quotationId: data.quotationId || null,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        renewalDate: data.renewalDate ? new Date(data.renewalDate) : null,
        autoRenew: data.autoRenew,
        valueMinor: canEditValue ? BigInt(Math.round(data.value * 100)) : before.valueMinor,
        currency: canEditValue ? data.currency : before.currency,
        paymentTerms: data.paymentTerms || null,
        ownerId: data.ownerId || before.ownerId,
        status: data.status,
        reminderDays: data.reminderDays,
        notes: data.notes || null,
        updatedById: user.id,
        services: { create: data.serviceIds.map((serviceId) => ({ serviceId })) },
      },
    });
  });

  const d = diff(before as unknown as Record<string, unknown>, {
    status: updated.status,
    valueMinor: updated.valueMinor,
    endDate: updated.endDate,
    autoRenew: updated.autoRenew,
  });
  if (d.changed) {
    await audit({
      userId: user.id,
      action: before.status !== updated.status ? 'STATUS_CHANGE' : 'UPDATE',
      module: 'contracts',
      entityType: 'CONTRACT',
      entityId: id,
      summary: `تعديل العقد ${updated.number}`,
      oldValue: d.oldValue,
      newValue: d.newValue,
    });
  }
  return updated;
}

/** التجديد ينشئ عقدًا جديدًا مسودة حفاظًا على تاريخ العقد القديم. */
export async function renewContract(id: string, months = 12) {
  const user = await requirePermission('contracts', 'create');
  const old = await prisma.contract.findUnique({
    where: { id },
    include: { services: true },
  });
  if (!old) throw NotFound('العقد غير موجود');

  const start = new Date(old.endDate.getTime() + 86_400_000);
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);

  const created = await prisma.$transaction(async (tx) => {
    const number = await nextNumber('CONTRACT', tx);
    const contract = await tx.contract.create({
      data: {
        number,
        title: `${old.title} — تجديد`,
        clientId: old.clientId,
        startDate: start,
        endDate: end,
        renewalDate: end,
        autoRenew: old.autoRenew,
        valueMinor: old.valueMinor,
        currency: old.currency,
        paymentTerms: old.paymentTerms,
        ownerId: old.ownerId,
        status: 'DRAFT',
        reminderDays: old.reminderDays,
        createdById: user.id,
        services: { create: old.services.map((s) => ({ serviceId: s.serviceId })) },
      },
    });
    await tx.contract.update({ where: { id }, data: { status: 'RENEWED' } });
    return contract;
  });

  await audit({
    userId: user.id,
    action: 'CREATE',
    module: 'contracts',
    entityType: 'CONTRACT',
    entityId: created.id,
    summary: `تجديد العقد ${old.number} → ${created.number}`,
  });
  return created;
}

export async function softDeleteContract(id: string) {
  const user = await requirePermission('contracts', 'delete');
  const contract = await prisma.contract.findFirst({ where: { id, deletedAt: null } });
  if (!contract) throw NotFound('العقد غير موجود');
  await prisma.contract.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({
    userId: user.id,
    action: 'DELETE',
    module: 'contracts',
    entityType: 'CONTRACT',
    entityId: id,
    summary: `حذف العقد ${contract.number}`,
  });
}

export async function contractFormOptions() {
  await requirePermission('contracts', 'view');
  const [clients, users, services, quotations] = await Promise.all([
    prisma.client.findMany({
      where: { deletedAt: null },
      select: { id: true, legalName: true, brandName: true },
      orderBy: { legalName: 'asc' },
    }),
    prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.service.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, nameAr: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.quotation.findMany({
      where: { deletedAt: null, status: 'ACCEPTED' },
      select: { id: true, number: true, clientId: true, totalMinor: true, currency: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);
  return { clients, users, services, quotations };
}

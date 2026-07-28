import 'server-only';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { requirePermission, can, NotFound } from '@/server/auth/guard';
import { audit, diff } from './audit';

export const serviceSchema = z.object({
  code: z.string().trim().min(2, 'الكود مطلوب').regex(/^[A-Z0-9-]+$/i, 'الكود يقبل حروفًا إنجليزية وأرقامًا وشرطة فقط'),
  nameAr: z.string().trim().min(2, 'الاسم بالعربية مطلوب'),
  nameEn: z.string().trim().min(2, 'الاسم بالإنجليزية مطلوب'),
  description: z.string().trim().optional().nullable(),
  basePrice: z.coerce.number().min(0).default(0),
  currency: z.string().default('EGP'),
  billingType: z.enum(['ONE_TIME', 'MONTHLY_RETAINER', 'RECURRING', 'PACKAGE', 'HOURLY']).default('ONE_TIME'),
  durationDays: z.coerce.number().int().min(0).optional().nullable(),
  defaultPaymentTerms: z.string().trim().optional().nullable(),
  defaultTaxRateId: z.string().optional().nullable(),
  departmentKeys: z.array(z.string()).default([]),
  isPackage: z.coerce.boolean().default(false),
  isActive: z.coerce.boolean().default(true),
  deliverables: z
    .array(z.object({ nameAr: z.string().min(1), nameEn: z.string().min(1), quantity: z.coerce.number().int().min(1).default(1) }))
    .default([]),
  prices: z
    .array(
      z.object({
        currency: z.string().min(3),
        countryCode: z.string().optional().nullable(),
        price: z.coerce.number().min(0),
      }),
    )
    .default([]),
});

export type ServiceInput = z.infer<typeof serviceSchema>;

export async function listServices(filters: { q?: string; active?: string; billingType?: string } = {}) {
  const user = await requirePermission('services', 'view');
  const rows = await prisma.service.findMany({
    where: {
      deletedAt: null,
      ...(filters.active === 'inactive' ? { isActive: false } : {}),
      ...(filters.active === 'active' ? { isActive: true } : {}),
      ...(filters.billingType ? { billingType: filters.billingType as never } : {}),
      ...(filters.q
        ? {
            OR: [
              { nameAr: { contains: filters.q, mode: 'insensitive' as const } },
              { nameEn: { contains: filters.q, mode: 'insensitive' as const } },
              { code: { contains: filters.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
    include: {
      deliverables: { orderBy: { sortOrder: 'asc' } },
      prices: true,
      packageItems: { include: { service: { select: { nameAr: true } } } },
      _count: { select: { quotationItems: true, deals: true } },
    },
  });

  const showMoney = can(user, 'services', 'view_financial') || can(user, 'quotations', 'view_financial');
  return rows.map((r) => ({
    ...r,
    basePriceMinor: showMoney ? r.basePriceMinor : null,
    prices: showMoney ? r.prices : [],
  }));
}

export async function upsertService(input: ServiceInput, id?: string) {
  const user = await requirePermission('services', id ? 'edit' : 'create');
  const data = serviceSchema.parse(input);

  const payload = {
    code: data.code.toUpperCase(),
    nameAr: data.nameAr,
    nameEn: data.nameEn,
    description: data.description || null,
    basePriceMinor: BigInt(Math.round(data.basePrice * 100)),
    currency: data.currency,
    billingType: data.billingType,
    durationDays: data.durationDays ?? null,
    defaultPaymentTerms: data.defaultPaymentTerms || null,
    defaultTaxRateId: data.defaultTaxRateId || null,
    departmentKeys: data.departmentKeys,
    isPackage: data.isPackage,
    isActive: data.isActive,
  };

  const before = id ? await prisma.service.findUnique({ where: { id } }) : null;
  if (id && !before) throw NotFound('الخدمة غير موجودة');

  const service = await prisma.$transaction(async (tx) => {
    const saved = id
      ? await tx.service.update({ where: { id }, data: payload })
      : await tx.service.create({ data: payload });

    await tx.serviceDeliverable.deleteMany({ where: { serviceId: saved.id } });
    if (data.deliverables.length) {
      await tx.serviceDeliverable.createMany({
        data: data.deliverables.map((d, i) => ({ ...d, serviceId: saved.id, sortOrder: i })),
      });
    }

    await tx.servicePrice.deleteMany({ where: { serviceId: saved.id } });
    if (data.prices.length) {
      await tx.servicePrice.createMany({
        data: data.prices.map((p) => ({
          serviceId: saved.id,
          currency: p.currency,
          countryCode: p.countryCode || null,
          priceMinor: BigInt(Math.round(p.price * 100)),
        })),
      });
    }
    return saved;
  });

  const priceChanged = before && before.basePriceMinor !== service.basePriceMinor;
  await audit({
    userId: user.id,
    action: priceChanged ? 'PRICE_CHANGE' : id ? 'UPDATE' : 'CREATE',
    module: 'services',
    entityType: 'SERVICE',
    entityId: service.id,
    summary: `${id ? 'تعديل' : 'إضافة'} الخدمة ${service.nameAr}`,
    ...(before
      ? diff(before as unknown as Record<string, unknown>, {
          nameAr: service.nameAr,
          basePriceMinor: service.basePriceMinor,
          isActive: service.isActive,
        })
      : { newValue: { nameAr: service.nameAr, code: service.code } }),
  });

  return service;
}

export async function toggleService(id: string, isActive: boolean) {
  const user = await requirePermission('services', 'edit');
  await prisma.service.update({ where: { id }, data: { isActive } });
  await audit({
    userId: user.id,
    action: 'UPDATE',
    module: 'services',
    entityType: 'SERVICE',
    entityId: id,
    summary: isActive ? 'تفعيل خدمة' : 'إيقاف خدمة',
    newValue: { isActive },
  });
}

export async function deleteService(id: string) {
  const user = await requirePermission('services', 'delete');
  const service = await prisma.service.findUnique({ where: { id } });
  if (!service) throw NotFound('الخدمة غير موجودة');
  await prisma.service.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await audit({
    userId: user.id,
    action: 'DELETE',
    module: 'services',
    entityType: 'SERVICE',
    entityId: id,
    summary: `حذف الخدمة ${service.nameAr}`,
  });
}

export async function catalogOptions() {
  await requirePermission('services', 'view');
  const [taxRates, departments, currencies] = await Promise.all([
    prisma.taxRate.findMany({ where: { isActive: true } }),
    prisma.department.findMany({ where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } }),
    prisma.currency.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
  ]);
  return { taxRates, departments, currencies };
}

import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { requirePermission, can, scopeWhere, NotFound } from '@/server/auth/guard';
import { audit, diff } from './audit';

const OWNER_FIELDS = ['accountManagerId', 'salesOwnerId', 'createdById'];

export const clientSchema = z.object({
  legalName: z.string().trim().min(2, 'الاسم القانوني مطلوب'),
  brandName: z.string().trim().optional().nullable(),
  type: z.enum(['COMPANY', 'INDIVIDUAL']).default('COMPANY'),
  industry: z.string().trim().optional().nullable(),
  countryCode: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  taxNumber: z.string().trim().optional().nullable(),
  commercialReg: z.string().trim().optional().nullable(),
  website: z.string().trim().optional().nullable(),
  currency: z.string().default('EGP'),
  accountManagerId: z.string().optional().nullable(),
  salesOwnerId: z.string().optional().nullable(),
  status: z.enum(['PROSPECT', 'ACTIVE', 'PAUSED', 'CHURNED']).default('ACTIVE'),
  satisfaction: z.coerce.number().int().min(1).max(5).optional().nullable(),
  renewalDate: z.string().optional().nullable(),
  internalNotes: z.string().trim().optional().nullable(),
});

export const contactSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().trim().min(2, 'اسم جهة الاتصال مطلوب'),
  position: z.string().trim().optional().nullable(),
  type: z.enum(['MAIN', 'DECISION_MAKER', 'FINANCE', 'MARKETING', 'APPROVAL', 'TECHNICAL']).default('MAIN'),
  phone: z.string().trim().optional().nullable(),
  whatsapp: z.string().trim().optional().nullable(),
  email: z.string().trim().email('بريد غير صالح').optional().or(z.literal('')).nullable(),
  isPrimary: z.coerce.boolean().default(false),
  notes: z.string().trim().optional().nullable(),
});

export type ClientInput = z.infer<typeof clientSchema>;
export type ContactInput = z.infer<typeof contactSchema>;

export async function listClients(filters: {
  q?: string;
  status?: string;
  accountManagerId?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  dir?: 'asc' | 'desc';
}) {
  const user = await requirePermission('clients', 'view');
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, filters.pageSize ?? 25);

  const where: Prisma.ClientWhereInput = {
    deletedAt: null,
    ...scopeWhere(user, 'clients', OWNER_FIELDS),
    ...(filters.status ? { status: filters.status as never } : {}),
    ...(filters.accountManagerId ? { accountManagerId: filters.accountManagerId } : {}),
    ...(filters.q
      ? {
          OR: [
            { legalName: { contains: filters.q, mode: 'insensitive' } },
            { brandName: { contains: filters.q, mode: 'insensitive' } },
            { taxNumber: { contains: filters.q } },
          ],
        }
      : {}),
  };

  const sortable: Record<string, string> = {
    legalName: 'legalName',
    createdAt: 'createdAt',
    renewalDate: 'renewalDate',
    lastContactAt: 'lastContactAt',
  };
  const orderBy = sortable[filters.sort ?? '']
    ? { [sortable[filters.sort!]!]: filters.dir ?? 'desc' }
    : { legalName: 'asc' as const };

  const [rows, total] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        accountManager: { select: { id: true, name: true, avatarUrl: true } },
        salesOwner: { select: { id: true, name: true } },
        _count: { select: { projects: true, contracts: true, invoices: true, contacts: true } },
      },
    }),
    prisma.client.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}

export async function getClient(id: string) {
  const user = await requirePermission('clients', 'view');
  const client = await prisma.client.findFirst({
    where: { id, deletedAt: null, ...scopeWhere(user, 'clients', OWNER_FIELDS) },
    include: {
      accountManager: { select: { id: true, name: true, avatarUrl: true } },
      salesOwner: { select: { id: true, name: true } },
      contacts: { where: { deletedAt: null }, orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] },
      projects: {
        where: { deletedAt: null },
        select: { id: true, name: true, status: true, progressPercent: true, endDate: true },
        orderBy: { createdAt: 'desc' },
      },
      contracts: {
        where: { deletedAt: null },
        select: {
          id: true,
          number: true,
          status: true,
          valueMinor: true,
          currency: true,
          endDate: true,
          renewalDate: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      quotations: {
        where: { deletedAt: null },
        select: { id: true, number: true, status: true, totalMinor: true, currency: true, issueDate: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      deals: {
        where: { deletedAt: null },
        select: { id: true, title: true, status: true, valueMinor: true, currency: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });
  if (!client) throw NotFound('العميل غير موجود');

  const showMoney = can(user, 'clients', 'view_financial') || can(user, 'invoices', 'view_financial');

  const [invoices, payments, activities] = await Promise.all([
    showMoney
      ? prisma.invoice.findMany({
          where: { clientId: id, deletedAt: null },
          select: {
            id: true,
            number: true,
            status: true,
            totalMinor: true,
            paidMinor: true,
            currency: true,
            dueDate: true,
          },
          orderBy: { issueDate: 'desc' },
          take: 10,
        })
      : Promise.resolve([]),
    showMoney
      ? prisma.payment.aggregate({
          where: { clientId: id, deletedAt: null },
          _sum: { amountMinor: true },
        })
      : Promise.resolve({ _sum: { amountMinor: 0n } }),
    prisma.activity.findMany({
      where: { entityType: 'CLIENT', entityId: id },
      orderBy: { occurredAt: 'desc' },
      take: 50,
      include: { user: { select: { name: true, avatarUrl: true } } },
    }),
  ]);

  return {
    ...client,
    contracts: client.contracts.map((c) => ({ ...c, valueMinor: showMoney ? c.valueMinor : null })),
    quotations: client.quotations.map((q) => ({ ...q, totalMinor: showMoney ? q.totalMinor : null })),
    deals: client.deals.map((d) => ({ ...d, valueMinor: showMoney ? d.valueMinor : null })),
    invoices,
    totalPaidMinor: showMoney ? (payments._sum.amountMinor ?? 0n) : null,
    activities,
    showMoney,
  };
}

export async function createClient(input: ClientInput) {
  const user = await requirePermission('clients', 'create');
  const data = clientSchema.parse(input);

  const client = await prisma.client.create({
    data: {
      legalName: data.legalName,
      brandName: data.brandName || null,
      type: data.type,
      industry: data.industry || null,
      countryCode: data.countryCode || null,
      city: data.city || null,
      address: data.address || null,
      taxNumber: data.taxNumber || null,
      commercialReg: data.commercialReg || null,
      website: data.website || null,
      currency: data.currency,
      accountManagerId: data.accountManagerId || null,
      salesOwnerId: data.salesOwnerId || user.id,
      status: data.status,
      satisfaction: data.satisfaction ?? null,
      renewalDate: data.renewalDate ? new Date(data.renewalDate) : null,
      internalNotes: data.internalNotes || null,
      onboardedAt: new Date(),
      createdById: user.id,
    },
  });

  await prisma.activity.create({
    data: {
      entityType: 'CLIENT',
      entityId: client.id,
      type: 'SYSTEM',
      subject: 'تم إنشاء ملف العميل',
      userId: user.id,
    },
  });
  await audit({
    userId: user.id,
    action: 'CREATE',
    module: 'clients',
    entityType: 'CLIENT',
    entityId: client.id,
    summary: `إنشاء عميل: ${client.legalName}`,
  });
  return client;
}

export async function updateClient(id: string, input: ClientInput) {
  const user = await requirePermission('clients', 'edit');
  const data = clientSchema.parse(input);
  const before = await prisma.client.findFirst({
    where: { id, deletedAt: null, ...scopeWhere(user, 'clients', OWNER_FIELDS) },
  });
  if (!before) throw NotFound('العميل غير موجود');

  const updated = await prisma.client.update({
    where: { id },
    data: {
      legalName: data.legalName,
      brandName: data.brandName || null,
      type: data.type,
      industry: data.industry || null,
      countryCode: data.countryCode || null,
      city: data.city || null,
      address: data.address || null,
      taxNumber: data.taxNumber || null,
      commercialReg: data.commercialReg || null,
      website: data.website || null,
      currency: data.currency,
      accountManagerId: data.accountManagerId || null,
      salesOwnerId: data.salesOwnerId || null,
      status: data.status,
      satisfaction: data.satisfaction ?? null,
      renewalDate: data.renewalDate ? new Date(data.renewalDate) : null,
      internalNotes: data.internalNotes || null,
      updatedById: user.id,
    },
  });

  const d = diff(before as unknown as Record<string, unknown>, {
    legalName: updated.legalName,
    status: updated.status,
    accountManagerId: updated.accountManagerId,
    renewalDate: updated.renewalDate,
  });
  if (d.changed) {
    await audit({
      userId: user.id,
      action: 'UPDATE',
      module: 'clients',
      entityType: 'CLIENT',
      entityId: id,
      summary: `تعديل بيانات ${updated.legalName}`,
      oldValue: d.oldValue,
      newValue: d.newValue,
    });
  }
  return updated;
}

export async function softDeleteClient(id: string) {
  const user = await requirePermission('clients', 'delete');
  const client = await prisma.client.findFirst({ where: { id, deletedAt: null } });
  if (!client) throw NotFound('العميل غير موجود');
  await prisma.client.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({
    userId: user.id,
    action: 'DELETE',
    module: 'clients',
    entityType: 'CLIENT',
    entityId: id,
    summary: `حذف العميل ${client.legalName}`,
  });
}

export async function restoreClient(id: string) {
  const user = await requirePermission('clients', 'restore');
  await prisma.client.update({ where: { id }, data: { deletedAt: null } });
  await audit({
    userId: user.id,
    action: 'RESTORE',
    module: 'clients',
    entityType: 'CLIENT',
    entityId: id,
    summary: 'استرجاع عميل محذوف',
  });
}

/* ── جهات الاتصال ───────────────────────────────────── */

export async function upsertContact(input: ContactInput, contactId?: string) {
  const user = await requirePermission('contacts', contactId ? 'edit' : 'create');
  const data = contactSchema.parse(input);

  // جهة اتصال أساسية واحدة فقط لكل عميل.
  if (data.isPrimary) {
    await prisma.contact.updateMany({
      where: { clientId: data.clientId, ...(contactId ? { NOT: { id: contactId } } : {}) },
      data: { isPrimary: false },
    });
  }

  const payload = {
    clientId: data.clientId,
    name: data.name,
    position: data.position || null,
    type: data.type,
    phone: data.phone || null,
    whatsapp: data.whatsapp || null,
    email: data.email || null,
    isPrimary: data.isPrimary,
    notes: data.notes || null,
  };

  const contact = contactId
    ? await prisma.contact.update({ where: { id: contactId }, data: payload })
    : await prisma.contact.create({ data: payload });

  await audit({
    userId: user.id,
    action: contactId ? 'UPDATE' : 'CREATE',
    module: 'contacts',
    entityType: 'CONTACT',
    entityId: contact.id,
    summary: `${contactId ? 'تعديل' : 'إضافة'} جهة اتصال ${contact.name}`,
  });
  return contact;
}

export async function deleteContact(id: string) {
  const user = await requirePermission('contacts', 'delete');
  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) throw NotFound('جهة الاتصال غير موجودة');
  await prisma.contact.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({
    userId: user.id,
    action: 'DELETE',
    module: 'contacts',
    entityType: 'CONTACT',
    entityId: id,
    summary: `حذف جهة اتصال ${contact.name}`,
  });
}

export async function clientFormOptions() {
  await requirePermission('clients', 'view');
  const [users, countries] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.country.findMany({ where: { isActive: true } }),
  ]);
  return { users, countries };
}

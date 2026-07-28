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
  Forbidden,
} from '@/server/auth/guard';
import { audit } from './audit';
import { nextNumber } from './numbering';
import { computeDocument, splitInstallments, type DiscountKind } from './money';
import { getSettings } from './settings';
import { notify } from './notifications';

const OWNER_FIELDS = ['preparedById'];

export const quotationItemSchema = z.object({
  serviceId: z.string().optional().nullable(),
  nameAr: z.string().trim().min(1, 'اسم البند مطلوب'),
  nameEn: z.string().trim().optional().default(''),
  description: z.string().trim().optional().nullable(),
  quantity: z.coerce.number().min(0.0001, 'الكمية يجب أن تكون أكبر من صفر'),
  unitPrice: z.coerce.number().min(0),
  discountType: z.enum(['NONE', 'PERCENT', 'AMOUNT']).default('NONE'),
  discountValue: z.coerce.number().min(0).default(0),
  taxRateId: z.string().optional().nullable(),
  taxRate: z.coerce.number().min(0).default(0),
});

export const installmentSchema = z.object({
  label: z.string().trim().min(1),
  percentage: z.coerce.number().min(0).max(100),
  dueOffsetDays: z.coerce.number().int().min(0).default(0),
});

export const quotationSchema = z.object({
  clientId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  dealId: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  issueDate: z.string().min(1, 'تاريخ الإصدار مطلوب'),
  expiryDate: z.string().min(1, 'تاريخ انتهاء الصلاحية مطلوب'),
  currency: z.string().default('EGP'),
  headerDiscountType: z.enum(['NONE', 'PERCENT', 'AMOUNT']).default('NONE'),
  headerDiscountValue: z.coerce.number().min(0).default(0),
  paymentTerms: z.string().trim().optional().nullable(),
  executionTerms: z.string().trim().optional().nullable(),
  validityNote: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  termsAr: z.string().trim().optional().nullable(),
  termsEn: z.string().trim().optional().nullable(),
  items: z.array(quotationItemSchema).min(1, 'أضف بندًا واحدًا على الأقل'),
  installments: z.array(installmentSchema).default([]),
});

export type QuotationInput = z.infer<typeof quotationSchema>;

/** الحالات التي لا يجوز التعديل عليها مباشرة — أي تغيير ينشئ نسخة جديدة. */
const LOCKED_STATUSES = ['SENT', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'];

function computeTotals(input: QuotationInput) {
  const doc = computeDocument({
    lines: input.items.map((i) => ({
      quantity: i.quantity,
      unitPriceMinor: BigInt(Math.round(i.unitPrice * 100)),
      discountType: i.discountType as DiscountKind,
      // خصم السطر بالمبلغ يُدخل بالعملة الكبرى ويُحوَّل هنا لوحدة صغرى
      discountValue: i.discountType === 'AMOUNT' ? Math.round(i.discountValue * 100) : i.discountValue,
      taxRate: i.taxRate,
    })),
    headerDiscountType: input.headerDiscountType as DiscountKind,
    headerDiscountValue:
      input.headerDiscountType === 'AMOUNT'
        ? Math.round(input.headerDiscountValue * 100)
        : input.headerDiscountValue,
  });

  const installments = input.installments.length
    ? splitInstallments(
        doc.totalMinor,
        input.installments.map((i) => i.percentage),
      )
    : [];

  return { doc, installments };
}

export async function listQuotations(filters: {
  q?: string;
  status?: string;
  clientId?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  dir?: 'asc' | 'desc';
}) {
  const user = await requirePermission('quotations', 'view');
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, filters.pageSize ?? 25);

  const where: Prisma.QuotationWhereInput = {
    deletedAt: null,
    ...scopeWhere(user, 'quotations', OWNER_FIELDS),
    ...(filters.status ? { status: filters.status as never } : {}),
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.q
      ? {
          OR: [
            { number: { contains: filters.q, mode: 'insensitive' } },
            { client: { legalName: { contains: filters.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.quotation.findMany({
      where,
      orderBy: { createdAt: filters.dir ?? 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        client: { select: { id: true, legalName: true, brandName: true } },
        lead: { select: { id: true, fullName: true } },
        preparedBy: { select: { id: true, name: true } },
        approvedBy: { select: { name: true } },
        _count: { select: { items: true, versions: true } },
      },
    }),
    prisma.quotation.count({ where }),
  ]);

  const showMoney = can(user, 'quotations', 'view_financial');
  return {
    rows: rows.map((r) => ({ ...r, totalMinor: showMoney ? r.totalMinor : null })),
    total,
    page,
    pageSize,
  };
}

export async function getQuotation(id: string) {
  const user = await requirePermission('quotations', 'view');
  const quotation = await prisma.quotation.findFirst({
    where: { id, deletedAt: null, ...scopeWhere(user, 'quotations', OWNER_FIELDS) },
    include: {
      client: true,
      contact: true,
      lead: { select: { id: true, fullName: true, email: true, phone: true } },
      deal: { select: { id: true, title: true } },
      preparedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      items: { orderBy: { sortOrder: 'asc' }, include: { service: { select: { nameAr: true } } } },
      installments: { orderBy: { sortOrder: 'asc' } },
      versions: {
        select: { id: true, number: true, version: true, status: true, totalMinor: true, createdAt: true },
        orderBy: { version: 'desc' },
      },
      parent: { select: { id: true, number: true, version: true } },
      contracts: { select: { id: true, number: true } },
      projects: { select: { id: true, name: true } },
    },
  });
  if (!quotation) throw NotFound('عرض السعر غير موجود');
  if (!can(user, 'quotations', 'view_financial')) {
    throw Forbidden('عرض السعر يحتوي بيانات مالية لا تملك صلاحية رؤيتها');
  }
  return quotation;
}

export async function createQuotation(input: QuotationInput) {
  const user = await requirePermission('quotations', 'create');
  const data = quotationSchema.parse(input);
  if (!data.clientId && !data.leadId) throw BadRequest('يجب ربط العرض بعميل أو عميل محتمل');

  const totalPercentage = data.installments.reduce((s, i) => s + i.percentage, 0);
  if (data.installments.length > 0 && Math.abs(totalPercentage - 100) > 0.0001) {
    throw BadRequest(`مجموع نسب الأقساط يجب أن يساوي 100% (الحالي ${totalPercentage}%)`);
  }

  const { doc, installments } = computeTotals(data);
  const settings = await getSettings();
  const issueDate = new Date(data.issueDate);

  const quotation = await prisma.$transaction(async (tx) => {
    const number = await nextNumber('QUOTATION', tx);
    return tx.quotation.create({
      data: {
        number,
        version: 1,
        clientId: data.clientId || null,
        leadId: data.leadId || null,
        dealId: data.dealId || null,
        contactId: data.contactId || null,
        issueDate,
        expiryDate: new Date(data.expiryDate),
        currency: data.currency,
        status: settings.quotation.requireInternalApproval ? 'DRAFT' : 'DRAFT',
        subtotalMinor: doc.subtotalMinor,
        discountMinor: doc.discountMinor,
        taxMinor: doc.taxMinor,
        totalMinor: doc.totalMinor,
        headerDiscountType: data.headerDiscountType,
        headerDiscountValue: data.headerDiscountValue,
        paymentTerms: data.paymentTerms || null,
        executionTerms: data.executionTerms || null,
        validityNote: data.validityNote || null,
        notes: data.notes || null,
        termsAr: data.termsAr || settings.quotation.defaultTermsAr,
        termsEn: data.termsEn || settings.quotation.defaultTermsEn,
        preparedById: user.id,
        items: {
          create: data.items.map((item, i) => ({
            serviceId: item.serviceId || null,
            nameAr: item.nameAr,
            nameEn: item.nameEn || item.nameAr,
            description: item.description || null,
            quantity: item.quantity,
            unitPriceMinor: BigInt(Math.round(item.unitPrice * 100)),
            discountType: item.discountType,
            discountValue: item.discountValue,
            taxRateId: item.taxRateId || null,
            taxRate: item.taxRate,
            subtotalMinor: doc.lines[i]!.subtotalMinor,
            discountMinor: doc.lines[i]!.discountMinor,
            taxMinor: doc.lines[i]!.taxMinor,
            totalMinor: doc.lines[i]!.totalMinor,
            sortOrder: i,
          })),
        },
        installments: {
          create: data.installments.map((inst, i) => ({
            label: inst.label,
            percentage: inst.percentage,
            amountMinor: installments[i] ?? 0n,
            dueOffsetDays: inst.dueOffsetDays,
            dueDate: new Date(issueDate.getTime() + inst.dueOffsetDays * 86_400_000),
            sortOrder: i,
          })),
        },
      },
    });
  });

  await audit({
    userId: user.id,
    action: 'CREATE',
    module: 'quotations',
    entityType: 'QUOTATION',
    entityId: quotation.id,
    summary: `إنشاء عرض سعر ${quotation.number}`,
    newValue: { number: quotation.number, total: Number(quotation.totalMinor) / 100 },
  });

  if (quotation.leadId) {
    await prisma.activity.create({
      data: {
        entityType: 'LEAD',
        entityId: quotation.leadId,
        type: 'QUOTATION',
        subject: `تم إنشاء عرض سعر ${quotation.number}`,
        userId: user.id,
      },
    });
  }

  return quotation;
}

/**
 * التعديل: قبل الإرسال يُعدَّل مباشرة، وبعده يُنشأ إصدار جديد
 * (version+1) مع الحفاظ الكامل على النسخة السابقة.
 */
export async function updateQuotation(id: string, input: QuotationInput) {
  const user = await requirePermission('quotations', 'edit');
  const data = quotationSchema.parse(input);
  const existing = await prisma.quotation.findFirst({
    where: { id, deletedAt: null, ...scopeWhere(user, 'quotations', OWNER_FIELDS) },
  });
  if (!existing) throw NotFound('عرض السعر غير موجود');

  const totalPercentage = data.installments.reduce((s, i) => s + i.percentage, 0);
  if (data.installments.length > 0 && Math.abs(totalPercentage - 100) > 0.0001) {
    throw BadRequest(`مجموع نسب الأقساط يجب أن يساوي 100% (الحالي ${totalPercentage}%)`);
  }

  const { doc, installments } = computeTotals(data);
  const issueDate = new Date(data.issueDate);
  const needsNewVersion = LOCKED_STATUSES.includes(existing.status);

  if (needsNewVersion) {
    const rootId = existing.parentId ?? existing.id;
    const latest = await prisma.quotation.findFirst({
      where: { OR: [{ id: rootId }, { parentId: rootId }] },
      orderBy: { version: 'desc' },
    });
    const created = await prisma.$transaction(async (tx) => {
      const q = await tx.quotation.create({
        data: {
          number: `${existing.number.split('-v')[0]}-v${(latest?.version ?? 1) + 1}`,
          version: (latest?.version ?? 1) + 1,
          parentId: rootId,
          clientId: data.clientId || null,
          leadId: data.leadId || null,
          dealId: data.dealId || null,
          contactId: data.contactId || null,
          issueDate,
          expiryDate: new Date(data.expiryDate),
          currency: data.currency,
          status: 'REVISED',
          subtotalMinor: doc.subtotalMinor,
          discountMinor: doc.discountMinor,
          taxMinor: doc.taxMinor,
          totalMinor: doc.totalMinor,
          headerDiscountType: data.headerDiscountType,
          headerDiscountValue: data.headerDiscountValue,
          paymentTerms: data.paymentTerms || null,
          executionTerms: data.executionTerms || null,
          validityNote: data.validityNote || null,
          notes: data.notes || null,
          termsAr: data.termsAr || null,
          termsEn: data.termsEn || null,
          preparedById: user.id,
          items: {
            create: data.items.map((item, i) => ({
              serviceId: item.serviceId || null,
              nameAr: item.nameAr,
              nameEn: item.nameEn || item.nameAr,
              description: item.description || null,
              quantity: item.quantity,
              unitPriceMinor: BigInt(Math.round(item.unitPrice * 100)),
              discountType: item.discountType,
              discountValue: item.discountValue,
              taxRateId: item.taxRateId || null,
              taxRate: item.taxRate,
              subtotalMinor: doc.lines[i]!.subtotalMinor,
              discountMinor: doc.lines[i]!.discountMinor,
              taxMinor: doc.lines[i]!.taxMinor,
              totalMinor: doc.lines[i]!.totalMinor,
              sortOrder: i,
            })),
          },
          installments: {
            create: data.installments.map((inst, i) => ({
              label: inst.label,
              percentage: inst.percentage,
              amountMinor: installments[i] ?? 0n,
              dueOffsetDays: inst.dueOffsetDays,
              dueDate: new Date(issueDate.getTime() + inst.dueOffsetDays * 86_400_000),
              sortOrder: i,
            })),
          },
        },
      });
      return q;
    });

    await audit({
      userId: user.id,
      action: 'UPDATE',
      module: 'quotations',
      entityType: 'QUOTATION',
      entityId: created.id,
      summary: `إصدار نسخة جديدة (v${created.version}) من ${existing.number}`,
      oldValue: { id: existing.id, version: existing.version },
      newValue: { id: created.id, version: created.version },
    });
    return created;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.quotationItem.deleteMany({ where: { quotationId: id } });
    await tx.quotationInstallment.deleteMany({ where: { quotationId: id } });
    return tx.quotation.update({
      where: { id },
      data: {
        clientId: data.clientId || null,
        leadId: data.leadId || null,
        dealId: data.dealId || null,
        contactId: data.contactId || null,
        issueDate,
        expiryDate: new Date(data.expiryDate),
        currency: data.currency,
        subtotalMinor: doc.subtotalMinor,
        discountMinor: doc.discountMinor,
        taxMinor: doc.taxMinor,
        totalMinor: doc.totalMinor,
        headerDiscountType: data.headerDiscountType,
        headerDiscountValue: data.headerDiscountValue,
        paymentTerms: data.paymentTerms || null,
        executionTerms: data.executionTerms || null,
        validityNote: data.validityNote || null,
        notes: data.notes || null,
        termsAr: data.termsAr || null,
        termsEn: data.termsEn || null,
        items: {
          create: data.items.map((item, i) => ({
            serviceId: item.serviceId || null,
            nameAr: item.nameAr,
            nameEn: item.nameEn || item.nameAr,
            description: item.description || null,
            quantity: item.quantity,
            unitPriceMinor: BigInt(Math.round(item.unitPrice * 100)),
            discountType: item.discountType,
            discountValue: item.discountValue,
            taxRateId: item.taxRateId || null,
            taxRate: item.taxRate,
            subtotalMinor: doc.lines[i]!.subtotalMinor,
            discountMinor: doc.lines[i]!.discountMinor,
            taxMinor: doc.lines[i]!.taxMinor,
            totalMinor: doc.lines[i]!.totalMinor,
            sortOrder: i,
          })),
        },
        installments: {
          create: data.installments.map((inst, i) => ({
            label: inst.label,
            percentage: inst.percentage,
            amountMinor: installments[i] ?? 0n,
            dueOffsetDays: inst.dueOffsetDays,
            dueDate: new Date(issueDate.getTime() + inst.dueOffsetDays * 86_400_000),
            sortOrder: i,
          })),
        },
      },
    });
  });

  await audit({
    userId: user.id,
    action: existing.totalMinor !== updated.totalMinor ? 'PRICE_CHANGE' : 'UPDATE',
    module: 'quotations',
    entityType: 'QUOTATION',
    entityId: id,
    summary: `تعديل عرض السعر ${updated.number}`,
    oldValue: { total: Number(existing.totalMinor) / 100 },
    newValue: { total: Number(updated.totalMinor) / 100 },
  });
  return updated;
}

export async function submitForApproval(id: string) {
  const user = await requirePermission('quotations', 'edit');
  const q = await prisma.quotation.findFirst({
    where: { id, deletedAt: null, ...scopeWhere(user, 'quotations', OWNER_FIELDS) },
  });
  if (!q) throw NotFound('عرض السعر غير موجود');
  if (!['DRAFT', 'REVISED'].includes(q.status)) throw BadRequest('يمكن إرسال المسودات فقط للاعتماد');

  await prisma.quotation.update({ where: { id }, data: { status: 'PENDING_INTERNAL_APPROVAL' } });

  const approvers = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      role: { permissions: { some: { module: 'quotations', action: 'approve' } } },
    },
    select: { id: true },
  });
  for (const a of approvers) {
    await notify({
      userId: a.id,
      type: 'APPROVAL_REQUESTED',
      title: `طلب اعتماد عرض سعر ${q.number}`,
      entityType: 'QUOTATION',
      entityId: id,
      link: `/quotations/${id}`,
      dedupeKey: `APPROVAL_REQUESTED:QUOTATION:${id}:${a.id}`,
    });
  }

  await audit({
    userId: user.id,
    action: 'STATUS_CHANGE',
    module: 'quotations',
    entityType: 'QUOTATION',
    entityId: id,
    summary: `إرسال ${q.number} للاعتماد الداخلي`,
  });
}

export async function approveQuotation(id: string, approve: boolean, comment?: string) {
  const user = await requirePermission('quotations', 'approve');
  const settings = await getSettings();
  const q = await prisma.quotation.findUnique({ where: { id } });
  if (!q) throw NotFound('عرض السعر غير موجود');

  if (q.preparedById === user.id && !settings.quotation.allowSelfApproval) {
    throw Forbidden('لا يمكنك اعتماد عرض سعر أعددته بنفسك — الإعداد الحالي يمنع الاعتماد الذاتي');
  }

  await prisma.quotation.update({
    where: { id },
    data: {
      status: approve ? 'APPROVED_INTERNALLY' : 'DRAFT',
      approvedById: approve ? user.id : null,
      approvedAt: approve ? new Date() : null,
    },
  });
  await prisma.approval.create({
    data: {
      entityType: 'QUOTATION',
      entityId: id,
      step: 'INTERNAL',
      approverId: user.id,
      status: approve ? 'APPROVED' : 'REJECTED',
      comment,
      decidedAt: new Date(),
    },
  });
  await notify({
    userId: q.preparedById,
    type: approve ? 'WORK_APPROVED' : 'REVISION_REQUESTED',
    title: approve ? `تم اعتماد عرض السعر ${q.number}` : `عرض السعر ${q.number} يحتاج تعديلًا`,
    body: comment,
    entityType: 'QUOTATION',
    entityId: id,
    link: `/quotations/${id}`,
    dedupeKey: `QUOTATION_DECISION:${id}:${Date.now()}`,
  });
  await audit({
    userId: user.id,
    action: approve ? 'APPROVE' : 'REJECT',
    module: 'quotations',
    entityType: 'QUOTATION',
    entityId: id,
    summary: `${approve ? 'اعتماد' : 'رفض'} عرض السعر ${q.number}`,
    newValue: { comment },
  });
}

export async function markSent(id: string) {
  const user = await requirePermission('quotations', 'edit');
  const settings = await getSettings();
  const q = await prisma.quotation.findFirst({
    where: { id, deletedAt: null, ...scopeWhere(user, 'quotations', OWNER_FIELDS) },
  });
  if (!q) throw NotFound('عرض السعر غير موجود');

  if (settings.quotation.requireInternalApproval && q.status !== 'APPROVED_INTERNALLY') {
    throw BadRequest('لا يمكن الإرسال قبل الاعتماد الداخلي (الإعداد مفعّل في إعدادات النظام)');
  }

  await prisma.quotation.update({
    where: { id },
    data: { status: 'SENT', sentAt: new Date() },
  });
  if (q.leadId) {
    await prisma.activity.create({
      data: {
        entityType: 'LEAD',
        entityId: q.leadId,
        type: 'QUOTATION',
        subject: `تم إرسال عرض السعر ${q.number}`,
        userId: user.id,
      },
    });
  }
  await audit({
    userId: user.id,
    action: 'STATUS_CHANGE',
    module: 'quotations',
    entityType: 'QUOTATION',
    entityId: id,
    summary: `إرسال عرض السعر ${q.number} للعميل`,
  });
}

/**
 * قبول العميل: يقفل العرض، يحوّل الصفقة إلى Won، وينشئ العميل إن لم يكن موجودًا.
 */
export async function decideByClient(id: string, accepted: boolean, reason?: string) {
  const user = await requirePermission('quotations', 'edit');
  const q = await prisma.quotation.findFirst({
    where: { id, deletedAt: null, ...scopeWhere(user, 'quotations', OWNER_FIELDS) },
    include: { lead: true, deal: true },
  });
  if (!q) throw NotFound('عرض السعر غير موجود');
  if (!['SENT', 'UNDER_REVIEW', 'REVISED'].includes(q.status)) {
    throw BadRequest('يجب إرسال العرض للعميل أولًا قبل تسجيل قراره');
  }

  let clientId = q.clientId;

  await prisma.$transaction(async (tx) => {
    await tx.quotation.update({
      where: { id },
      data: {
        status: accepted ? 'ACCEPTED' : 'REJECTED',
        acceptedAt: accepted ? new Date() : null,
        rejectedAt: accepted ? null : new Date(),
        rejectionReason: accepted ? null : (reason ?? null),
      },
    });

    if (accepted) {
      // إنشاء العميل من بيانات العميل المحتمل عند الحاجة.
      if (!clientId && q.lead) {
        const created = await tx.client.create({
          data: {
            legalName: q.lead.companyName || q.lead.fullName,
            brandName: q.lead.companyName,
            type: q.lead.companyName ? 'COMPANY' : 'INDIVIDUAL',
            countryCode: q.lead.countryCode,
            city: q.lead.city,
            currency: q.currency,
            salesOwnerId: q.lead.assignedToId,
            status: 'ACTIVE',
            onboardedAt: new Date(),
            createdById: user.id,
            contacts: {
              create: [
                {
                  name: q.lead.fullName,
                  type: 'MAIN',
                  phone: q.lead.phone,
                  whatsapp: q.lead.whatsapp,
                  email: q.lead.email,
                  isPrimary: true,
                },
              ],
            },
          },
        });
        clientId = created.id;
        await tx.quotation.update({ where: { id }, data: { clientId } });
        await tx.lead.update({
          where: { id: q.lead.id },
          data: { convertedClientId: clientId, convertedAt: new Date(), status: 'CONVERTED' },
        });
      }

      if (q.dealId) {
        const wonStage = await tx.pipelineStage.findFirst({ where: { pipeline: 'DEAL', isWon: true } });
        await tx.deal.update({
          where: { id: q.dealId },
          data: {
            status: 'WON',
            actualCloseDate: new Date(),
            clientId,
            ...(wonStage ? { stageId: wonStage.id, probability: wonStage.probability } : {}),
          },
        });
        if (wonStage) {
          await tx.stageHistory.create({
            data: { dealId: q.dealId, toStageId: wonStage.id, movedById: user.id, note: 'قبول عرض السعر' },
          });
        }
      }
    }
  });

  await audit({
    userId: user.id,
    action: accepted ? 'APPROVE' : 'REJECT',
    module: 'quotations',
    entityType: 'QUOTATION',
    entityId: id,
    summary: `${accepted ? 'قبول' : 'رفض'} العميل لعرض السعر ${q.number}`,
    newValue: { reason },
  });

  return { clientId };
}

export async function softDeleteQuotation(id: string) {
  const user = await requirePermission('quotations', 'delete');
  const q = await prisma.quotation.findFirst({ where: { id, deletedAt: null } });
  if (!q) throw NotFound('عرض السعر غير موجود');
  if (q.status === 'ACCEPTED') throw BadRequest('لا يمكن حذف عرض سعر مقبول — استخدم الإلغاء بدلًا من ذلك');
  await prisma.quotation.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({
    userId: user.id,
    action: 'DELETE',
    module: 'quotations',
    entityType: 'QUOTATION',
    entityId: id,
    summary: `حذف عرض السعر ${q.number}`,
  });
}

export async function quotationFormOptions() {
  await requirePermission('quotations', 'view');
  const [clients, leads, services, taxRates, deals, currencies] = await Promise.all([
    prisma.client.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        legalName: true,
        brandName: true,
        currency: true,
        contacts: { where: { deletedAt: null }, select: { id: true, name: true, type: true } },
      },
      orderBy: { legalName: 'asc' },
    }),
    prisma.lead.findMany({
      where: { deletedAt: null, status: { notIn: ['LOST', 'ARCHIVED'] } },
      select: { id: true, fullName: true, companyName: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.service.findMany({
      where: { isActive: true, deletedAt: null },
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        basePriceMinor: true,
        currency: true,
        defaultTaxRateId: true,
        description: true,
      },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.taxRate.findMany({ where: { isActive: true } }),
    prisma.deal.findMany({
      where: { deletedAt: null, status: 'OPEN' },
      select: { id: true, title: true, clientId: true, leadId: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.currency.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
  ]);
  const settings = await getSettings();
  return { clients, leads, services, taxRates, deals, currencies, settings: settings.quotation };
}

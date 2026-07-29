import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { requirePermission, NotFound, BadRequest } from '@/server/auth/guard';
import { audit } from './audit';
import { nextNumber } from './numbering';
import { computeDocument, invoicePaymentState, type DiscountKind } from './money';
import { getSettings } from './settings';
import { notify } from './notifications';

export const invoiceItemSchema = z.object({
  nameAr: z.string().trim().min(1, 'اسم البند مطلوب'),
  nameEn: z.string().trim().optional().default(''),
  description: z.string().trim().optional().nullable(),
  quantity: z.coerce.number().min(0.0001),
  unitPrice: z.coerce.number().min(0),
  discountType: z.enum(['NONE', 'PERCENT', 'AMOUNT']).default('NONE'),
  discountValue: z.coerce.number().min(0).default(0),
  taxRateId: z.string().optional().nullable(),
  taxRate: z.coerce.number().min(0).default(0),
});

export const invoiceSchema = z.object({
  clientId: z.string().min(1, 'العميل مطلوب'),
  contractId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  quotationId: z.string().optional().nullable(),
  issueDate: z.string().min(1, 'تاريخ الإصدار مطلوب'),
  dueDate: z.string().min(1, 'تاريخ الاستحقاق مطلوب'),
  currency: z.string().default('EGP'),
  paymentMethod: z
    .enum(['CASH', 'BANK_TRANSFER', 'INSTAPAY', 'VODAFONE_CASH', 'CHEQUE', 'CARD', 'PAYPAL', 'OTHER'])
    .optional()
    .nullable(),
  notes: z.string().trim().optional().nullable(),
  items: z.array(invoiceItemSchema).min(1, 'أضف بندًا واحدًا على الأقل'),
});

export type InvoiceInput = z.infer<typeof invoiceSchema>;

export const paymentSchema = z.object({
  invoiceId: z.string().optional().nullable(),
  clientId: z.string().min(1, 'العميل مطلوب'),
  amount: z.coerce.number().positive('المبلغ يجب أن يكون أكبر من صفر'),
  currency: z.string().default('EGP'),
  paidAt: z.string().min(1, 'تاريخ الدفع مطلوب'),
  method: z
    .enum(['CASH', 'BANK_TRANSFER', 'INSTAPAY', 'VODAFONE_CASH', 'CHEQUE', 'CARD', 'PAYPAL', 'OTHER'])
    .default('BANK_TRANSFER'),
  reference: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export type PaymentInput = z.infer<typeof paymentSchema>;

function computeInvoiceTotals(items: InvoiceInput['items']) {
  return computeDocument({
    lines: items.map((i) => ({
      quantity: i.quantity,
      unitPriceMinor: BigInt(Math.round(i.unitPrice * 100)),
      discountType: i.discountType as DiscountKind,
      discountValue: i.discountType === 'AMOUNT' ? Math.round(i.discountValue * 100) : i.discountValue,
      taxRate: i.taxRate,
    })),
  });
}

export async function listInvoices(filters: {
  q?: string;
  status?: string;
  clientId?: string;
  page?: number;
  pageSize?: number;
}) {
  await requirePermission('invoices', 'view');
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, filters.pageSize ?? 25);

  const where: Prisma.InvoiceWhereInput = {
    deletedAt: null,
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

  const [rows, total, totals] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { issueDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        client: { select: { id: true, legalName: true, brandName: true } },
        project: { select: { id: true, name: true } },
        _count: { select: { payments: true } },
      },
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.aggregate({
      where: { ...where, status: { notIn: ['DRAFT', 'CANCELLED'] } },
      _sum: { totalMinor: true, paidMinor: true },
    }),
  ]);

  return {
    rows,
    total,
    page,
    pageSize,
    summary: {
      invoicedMinor: Number(totals._sum.totalMinor ?? 0n),
      collectedMinor: Number(totals._sum.paidMinor ?? 0n),
      outstandingMinor: Number((totals._sum.totalMinor ?? 0n) - (totals._sum.paidMinor ?? 0n)),
    },
  };
}

export async function getInvoice(id: string) {
  await requirePermission('invoices', 'view');
  const invoice = await prisma.invoice.findFirst({
    where: { id, deletedAt: null },
    include: {
      client: true,
      project: { select: { id: true, name: true } },
      contract: { select: { id: true, number: true } },
      quotation: { select: { id: true, number: true } },
      items: { orderBy: { sortOrder: 'asc' } },
      payments: {
        where: { deletedAt: null },
        orderBy: { paidAt: 'desc' },
        include: { recordedBy: { select: { name: true } } },
      },
    },
  });
  if (!invoice) throw NotFound('الفاتورة غير موجودة');
  return invoice;
}

export async function createInvoice(input: InvoiceInput) {
  const user = await requirePermission('invoices', 'create');
  const data = invoiceSchema.parse(input);
  const doc = computeInvoiceTotals(data.items);

  const invoice = await prisma.$transaction(async (tx) => {
    const number = await nextNumber('INVOICE', tx);
    return tx.invoice.create({
      data: {
        number,
        clientId: data.clientId,
        contractId: data.contractId || null,
        projectId: data.projectId || null,
        quotationId: data.quotationId || null,
        issueDate: new Date(data.issueDate),
        dueDate: new Date(data.dueDate),
        currency: data.currency,
        subtotalMinor: doc.subtotalMinor,
        discountMinor: doc.discountMinor,
        taxMinor: doc.taxMinor,
        totalMinor: doc.totalMinor,
        paymentMethod: data.paymentMethod || null,
        notes: data.notes || null,
        status: 'DRAFT',
        createdById: user.id,
        items: {
          create: data.items.map((item, i) => ({
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
      },
    });
  });

  await audit({
    userId: user.id,
    action: 'CREATE',
    module: 'invoices',
    entityType: 'INVOICE',
    entityId: invoice.id,
    summary: `إنشاء فاتورة ${invoice.number}`,
    newValue: { number: invoice.number, total: Number(invoice.totalMinor) / 100 },
  });
  return invoice;
}

/** إنشاء فاتورة من عرض سعر مقبول — بدون إعادة إدخال البنود. */
export async function invoiceFromQuotation(quotationId: string) {
  const user = await requirePermission('invoices', 'create');
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!quotation) throw NotFound('عرض السعر غير موجود');
  if (!quotation.clientId) throw BadRequest('عرض السعر غير مرتبط بعميل');
  if (quotation.status !== 'ACCEPTED') throw BadRequest('يمكن الفوترة من العروض المقبولة فقط');

  const settings = await getSettings();
  const issueDate = new Date();
  const dueDate = new Date(issueDate.getTime() + settings.finance.defaultPaymentTermsDays * 86_400_000);

  return createInvoice({
    clientId: quotation.clientId,
    quotationId: quotation.id,
    issueDate: issueDate.toISOString(),
    dueDate: dueDate.toISOString(),
    currency: quotation.currency,
    items: quotation.items.map((i) => ({
      nameAr: i.nameAr,
      nameEn: i.nameEn,
      description: i.description,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPriceMinor) / 100,
      discountType: i.discountType,
      discountValue:
        i.discountType === 'AMOUNT' ? Number(i.discountValue) / 100 : Number(i.discountValue),
      taxRateId: i.taxRateId,
      taxRate: Number(i.taxRate),
    })),
    contractId: null,
    projectId: null,
    paymentMethod: null,
    notes: `مُنشأة من عرض السعر ${quotation.number}`,
  });
}

export async function updateInvoice(id: string, input: InvoiceInput) {
  const user = await requirePermission('invoices', 'edit');
  const data = invoiceSchema.parse(input);
  const before = await prisma.invoice.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw NotFound('الفاتورة غير موجودة');
  if (before.paidMinor > 0n) {
    throw BadRequest('لا يمكن تعديل فاتورة عليها مدفوعات — أنشئ إشعار خصم أو ألغِ الفاتورة');
  }

  const doc = computeInvoiceTotals(data.items);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    return tx.invoice.update({
      where: { id },
      data: {
        clientId: data.clientId,
        contractId: data.contractId || null,
        projectId: data.projectId || null,
        issueDate: new Date(data.issueDate),
        dueDate: new Date(data.dueDate),
        currency: data.currency,
        subtotalMinor: doc.subtotalMinor,
        discountMinor: doc.discountMinor,
        taxMinor: doc.taxMinor,
        totalMinor: doc.totalMinor,
        paymentMethod: data.paymentMethod || null,
        notes: data.notes || null,
        updatedById: user.id,
        items: {
          create: data.items.map((item, i) => ({
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
      },
    });
  });

  await audit({
    userId: user.id,
    action: before.totalMinor !== updated.totalMinor ? 'PRICE_CHANGE' : 'UPDATE',
    module: 'invoices',
    entityType: 'INVOICE',
    entityId: id,
    summary: `تعديل الفاتورة ${updated.number}`,
    oldValue: { total: Number(before.totalMinor) / 100 },
    newValue: { total: Number(updated.totalMinor) / 100 },
  });
  return updated;
}

export async function cancelInvoice(id: string, reason: string) {
  const user = await requirePermission('invoices', 'edit');
  if (!reason?.trim()) throw BadRequest('سبب الإلغاء مطلوب');
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw NotFound('الفاتورة غير موجودة');

  await prisma.invoice.update({
    where: { id },
    data: { status: 'CANCELLED', cancelReason: reason.trim() },
  });
  await audit({
    userId: user.id,
    action: 'STATUS_CHANGE',
    module: 'invoices',
    entityType: 'INVOICE',
    entityId: id,
    summary: `إلغاء الفاتورة ${invoice.number}`,
    newValue: { reason },
  });
}

/**
 * تسجيل دفعة — المبلغ المدفوع مشتق دائمًا من مجموع المدفوعات ولا يُدخل يدويًا.
 */
export async function recordPayment(input: PaymentInput) {
  const user = await requirePermission('payments', 'create');
  const data = paymentSchema.parse(input);
  const amountMinor = BigInt(Math.round(data.amount * 100));

  if (data.invoiceId) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: data.invoiceId },
      include: { payments: { where: { deletedAt: null } } },
    });
    if (!invoice) throw NotFound('الفاتورة غير موجودة');
    if (invoice.status === 'CANCELLED') throw BadRequest('لا يمكن تسجيل دفعة على فاتورة ملغاة');

    const alreadyPaid = invoice.payments.reduce((s, p) => s + p.amountMinor, 0n);
    const remaining = invoice.totalMinor - alreadyPaid;
    if (amountMinor > remaining) {
      throw BadRequest(
        `المبلغ يتجاوز المتبقي على الفاتورة (${Number(remaining) / 100}). عدّل المبلغ أو سجّل الفائض كدفعة منفصلة.`,
      );
    }
  }

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        invoiceId: data.invoiceId || null,
        clientId: data.clientId,
        amountMinor,
        currency: data.currency,
        paidAt: new Date(data.paidAt),
        method: data.method,
        reference: data.reference || null,
        notes: data.notes || null,
        recordedById: user.id,
      },
    });

    if (data.invoiceId) {
      const sum = await tx.payment.aggregate({
        where: { invoiceId: data.invoiceId, deletedAt: null },
        _sum: { amountMinor: true },
      });
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: data.invoiceId } });
      const paid = sum._sum.amountMinor ?? 0n;
      await tx.invoice.update({
        where: { id: data.invoiceId },
        data: {
          paidMinor: paid,
          status: invoicePaymentState(invoice.totalMinor, paid, invoice.dueDate),
        },
      });
    }
    return created;
  });

  await prisma.activity.create({
    data: {
      entityType: 'CLIENT',
      entityId: data.clientId,
      type: 'PAYMENT',
      subject: `تسجيل دفعة بقيمة ${data.amount} ${data.currency}`,
      userId: user.id,
    },
  });
  await audit({
    userId: user.id,
    action: 'CREATE',
    module: 'payments',
    entityType: 'PAYMENT',
    entityId: payment.id,
    summary: `تسجيل دفعة ${data.amount} ${data.currency}`,
    newValue: { invoiceId: data.invoiceId, amount: data.amount, method: data.method },
  });

  return payment;
}

export async function deletePayment(id: string) {
  const user = await requirePermission('payments', 'delete');
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) throw NotFound('الدفعة غير موجودة');

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id }, data: { deletedAt: new Date() } });
    if (payment.invoiceId) {
      const sum = await tx.payment.aggregate({
        where: { invoiceId: payment.invoiceId, deletedAt: null },
        _sum: { amountMinor: true },
      });
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: payment.invoiceId } });
      const paid = sum._sum.amountMinor ?? 0n;
      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          paidMinor: paid,
          status: invoicePaymentState(invoice.totalMinor, paid, invoice.dueDate),
        },
      });
    }
  });

  await audit({
    userId: user.id,
    action: 'DELETE',
    module: 'payments',
    entityType: 'PAYMENT',
    entityId: id,
    summary: 'حذف دفعة وإعادة احتساب حالة الفاتورة',
  });
}

export async function listPayments(filters: { clientId?: string; page?: number; pageSize?: number }) {
  await requirePermission('payments', 'view');
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, filters.pageSize ?? 25);
  const where: Prisma.PaymentWhereInput = {
    deletedAt: null,
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
  };

  const [rows, total, sum] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { paidAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        client: { select: { id: true, legalName: true, brandName: true } },
        invoice: { select: { id: true, number: true } },
        recordedBy: { select: { name: true } },
      },
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({ where, _sum: { amountMinor: true } }),
  ]);

  return { rows, total, page, pageSize, totalMinor: Number(sum._sum.amountMinor ?? 0n) };
}

/* ── المصروفات ──────────────────────────────────────── */

export const expenseSchema = z.object({
  projectId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  category: z
    .enum(['FREELANCER', 'PRODUCTION', 'TRANSPORTATION', 'TOOLS', 'MEDIA_SPEND', 'PRINTING', 'OTHER'])
    .default('OTHER'),
  description: z.string().trim().min(2, 'الوصف مطلوب'),
  vendor: z.string().trim().optional().nullable(),
  amount: z.coerce.number().positive('المبلغ يجب أن يكون أكبر من صفر'),
  currency: z.string().default('EGP'),
  spentOn: z.string().min(1, 'تاريخ الصرف مطلوب'),
  notes: z.string().trim().optional().nullable(),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;

export async function listExpenses(filters: {
  projectId?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}) {
  await requirePermission('expenses', 'view');
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, filters.pageSize ?? 25);
  const where: Prisma.ExpenseWhereInput = {
    deletedAt: null,
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.category ? { category: filters.category as never } : {}),
  };

  const [rows, total, sum] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: { spentOn: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, legalName: true, brandName: true } },
        recordedBy: { select: { name: true } },
      },
    }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({ where, _sum: { amountMinor: true } }),
  ]);

  return { rows, total, page, pageSize, totalMinor: Number(sum._sum.amountMinor ?? 0n) };
}

export async function createExpense(input: ExpenseInput) {
  const user = await requirePermission('expenses', 'create');
  const data = expenseSchema.parse(input);
  const expense = await prisma.expense.create({
    data: {
      projectId: data.projectId || null,
      clientId: data.clientId || null,
      category: data.category,
      description: data.description,
      vendor: data.vendor || null,
      amountMinor: BigInt(Math.round(data.amount * 100)),
      currency: data.currency,
      spentOn: new Date(data.spentOn),
      notes: data.notes || null,
      recordedById: user.id,
    },
  });
  await audit({
    userId: user.id,
    action: 'CREATE',
    module: 'expenses',
    entityType: 'EXPENSE',
    entityId: expense.id,
    summary: `تسجيل مصروف ${data.amount} ${data.currency} — ${data.description}`,
  });
  return expense;
}

export async function deleteExpense(id: string) {
  const user = await requirePermission('expenses', 'delete');
  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) throw NotFound('المصروف غير موجود');
  await prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({
    userId: user.id,
    action: 'DELETE',
    module: 'expenses',
    entityType: 'EXPENSE',
    entityId: id,
    summary: `حذف مصروف ${expense.description}`,
  });
}

export async function financeFormOptions() {
  await requirePermission('invoices', 'view');
  const [clients, projects, contracts, quotations, taxRates] = await Promise.all([
    prisma.client.findMany({
      where: { deletedAt: null },
      select: { id: true, legalName: true, brandName: true, currency: true },
      orderBy: { legalName: 'asc' },
    }),
    prisma.project.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, clientId: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.contract.findMany({
      where: { deletedAt: null },
      select: { id: true, number: true, clientId: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.quotation.findMany({
      where: { deletedAt: null, status: 'ACCEPTED' },
      select: { id: true, number: true, clientId: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.taxRate.findMany({ where: { isActive: true } }),
  ]);
  return { clients, projects, contracts, quotations, taxRates };
}

/** يُستدعى من الـ Worker: تحديث الفواتير المتأخرة وإشعار المالية. */
export async function refreshOverdueInvoices() {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.finance.overdueGraceDays * 86_400_000);

  const overdue = await prisma.invoice.findMany({
    where: {
      deletedAt: null,
      status: { in: ['SENT', 'PARTIALLY_PAID'] },
      dueDate: { lt: cutoff },
    },
    include: { client: { select: { legalName: true, accountManagerId: true } } },
  });

  if (overdue.length === 0) return 0;

  await prisma.invoice.updateMany({
    where: { id: { in: overdue.map((i) => i.id) } },
    data: { status: 'OVERDUE' },
  });

  const financeUsers = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      role: { permissions: { some: { module: 'invoices', action: 'view' } } },
    },
    select: { id: true },
  });

  for (const invoice of overdue) {
    const targets = new Set<string>(financeUsers.map((u) => u.id));
    if (invoice.client.accountManagerId) targets.add(invoice.client.accountManagerId);
    for (const userId of targets) {
      await notify({
        userId,
        type: 'INVOICE_OVERDUE',
        title: `فاتورة متأخرة: ${invoice.number}`,
        body: `${invoice.client.legalName} — المتبقي ${Number(invoice.totalMinor - invoice.paidMinor) / 100} ${invoice.currency}`,
        entityType: 'INVOICE',
        entityId: invoice.id,
        link: `/invoices/${invoice.id}`,
        dedupeKey: `INVOICE_OVERDUE:${invoice.id}:${userId}`,
      });
    }
  }

  return overdue.length;
}

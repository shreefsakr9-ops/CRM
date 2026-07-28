'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import {
  createInvoice,
  updateInvoice,
  sendInvoice,
  cancelInvoice,
  invoiceFromQuotation,
  recordPayment,
  deletePayment,
  createExpense,
  deleteExpense,
  invoiceSchema,
  paymentSchema,
  expenseSchema,
} from '@/server/services/invoices';
import { AppError } from '@/server/auth/guard';

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? 'بيانات غير صالحة' };
    console.error('[finance action]', e);
    return { ok: false, error: 'حدث خطأ غير متوقع' };
  }
}

export async function createInvoiceAction(raw: unknown): Promise<Result<{ id: string }>> {
  return guard(async () => {
    const invoice = await createInvoice(invoiceSchema.parse(raw));
    revalidatePath('/invoices');
    return { id: invoice.id };
  });
}

export async function updateInvoiceAction(id: string, raw: unknown): Promise<Result> {
  return guard(async () => {
    await updateInvoice(id, invoiceSchema.parse(raw));
    revalidatePath(`/invoices/${id}`);
    return undefined;
  });
}

export async function invoiceFromQuotationAction(quotationId: string): Promise<Result<{ id: string }>> {
  return guard(async () => {
    const invoice = await invoiceFromQuotation(quotationId);
    revalidatePath('/invoices');
    return { id: invoice.id };
  });
}

export async function sendInvoiceAction(id: string): Promise<Result> {
  return guard(async () => {
    await sendInvoice(id);
    revalidatePath(`/invoices/${id}`);
    revalidatePath('/invoices');
    return undefined;
  });
}

export async function cancelInvoiceAction(id: string, reason: string): Promise<Result> {
  return guard(async () => {
    await cancelInvoice(id, reason);
    revalidatePath(`/invoices/${id}`);
    return undefined;
  });
}

export async function recordPaymentAction(raw: unknown): Promise<Result> {
  return guard(async () => {
    await recordPayment(paymentSchema.parse(raw));
    revalidatePath('/invoices');
    revalidatePath('/payments');
    return undefined;
  });
}

export async function deletePaymentAction(id: string): Promise<Result> {
  return guard(async () => {
    await deletePayment(id);
    revalidatePath('/payments');
    revalidatePath('/invoices');
    return undefined;
  });
}

export async function createExpenseAction(raw: unknown): Promise<Result> {
  return guard(async () => {
    await createExpense(expenseSchema.parse(raw));
    revalidatePath('/expenses');
    return undefined;
  });
}

export async function deleteExpenseAction(id: string): Promise<Result> {
  return guard(async () => {
    await deleteExpense(id);
    revalidatePath('/expenses');
    return undefined;
  });
}

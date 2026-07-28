'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import {
  createQuotation,
  updateQuotation,
  submitForApproval,
  approveQuotation,
  markSent,
  decideByClient,
  softDeleteQuotation,
  quotationSchema,
} from '@/server/services/quotations';
import { AppError } from '@/server/auth/guard';

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? 'بيانات غير صالحة' };
    console.error('[quotations action]', e);
    return { ok: false, error: 'حدث خطأ غير متوقع' };
  }
}

export async function createQuotationAction(raw: unknown): Promise<Result<{ id: string }>> {
  return guard(async () => {
    const q = await createQuotation(quotationSchema.parse(raw));
    revalidatePath('/quotations');
    return { id: q.id };
  });
}

export async function updateQuotationAction(id: string, raw: unknown): Promise<Result<{ id: string }>> {
  return guard(async () => {
    const q = await updateQuotation(id, quotationSchema.parse(raw));
    revalidatePath('/quotations');
    revalidatePath(`/quotations/${id}`);
    return { id: q.id };
  });
}

export async function submitApprovalAction(id: string): Promise<Result> {
  return guard(async () => {
    await submitForApproval(id);
    revalidatePath(`/quotations/${id}`);
    return undefined;
  });
}

export async function approveQuotationAction(
  id: string,
  approve: boolean,
  comment?: string,
): Promise<Result> {
  return guard(async () => {
    await approveQuotation(id, approve, comment);
    revalidatePath(`/quotations/${id}`);
    return undefined;
  });
}

export async function markSentAction(id: string): Promise<Result> {
  return guard(async () => {
    await markSent(id);
    revalidatePath(`/quotations/${id}`);
    return undefined;
  });
}

export async function clientDecisionAction(
  id: string,
  accepted: boolean,
  reason?: string,
): Promise<Result<{ clientId: string | null }>> {
  return guard(async () => {
    const result = await decideByClient(id, accepted, reason);
    revalidatePath(`/quotations/${id}`);
    revalidatePath('/clients');
    return result;
  });
}

export async function deleteQuotationAction(id: string): Promise<Result> {
  return guard(async () => {
    await softDeleteQuotation(id);
    revalidatePath('/quotations');
    return undefined;
  });
}

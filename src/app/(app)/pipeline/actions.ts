'use server';

import { revalidatePath } from 'next/cache';
import { moveDealStage, createDeal, updateDeal, softDeleteDeal, dealSchema } from '@/server/services/deals';
import { AppError } from '@/server/auth/guard';
import { ZodError } from 'zod';

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? 'بيانات غير صالحة' };
    console.error('[deals action]', e);
    return { ok: false, error: 'حدث خطأ غير متوقع' };
  }
}

export async function moveDealAction(id: string, raw: unknown): Promise<Result> {
  return guard(async () => {
    await moveDealStage(id, raw);
    revalidatePath('/pipeline');
    revalidatePath('/deals');
    return undefined;
  });
}

export async function createDealAction(raw: unknown): Promise<Result<{ id: string }>> {
  return guard(async () => {
    const deal = await createDeal(dealSchema.parse(raw));
    revalidatePath('/pipeline');
    revalidatePath('/deals');
    return { id: deal.id };
  });
}

export async function updateDealAction(id: string, raw: unknown): Promise<Result> {
  return guard(async () => {
    await updateDeal(id, dealSchema.parse(raw));
    revalidatePath(`/deals/${id}`);
    return undefined;
  });
}

export async function deleteDealAction(id: string): Promise<Result> {
  return guard(async () => {
    await softDeleteDeal(id);
    revalidatePath('/deals');
    return undefined;
  });
}

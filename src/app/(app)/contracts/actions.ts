'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import {
  createContract,
  updateContract,
  renewContract,
  softDeleteContract,
  contractSchema,
} from '@/server/services/contracts';
import { AppError } from '@/server/auth/guard';

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? 'بيانات غير صالحة' };
    console.error('[contracts action]', e);
    return { ok: false, error: 'حدث خطأ غير متوقع' };
  }
}

export async function saveContractAction(raw: unknown, id?: string): Promise<Result<{ id: string }>> {
  return guard(async () => {
    const data = contractSchema.parse(raw);
    const contract = id ? await updateContract(id, data) : await createContract(data);
    revalidatePath('/contracts');
    if (id) revalidatePath(`/contracts/${id}`);
    return { id: contract.id };
  });
}

export async function renewContractAction(id: string, months: number): Promise<Result<{ id: string }>> {
  return guard(async () => {
    const contract = await renewContract(id, months);
    revalidatePath('/contracts');
    return { id: contract.id };
  });
}

export async function deleteContractAction(id: string): Promise<Result> {
  return guard(async () => {
    await softDeleteContract(id);
    revalidatePath('/contracts');
    return undefined;
  });
}

'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { upsertService, toggleService, deleteService, serviceSchema } from '@/server/services/catalog';
import { AppError } from '@/server/auth/guard';

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? 'بيانات غير صالحة' };
    console.error('[services action]', e);
    return { ok: false, error: 'حدث خطأ غير متوقع' };
  }
}

export async function saveServiceAction(raw: unknown, id?: string): Promise<Result> {
  return guard(async () => {
    await upsertService(serviceSchema.parse(raw), id);
    revalidatePath('/services');
    return undefined;
  });
}

export async function toggleServiceAction(id: string, isActive: boolean): Promise<Result> {
  return guard(async () => {
    await toggleService(id, isActive);
    revalidatePath('/services');
    return undefined;
  });
}

export async function deleteServiceAction(id: string): Promise<Result> {
  return guard(async () => {
    await deleteService(id);
    revalidatePath('/services');
    return undefined;
  });
}

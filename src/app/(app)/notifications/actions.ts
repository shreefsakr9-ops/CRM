'use server';

import { revalidatePath } from 'next/cache';
import type { NotificationType } from '@prisma/client';
import { markRead, markAllRead, setPreference } from '@/server/services/notifications';
import { AppError } from '@/server/auth/guard';

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    console.error('[notifications action]', e);
    return { ok: false, error: 'حدث خطأ غير متوقع' };
  }
}

export async function markReadAction(ids: string[]): Promise<Result> {
  return guard(async () => {
    await markRead(ids);
    revalidatePath('/notifications');
    return undefined;
  });
}

export async function markAllReadAction(): Promise<Result<number>> {
  return guard(async () => {
    const count = await markAllRead();
    revalidatePath('/notifications');
    return count;
  });
}

export async function setPreferenceAction(
  type: string,
  values: { inApp: boolean; email: boolean; digest: 'NONE' | 'DAILY' | 'WEEKLY' },
): Promise<Result> {
  return guard(async () => {
    await setPreference(type as NotificationType, values);
    revalidatePath('/notifications');
    return undefined;
  });
}

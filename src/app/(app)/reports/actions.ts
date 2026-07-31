'use server';

import { revalidatePath } from 'next/cache';
import { createAdWalletTransaction } from '@/server/services/ad-wallets';
import { AppError } from '@/server/auth/guard';

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    if (e instanceof Error && e.name === 'ZodError') {
      const issues = JSON.parse(e.message) as { message: string }[];
      return { ok: false, error: issues[0]?.message ?? 'بيانات غير صالحة' };
    }
    console.error('[reports action]', e);
    return { ok: false, error: 'حدث خطأ غير متوقع' };
  }
}

export async function createAdWalletTransactionAction(raw: unknown): Promise<Result> {
  return guard(async () => {
    await createAdWalletTransaction(raw);
    revalidatePath('/reports');
    return undefined;
  });
}

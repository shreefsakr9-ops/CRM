'use server';

import { revalidatePath } from 'next/cache';
import {
  createUser,
  updateUser,
  deactivateUser,
  forcePasswordReset,
  updateRolePermissions,
  userInputSchema,
} from '@/server/services/users';
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
    console.error('[users action]', e);
    return { ok: false, error: 'حدث خطأ غير متوقع' };
  }
}

export async function createUserAction(raw: unknown): Promise<Result<{ temporaryPassword: string }>> {
  return guard(async () => {
    const input = userInputSchema.parse(raw);
    const result = await createUser(input);
    revalidatePath('/users');
    return { temporaryPassword: result.temporaryPassword };
  });
}

export async function updateUserAction(id: string, raw: unknown): Promise<Result> {
  return guard(async () => {
    const input = userInputSchema.parse(raw);
    await updateUser(id, input);
    revalidatePath('/users');
    return undefined;
  });
}

export async function deactivateUserAction(id: string): Promise<Result> {
  return guard(async () => {
    await deactivateUser(id);
    revalidatePath('/users');
    return undefined;
  });
}

export async function forceResetAction(id: string): Promise<Result<{ temporaryPassword: string }>> {
  return guard(async () => {
    const result = await forcePasswordReset(id);
    revalidatePath('/users');
    return result;
  });
}

export async function updateRolePermissionsAction(raw: unknown): Promise<Result> {
  return guard(async () => {
    await updateRolePermissions(raw);
    revalidatePath('/settings/roles');
    return undefined;
  });
}

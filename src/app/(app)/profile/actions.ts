'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { requireUser, AppError } from '@/server/auth/guard';
import { updateOwnProfile } from '@/server/services/users';
import { changeOwnPassword } from '@/server/services/auth-service';
import { audit } from '@/server/services/audit';
import {
  beginTwoFactorSetup,
  confirmTwoFactor,
  disableTwoFactor,
  regenerateRecoveryCodes,
  type TwoFactorSetup,
} from '@/server/services/two-factor';

export type Result = { ok: true } | { ok: false; error: string };

async function guard(fn: () => Promise<void>): Promise<Result> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? 'بيانات غير صالحة' };
    console.error('[profile action]', e);
    return { ok: false, error: 'حدث خطأ غير متوقع' };
  }
}

export async function updateProfileAction(raw: unknown): Promise<Result> {
  return guard(async () => {
    const user = await requireUser();
    const schema = z.object({
      name: z.string().trim().min(3, 'الاسم مطلوب'),
      phone: z.string().trim().optional(),
      locale: z.enum(['ar', 'en']),
      timezone: z.string().min(1),
    });
    await updateOwnProfile(user.id, schema.parse(raw));
    revalidatePath('/profile');
  });
}

export async function changePasswordAction(current: string, next: string, confirm: string): Promise<Result> {
  return guard(async () => {
    const user = await requireUser();
    if (next !== confirm) throw new AppError('كلمتا المرور غير متطابقتين', 400, 'MISMATCH');
    await changeOwnPassword(user.id, current, next);
    revalidatePath('/profile');
  });
}

export async function revokeSessionAction(sessionId: string): Promise<Result> {
  return guard(async () => {
    const user = await requireUser();
    const session = await prisma.session.findFirst({ where: { id: sessionId, userId: user.id } });
    if (!session) throw new AppError('الجلسة غير موجودة', 404, 'NOT_FOUND');
    await prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    await audit({
      userId: user.id,
      action: 'UPDATE',
      module: 'users',
      entityType: 'USER',
      entityId: user.id,
      summary: 'إنهاء جلسة نشطة',
    });
    revalidatePath('/profile');
  });
}

/* ── المصادقة الثنائية ───────────────────────────────── */

export type DataResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function guardData<T>(fn: () => Promise<T>): Promise<DataResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? 'بيانات غير صالحة' };
    console.error('[profile 2fa action]', e);
    return { ok: false, error: 'حدث خطأ غير متوقع' };
  }
}

export async function beginTwoFactorAction(): Promise<DataResult<TwoFactorSetup>> {
  return guardData(() => beginTwoFactorSetup());
}

/**
 * لا يستدعي `revalidatePath` عمدًا.
 *
 * إعادة التحقق تُعيد تشغيل حارس صفحة التفعيل الإجباري، وبما أن التفعيل اكتمل
 * للتوّ يعيد الحارس التوجيه إلى لوحة التحكم — فتختفي رموز الاسترجاع قبل أن
 * يراها المستخدم. وهي تُعرض مرة واحدة فقط ولا يمكن استعادتها، فيبقى صاحب
 * الحساب بلا وسيلة استرجاع إن فقد هاتفه.
 *
 * الواجهة تستدعي `router.refresh()` بنفسها بعد عرض الرموز — وهو يحافظ على حالة
 * مكوّنات العميل.
 */
export async function confirmTwoFactorAction(code: string): Promise<DataResult<string[]>> {
  return guardData(async () => {
    const { recoveryCodes } = await confirmTwoFactor(code);
    return recoveryCodes;
  });
}

export async function disableTwoFactorAction(password: string): Promise<Result> {
  return guard(async () => {
    await disableTwoFactor(password);
    revalidatePath('/profile');
  });
}

export async function regenerateRecoveryCodesAction(password: string): Promise<DataResult<string[]>> {
  return guardData(async () => {
    const codes = await regenerateRecoveryCodes(password);
    revalidatePath('/profile');
    return codes;
  });
}

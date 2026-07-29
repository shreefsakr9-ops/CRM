'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import {
  login,
  completeTwoFactorLogin,
  requestPasswordReset,
  resetPassword,
} from '@/server/services/auth-service';
import { AppError } from '@/server/auth/guard';

const loginSchema = z.object({
  email: z.string().trim().email('بريد إلكتروني غير صالح'),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});

export type ActionState =
  | { error?: string; success?: string; twoFactorRequired?: boolean }
  | null;

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة' };
  }

  const result = await login(parsed.data.email, parsed.data.password);
  if (!result.ok) return { error: result.error };
  // كلمة المرور صحيحة لكن الحساب محمي بعامل ثانٍ — لا جلسة بعد.
  if ('twoFactorRequired' in result) return { twoFactorRequired: true };

  redirect(result.mustResetPassword ? '/reset-password?forced=1' : '/dashboard');
}

const twoFactorSchema = z.object({
  code: z.string().trim().min(6, 'أدخل الرمز المكوّن من ٦ أرقام أو رمز استرجاع'),
});

export async function twoFactorAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = twoFactorSchema.safeParse({ code: formData.get('code') });
  if (!parsed.success) {
    return { twoFactorRequired: true, error: parsed.error.issues[0]?.message ?? 'رمز غير صالح' };
  }

  const result = await completeTwoFactorLogin(parsed.data.code);
  if (!result.ok) return { twoFactorRequired: true, error: result.error };
  if ('twoFactorRequired' in result) return { twoFactorRequired: true };

  redirect(result.mustResetPassword ? '/reset-password?forced=1' : '/dashboard');
}

const forgotSchema = z.object({ email: z.string().trim().email('بريد إلكتروني غير صالح') });

export async function forgotPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = forgotSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة' };

  const { token } = await requestPasswordReset(parsed.data.email);
  if (token && process.env.NODE_ENV !== 'production') {
    // في بيئة التطوير فقط: يُطبع الرابط في سجل السيرفر لتسهيل الاختبار.
    console.info(`[dev] reset link: /reset-password?token=${token}`);
  }
  return { success: 'إذا كان البريد مسجلًا لدينا فستصلك رسالة إعادة التعيين' };
}

const resetSchema = z
  .object({
    token: z.string().min(10, 'رمز غير صالح'),
    password: z.string().min(10, 'كلمة المرور يجب ألا تقل عن ١٠ أحرف'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirm'],
  });

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetSchema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة' };

  try {
    await resetPassword(parsed.data.token, parsed.data.password);
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
  redirect('/login?reset=1');
}

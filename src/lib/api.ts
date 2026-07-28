import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError } from '@/server/auth/guard';

/**
 * معالج موحّد لأخطاء الـ API.
 * في الإنتاج لا يُعرض Stack Trace ولا تفاصيل داخلية للمستخدم.
 */
export function apiError(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: error.issues[0]?.message ?? 'بيانات غير صالحة',
        code: 'VALIDATION_ERROR',
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 422 },
    );
  }
  console.error('[api] unhandled error', error);
  return NextResponse.json(
    { error: 'حدث خطأ غير متوقع', code: 'INTERNAL_ERROR' },
    { status: 500 },
  );
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data as object, init);
}

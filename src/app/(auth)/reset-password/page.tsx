'use client';

import { use } from 'react';
import { useActionState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui/primitives';
import { resetPasswordAction, forcedPasswordResetAction, type ActionState } from '../login/actions';

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; forced?: string }>;
}) {
  const { token = '', forced } = use(searchParams);
  const isForced = forced === '1';
  // تغيير إجباري بعد تسجيل الدخول يعتمد على الجلسة الحالية (بلا رمز إيميل)؛
  // استعادة كلمة المرور عبر رابط الإيميل تتطلب الرمز كما هو.
  const [state, action, pending] = useActionState<ActionState, FormData>(
    isForced ? forcedPasswordResetAction : resetPasswordAction,
    null,
  );

  return (
    <div>
      <h2 className="text-lg font-semibold text-ink">تعيين كلمة مرور جديدة</h2>
      <p className="mt-1 text-xs text-ink-faint">
        {isForced
          ? 'يجب تغيير كلمة المرور قبل استخدام النظام.'
          : 'اختر كلمة مرور قوية لا تقل عن ١٠ أحرف وتحتوي على حروف كبيرة وصغيرة وأرقام.'}
      </p>

      <form action={action} className="mt-5 space-y-4">
        {!isForced && <input type="hidden" name="token" value={token} />}

        {state?.error && (
          <div className="rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
            {state.error}
          </div>
        )}
        {!isForced && !token && (
          <div className="rounded-md border border-warn/25 bg-warn/10 px-3 py-2 text-xs text-warn">
            الرابط ناقص أو غير صالح. اطلب رابطًا جديدًا من صفحة استعادة كلمة المرور.
          </div>
        )}

        <Field label="كلمة المرور الجديدة" htmlFor="password">
          <Input id="password" name="password" type="password" dir="ltr" required minLength={10} />
        </Field>
        <Field label="تأكيد كلمة المرور" htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" dir="ltr" required minLength={10} />
        </Field>

        <Button
          type="submit"
          loading={pending}
          disabled={!isForced && !token}
          className="w-full justify-center"
          size="lg"
        >
          {!pending && <KeyRound className="h-4 w-4" />}
          حفظ كلمة المرور
        </Button>
      </form>
    </div>
  );
}

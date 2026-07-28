'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { ArrowRight, Mail } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui/primitives';
import { forgotPasswordAction, type ActionState } from '../login/actions';

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<ActionState, FormData>(forgotPasswordAction, null);

  return (
    <div>
      <h2 className="text-lg font-semibold text-ink">استعادة كلمة المرور</h2>
      <p className="mt-1 text-xs text-ink-faint">
        أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين. الرابط صالح لمدة ساعة واحدة فقط.
      </p>

      <form action={action} className="mt-5 space-y-4">
        {state?.error && (
          <div className="rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
            {state.error}
          </div>
        )}
        {state?.success && (
          <div className="rounded-md border border-ok/25 bg-ok/10 px-3 py-2 text-xs text-ok">
            {state.success}
          </div>
        )}

        <Field label="البريد الإلكتروني" htmlFor="email">
          <Input id="email" name="email" type="email" dir="ltr" required autoFocus />
        </Field>

        <Button type="submit" loading={pending} className="w-full justify-center" size="lg">
          {!pending && <Mail className="h-4 w-4" />}
          إرسال رابط الاستعادة
        </Button>
      </form>

      <div className="mt-4 text-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
        >
          <ArrowRight className="h-3.5 w-3.5 flip-rtl" />
          العودة لتسجيل الدخول
        </Link>
      </div>
    </div>
  );
}

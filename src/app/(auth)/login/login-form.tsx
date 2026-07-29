'use client';

import { useActionState, useState } from 'react';
import { Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui/primitives';
import { loginAction, twoFactorAction, type ActionState } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(loginAction, null);
  const [show, setShow] = useState(false);

  // الخطوة الثانية تُعرض بدل نموذج كلمة المرور — لا يعود المستخدم إليه إلا بإعادة التحميل.
  if (state?.twoFactorRequired) return <TwoFactorForm initialError={state.error} />;

  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <div
          role="alert"
          className="rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {state.error}
        </div>
      )}

      <Field label="البريد الإلكتروني" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          dir="ltr"
          placeholder="name@bluepoint.local"
          required
          autoFocus
        />
      </Field>

      <Field label="كلمة المرور" htmlFor="password">
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            dir="ltr"
            required
            className="pe-10"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-ink-faint hover:text-ink"
            aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>

      <Button type="submit" loading={pending} className="w-full justify-center" size="lg">
        {!pending && <LogIn className="h-4 w-4" />}
        دخول
      </Button>
    </form>
  );
}

function TwoFactorForm({ initialError }: { initialError?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(twoFactorAction, null);
  const error = state?.error ?? initialError;

  return (
    <form action={action} className="space-y-4">
      <div className="rounded-md border border-brand/25 bg-brand/10 px-3 py-2.5 text-xs leading-6 text-ink-muted">
        <p className="flex items-center gap-1.5 font-semibold text-ink">
          <ShieldCheck className="h-3.5 w-3.5 text-brand" />
          التحقق بخطوتين
        </p>
        <p className="mt-1">
          افتح تطبيق المصادقة وأدخل الرمز المكوّن من ٦ أرقام. إن فقدت جهازك فاستخدم أحد رموز
          الاسترجاع.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {error}
        </div>
      )}

      <Field label="رمز التحقق" htmlFor="code">
        <Input
          id="code"
          name="code"
          inputMode="text"
          autoComplete="one-time-code"
          dir="ltr"
          placeholder="123456"
          required
          autoFocus
        />
      </Field>

      <Button type="submit" loading={pending} className="w-full justify-center" size="lg">
        {!pending && <ShieldCheck className="h-4 w-4" />}
        تأكيد
      </Button>

      <p className="text-center text-[11px] text-ink-faint">
        مهلة التحقق خمس دقائق. بعدها أعد تسجيل الدخول من البداية.
      </p>
    </form>
  );
}

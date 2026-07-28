'use client';

import { useActionState, useState } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui/primitives';
import { loginAction, type ActionState } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(loginAction, null);
  const [show, setShow] = useState(false);

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

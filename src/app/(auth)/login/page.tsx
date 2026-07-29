import Link from 'next/link';
import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'تسجيل الدخول' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const { reset } = await searchParams;
  return (
    <div>
      <h2 className="text-lg font-semibold text-ink">أهلًا بك مجددًا</h2>
      <p className="mt-1 text-xs text-ink-faint">سجّل الدخول للمتابعة إلى نظام Blue Point</p>

      {reset && (
        <div className="mt-4 rounded-md border border-ok/25 bg-ok/10 px-3 py-2 text-xs text-ok">
          تم تغيير كلمة المرور بنجاح. يمكنك تسجيل الدخول الآن.
        </div>
      )}

      <div className="mt-5">
        <LoginForm />
      </div>

      <div className="mt-4 text-center">
        <Link href="/forgot-password" className="text-xs text-brand hover:underline">
          نسيت كلمة المرور؟
        </Link>
      </div>
    </div>
  );
}

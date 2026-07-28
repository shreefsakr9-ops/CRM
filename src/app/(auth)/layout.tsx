import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/session';
import { BrandMark } from '@/components/brand';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (user && !user.mustResetPassword) redirect('/dashboard');

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      {/* خلفية متدرجة خفيفة بهوية Blue Point */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(60rem 40rem at 80% -10%, rgb(var(--bp-blue) / 0.22), transparent 60%),' +
            'radial-gradient(45rem 30rem at 10% 110%, rgb(var(--bp-cyan) / 0.14), transparent 60%)',
        }}
      />
      <div className="relative w-full max-w-md">
        <div className="mb-7 flex flex-col items-center text-center">
          <BrandMark size={56} />
          <h1 className="mt-3 text-xl font-bold tracking-tight">
            <span className="bp-gradient-text">Blue Point OS</span>
          </h1>
          <p className="mt-1 text-xs text-ink-faint">نظام إدارة الشركة الداخلي</p>
        </div>
        <div className="bp-card bp-glass p-6 sm:p-7">{children}</div>
        <p className="mt-5 text-center text-[11px] text-ink-faint">
          © {new Date().getFullYear()} Blue Point Marketing Agency — للاستخدام الداخلي فقط
        </p>
      </div>
    </div>
  );
}

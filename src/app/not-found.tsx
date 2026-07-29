import Link from 'next/link';

/**
 * «غير موجود» على مستوى الجذر — لمسارات خارج التطبيق كليًا.
 * مستقلة عن قوقعة التطبيق لأن الزائر هنا قد يكون غير مسجّل الدخول أصلًا.
 */
export default function RootNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center">
      <p className="text-2xl font-extrabold">
        <span className="text-ink">Blue</span>
        <span className="text-brand"> Point</span>
      </p>
      <h1 className="mt-6 text-lg font-extrabold text-ink">الصفحة غير موجودة</h1>
      <p className="mt-2 max-w-sm text-sm leading-7 text-ink-muted">
        الرابط الذي فتحته غير صحيح أو لم يعد موجودًا.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"
      >
        العودة للنظام
      </Link>
    </main>
  );
}

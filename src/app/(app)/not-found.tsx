import Link from 'next/link';
import { SearchX, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/primitives';

/**
 * صفحة «غير موجود» داخل التطبيق — تظهر أيضًا للسجلات خارج نطاق المستخدم.
 *
 * الصياغة مقصودة: لا تفرّق بين «محذوف» و«ليس من حقك». التفريق بينهما يؤكد وجود
 * السجل لمن لا يحق له معرفته، وهو ما تتجنبه سياسة «٤٠٤ لا ٤٠٣».
 */
export default function AppNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-navy-800 text-ink-faint">
        <SearchX className="h-7 w-7" />
      </div>

      <h1 className="text-lg font-extrabold text-ink">هذا السجل غير متاح</h1>
      <p className="mt-2 max-w-md text-sm leading-7 text-ink-muted">
        الصفحة أو السجل الذي تحاول فتحه غير موجود، أو خارج نطاق البيانات المتاحة لحسابك. تحقق من
        الرابط أو ارجع للقائمة وابحث من هناك.
      </p>

      <div className="mt-6">
        <Link href="/dashboard">
          <Button type="button" variant="outline">
            <LayoutDashboard className="h-4 w-4" />
            العودة للوحة التحكم
          </Button>
        </Link>
      </div>
    </div>
  );
}

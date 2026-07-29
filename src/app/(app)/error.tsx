'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/primitives';

/**
 * حدّ الأخطاء داخل التطبيق.
 *
 * بدونه يعرض Next صفحته الافتراضية: إنجليزية، بلا هوية، وبلا طريق للعودة —
 * وهو ما يراه المستخدم فعلًا عند أي خطأ غير متوقع أو عند رفض صلاحية.
 *
 * ما لا نعرضه عمدًا: نص الخطأ الأصلي ولا أثر التنفيذ. في الإنتاج يستبدل Next
 * الرسالة برسالة عامة ويبقي `digest` فقط — نعرض هذا المعرّف ليقارنه المستخدم
 * بسجل الخادم دون أن يكشف شيئًا عن الداخل.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // يصل إلى سجل المتصفح فقط — التفاصيل الحقيقية مسجَّلة على الخادم.
    console.error('[app] خطأ غير متوقع', error.digest ?? '');
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertTriangle className="h-7 w-7" />
      </div>

      <h1 className="text-lg font-extrabold text-ink">تعذّر عرض هذه الصفحة</h1>
      <p className="mt-2 max-w-md text-sm leading-7 text-ink-muted">
        قد يكون السبب أنك لا تملك صلاحية على هذا القسم، أو أن خطأً غير متوقع وقع أثناء تحميل
        البيانات. لم يتغيّر شيء في بياناتك.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button type="button" onClick={reset}>
          <RotateCcw className="h-4 w-4" />
          إعادة المحاولة
        </Button>
        <Link href="/dashboard">
          <Button type="button" variant="outline">
            <LayoutDashboard className="h-4 w-4" />
            العودة للوحة التحكم
          </Button>
        </Link>
      </div>

      {error.digest && (
        <p className="num mt-6 text-[11px] text-ink-faint" dir="ltr">
          reference: {error.digest}
        </p>
      )}
    </div>
  );
}

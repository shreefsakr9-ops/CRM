'use client';

import * as React from 'react';
import { formatDate, formatRelative } from '@/lib/format';

/**
 * وقت نسبي («منذ ساعتين»، «خلال ٣ أيام») صالح للعرض داخل مكوّنات العميل.
 *
 * المشكلة التي يحلّها: `formatRelative` يقرأ الوقت الحالي لحظة التنفيذ. الخادم
 * يبنيها في لحظة، والمتصفح يرطّب (hydrate) بعدها بأجزاء من الثانية، فينتج نصّان
 * مختلفان عند حدود الوحدات («منذ ٥٩ ثانية» مقابل «منذ دقيقة»). React يعتبر ذلك
 * عدم تطابق ترطيب فيرمي الشجرة المُرسَلة من الخادم ويعيد بناءها في المتصفح —
 * وهو خطأ ظهر فعلًا في console على صفحة العملاء المحتملين.
 *
 * `suppressHydrationWarning` هو الحل الذي يوصي به React لهذه الحالة بالذات:
 * محتوًى يختلف بطبيعته بين الخادم والعميل. النص المعروض يبقى نصّ الخادم (فرقه
 * أجزاء من الثانية) وتبقى الشجرة كما هي.
 *
 * إضافةً لذلك يحمل العنصر التاريخ المطلق في `title`، فالنسبي وحده لا يكفي حين
 * يحتاج المستخدم اليوم والتاريخ بالضبط.
 */
export function RelativeTime({
  value,
  className,
  fallback = '—',
}: {
  value: Date | string | null | undefined;
  className?: string;
  fallback?: string;
}) {
  if (!value) return <span className={className}>{fallback}</span>;
  return (
    <span className={className} title={formatDate(value, 'ar', undefined, true)} suppressHydrationWarning>
      {formatRelative(value)}
    </span>
  );
}

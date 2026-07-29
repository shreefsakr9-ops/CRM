import 'server-only';
import { notFound } from 'next/navigation';
import { AppError } from './guard';

/**
 * يحوّل خطأ «غير موجود» القادم من طبقة الخدمة إلى ٤٠٤ حقيقية على مستوى HTTP.
 *
 * لماذا هذا لازم: الخدمات ترمي `AppError(404)` عمدًا للسجلات خارج نطاق
 * المستخدم — «٤٠٤ لا ٤٠٣» حتى لا يتأكد أن السجل موجود أصلًا. لكن أي خطأ يُرمى
 * داخل Server Component يصل إلى حدّ الأخطاء ويُقدَّم بحالة ٥٠٠، فتضيع الدلالة:
 * سجل غير موجود يظهر في المراقبة كعطل في الخادم، والمتصفح ومحركات الفهرسة
 * تتعامل مع الصفحة على أنها خطأ مؤقت لا صفحة غير موجودة.
 *
 * `notFound()` من Next هو ما يعطي ٤٠٤ فعلية مع صفحة `not-found.tsx`.
 *
 * ملاحظة: الأخطاء الأخرى (٤٠٣ مثلًا) تُترك كما هي لتصل إلى `error.tsx` — لا
 * نحوّلها إلى ٤٠٤ حتى لا نخلط «ممنوع» بـ«غير موجود» في وحدة يحق للمستخدم
 * معرفة أنها موجودة أصلًا.
 */
export async function findOr404<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
}

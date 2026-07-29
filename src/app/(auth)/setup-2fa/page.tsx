import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/server/auth/session';
import { mustEnrollTwoFactor } from '@/server/services/two-factor';
import { SetupTwoFactorForm } from './setup-form';

export const metadata: Metadata = { title: 'تفعيل المصادقة الثنائية' };
export const dynamic = 'force-dynamic';

/**
 * تفعيل إجباري للمصادقة الثنائية للأدوار التي تشترطها الإعدادات.
 * الصفحة خارج مجموعة `(app)` حتى لا يعيد حارس التخطيط توجيهها إلى نفسها.
 */
export default async function SetupTwoFactorPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  // من فعّلها بالفعل — أو دوره غير مُلزَم — لا شأن له بهذه الصفحة.
  if (!(await mustEnrollTwoFactor(user))) redirect('/dashboard');

  return <SetupTwoFactorForm roleLabel={user.roleKey} />;
}

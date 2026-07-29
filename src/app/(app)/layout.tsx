import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/session';
import { can } from '@/server/auth/guard';
import { prisma } from '@/server/db';
import { mustEnrollTwoFactor } from '@/server/services/two-factor';
import { AppShell } from '@/components/shell/app-shell';
import { NAV } from '@/components/shell/nav-config';
import { ROLE_LABELS, type RoleKey } from '@/server/auth/permissions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.mustResetPassword) redirect('/reset-password?forced=1');
  // الأدوار المُلزَمة بالمصادقة الثنائية لا تصل إلى أي بيانات قبل تفعيلها.
  // صفحة التفعيل خارج هذه المجموعة عمدًا حتى لا تدور إعادة التوجيه على نفسها.
  if (await mustEnrollTwoFactor(user)) redirect('/setup-2fa');

  // إخفاء عناصر التنقل غير المصرح بها (تجميلي — الحماية الفعلية على السيرفر في كل Service)
  const sections = NAV.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.module || can(user, i.module, 'view')),
  })).filter((s) => s.items.length > 0);

  const [notifications, myTasks, approvals] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.task.count({
      where: {
        deletedAt: null,
        status: { notIn: ['COMPLETED', 'CANCELLED', 'APPROVED'] },
        assignees: { some: { userId: user.id } },
      },
    }),
    can(user, 'approvals', 'approve')
      ? prisma.approval.count({ where: { approverId: user.id, status: 'PENDING' } })
      : Promise.resolve(0),
  ]);

  const quickCreate = [
    can(user, 'leads', 'create') && { href: '/leads/new', label: 'عميل محتمل جديد' },
    can(user, 'clients', 'create') && { href: '/clients/new', label: 'عميل جديد' },
    can(user, 'quotations', 'create') && { href: '/quotations/new', label: 'عرض سعر جديد' },
    can(user, 'projects', 'create') && { href: '/projects/new', label: 'مشروع جديد' },
    can(user, 'tasks', 'create') && { href: '/tasks/new', label: 'مهمة جديدة' },
    can(user, 'invoices', 'create') && { href: '/invoices/new', label: 'فاتورة جديدة' },
  ].filter(Boolean) as { href: string; label: string }[];

  return (
    <AppShell
      sections={sections}
      counts={{ notifications, myTasks, approvals }}
      user={{
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        roleLabel: ROLE_LABELS[user.roleKey as RoleKey]?.ar ?? user.roleKey,
      }}
      quickCreate={quickCreate}
    >
      {children}
    </AppShell>
  );
}

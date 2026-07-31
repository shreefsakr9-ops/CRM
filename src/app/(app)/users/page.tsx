import type { Metadata } from 'next';
import { requirePermission, can } from '@/server/auth/guard';
import { listUsers } from '@/server/services/users';
import { prisma } from '@/server/db';
import { PageHeader } from '@/components/page-header';
import { UsersClient } from './users-client';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'المستخدمون' };
export const dynamic = 'force-dynamic';

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; roleId?: string; active?: string }>;
}) {
  const params = await searchParams;
  const user = await requirePermission('users', 'view');
  const [users, roles, departments] = await Promise.all([
    listUsers(params),
    prisma.role.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, key: true, nameAr: true } }),
    prisma.department.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, nameAr: true },
    }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="المستخدمون والصلاحيات"
        description="إدارة حسابات الفريق وأدوارهم وحالة تفعيلهم"
        breadcrumbs={[{ label: 'الإدارة' }, { label: 'المستخدمون' }]}
      />
      <UsersClient
        users={plain(users) as never}
        roles={roles}
        departments={departments}
        canManage={can(user, 'users', 'manage')}
        canManagePermissions={can(user, 'roles', 'manage')}
        currentUserId={user.id}
      />
    </div>
  );
}

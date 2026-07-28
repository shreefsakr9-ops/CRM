import type { Metadata } from 'next';
import { requirePermission } from '@/server/auth/guard';
import { listRolesWithPermissions } from '@/server/services/users';
import { PageHeader } from '@/components/page-header';
import { RolesMatrix } from './roles-matrix';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'مصفوفة الصلاحيات' };
export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  await requirePermission('roles', 'view');
  const roles = await listRolesWithPermissions();

  return (
    <div className="space-y-5">
      <PageHeader
        title="مصفوفة الصلاحيات"
        description="الصلاحيات تُطبَّق على السيرفر في كل عملية — إخفاء الزر من الواجهة ليس حماية"
        breadcrumbs={[
          { label: 'الإدارة' },
          { label: 'الإعدادات', href: '/settings' },
          { label: 'الصلاحيات' },
        ]}
      />
      <RolesMatrix roles={plain(roles) as never} />
    </div>
  );
}

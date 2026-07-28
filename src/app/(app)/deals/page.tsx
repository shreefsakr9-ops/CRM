import type { Metadata } from 'next';
import { requirePermission, can } from '@/server/auth/guard';
import { listDeals, dealFormOptions } from '@/server/services/deals';
import { PageHeader } from '@/components/page-header';
import { DealsClient } from './deals-client';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'الصفقات' };
export const dynamic = 'force-dynamic';

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requirePermission('deals', 'view');
  const [{ rows, total, page, pageSize }, options] = await Promise.all([
    listDeals({
      q: sp.q,
      stageId: sp.stageId,
      status: sp.status,
      ownerId: sp.ownerId,
      sort: sp.sort,
      dir: sp.dir as 'asc' | 'desc' | undefined,
      page: sp.page ? Number(sp.page) : 1,
    }),
    dealFormOptions(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="الصفقات"
        description="كل الصفقات مع قيمتها واحتمالية إغلاقها والمسؤول عنها"
        breadcrumbs={[{ label: 'المبيعات' }, { label: 'الصفقات' }]}
      />
      <DealsClient
        rows={plain(rows) as never}
        total={total}
        page={page}
        pageSize={pageSize}
        options={plain(options) as never}
        perms={{
          canCreate: can(user, 'deals', 'create'),
          canEdit: can(user, 'deals', 'edit'),
          canDelete: can(user, 'deals', 'delete'),
          canExport: can(user, 'deals', 'export'),
          canAssign: can(user, 'deals', 'assign'),
          canViewMoney: can(user, 'deals', 'view_financial'),
        }}
      />
    </div>
  );
}

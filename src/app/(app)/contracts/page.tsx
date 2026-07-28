import type { Metadata } from 'next';
import { requirePermission, can } from '@/server/auth/guard';
import { listContracts, contractFormOptions } from '@/server/services/contracts';
import { PageHeader } from '@/components/page-header';
import { ContractsClient } from './contracts-client';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'العقود' };
export const dynamic = 'force-dynamic';

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requirePermission('contracts', 'view');
  const [{ rows, total, page, pageSize }, options] = await Promise.all([
    listContracts({
      q: sp.q,
      status: sp.status,
      clientId: sp.clientId,
      filter: sp.filter as 'renewing' | undefined,
      page: sp.page ? Number(sp.page) : 1,
    }),
    contractFormOptions(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="العقود"
        description="العقود السارية وتواريخ التجديد — التنبيهات تُرسل تلقائيًا قبل موعد التجديد"
        breadcrumbs={[{ label: 'العملاء' }, { label: 'العقود' }]}
      />
      <ContractsClient
        rows={plain(rows) as never}
        total={total}
        page={page}
        pageSize={pageSize}
        options={plain(options) as never}
        defaults={{ quotationId: sp.quotationId, clientId: sp.clientId }}
        perms={{
          canCreate: can(user, 'contracts', 'create'),
          canEdit: can(user, 'contracts', 'edit'),
          canDelete: can(user, 'contracts', 'delete'),
          canExport: can(user, 'contracts', 'export'),
          canViewMoney: can(user, 'contracts', 'view_financial'),
        }}
      />
    </div>
  );
}

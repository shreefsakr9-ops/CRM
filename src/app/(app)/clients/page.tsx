import type { Metadata } from 'next';
import { requirePermission, can } from '@/server/auth/guard';
import { listClients, clientFormOptions } from '@/server/services/clients';
import { PageHeader } from '@/components/page-header';
import { ClientsClient } from './clients-client';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'العملاء' };
export const dynamic = 'force-dynamic';

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requirePermission('clients', 'view');
  const [{ rows, total, page, pageSize }, options] = await Promise.all([
    listClients({
      q: sp.q,
      status: sp.status,
      accountManagerId: sp.accountManagerId,
      sort: sp.sort,
      dir: sp.dir as 'asc' | 'desc' | undefined,
      page: sp.page ? Number(sp.page) : 1,
    }),
    clientFormOptions(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="العملاء"
        description="ملفات العملاء الحاليين مع مديري الحسابات وحالة التجديد"
        breadcrumbs={[{ label: 'العملاء' }]}
      />
      <ClientsClient
        rows={plain(rows) as never}
        total={total}
        page={page}
        pageSize={pageSize}
        options={plain(options) as never}
        perms={{
          canCreate: can(user, 'clients', 'create'),
          canEdit: can(user, 'clients', 'edit'),
          canDelete: can(user, 'clients', 'delete'),
          canExport: can(user, 'clients', 'export'),
        }}
      />
    </div>
  );
}

import Link from 'next/link';
import type { Metadata } from 'next';
import { Plus } from 'lucide-react';
import { requirePermission, can } from '@/server/auth/guard';
import { listLeads, leadFormOptions } from '@/server/services/leads';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/primitives';
import { plain } from '@/lib/utils';
import { LeadsClient } from './leads-client';

export const metadata: Metadata = { title: 'العملاء المحتملون' };
export const dynamic = 'force-dynamic';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requirePermission('leads', 'view');

  const [{ rows, total, page, pageSize }, options] = await Promise.all([
    listLeads({
      q: sp.q,
      status: sp.status,
      stageId: sp.stageId,
      sourceId: sp.sourceId,
      assignedToId: sp.assignedToId,
      priority: sp.priority,
      filter: sp.filter as never,
      sort: sp.sort,
      dir: sp.dir as 'asc' | 'desc' | undefined,
      page: sp.page ? Number(sp.page) : 1,
    }),
    leadFormOptions(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="العملاء المحتملون"
        description="كل الـ Leads ضمن نطاقك مع حالة المتابعة والمصدر والقيمة المتوقعة"
        breadcrumbs={[{ label: 'المبيعات' }, { label: 'العملاء المحتملون' }]}
        actions={
          can(user, 'leads', 'create') && (
            <Link href="/leads/new">
              <Button>
                <Plus className="h-4 w-4" />
                عميل محتمل جديد
              </Button>
            </Link>
          )
        }
      />

      <LeadsClient
        rows={plain(rows) as never}
        total={total}
        page={page}
        pageSize={pageSize}
        options={plain(options) as never}
        perms={{
          canAssign: can(user, 'leads', 'assign'),
          canDelete: can(user, 'leads', 'delete'),
          canRestore: can(user, 'leads', 'restore'),
          canExport: can(user, 'leads', 'export'),
          canCreate: can(user, 'leads', 'create'),
          canViewMoney: can(user, 'leads', 'view_financial') || can(user, 'deals', 'view_financial'),
        }}
      />
    </div>
  );
}

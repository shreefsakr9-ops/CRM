import Link from 'next/link';
import type { Metadata } from 'next';
import { Plus } from 'lucide-react';
import { requirePermission, can } from '@/server/auth/guard';
import { listQuotations } from '@/server/services/quotations';
import { prisma } from '@/server/db';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/primitives';
import { QuotationsClient } from './quotations-client';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'عروض الأسعار' };
export const dynamic = 'force-dynamic';

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requirePermission('quotations', 'view');
  const [{ rows, total, page, pageSize }, clients] = await Promise.all([
    listQuotations({
      q: sp.q,
      status: sp.status,
      clientId: sp.clientId,
      page: sp.page ? Number(sp.page) : 1,
    }),
    prisma.client.findMany({
      where: { deletedAt: null },
      select: { id: true, legalName: true, brandName: true },
      orderBy: { legalName: 'asc' },
    }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="عروض الأسعار"
        description="كل العروض مع حالتها ونسخها — التعديل بعد الإرسال ينشئ إصدارًا جديدًا دون المساس بالسابق"
        breadcrumbs={[{ label: 'المبيعات' }, { label: 'عروض الأسعار' }]}
        actions={
          can(user, 'quotations', 'create') && (
            <Link href="/quotations/new">
              <Button>
                <Plus className="h-4 w-4" />
                عرض سعر جديد
              </Button>
            </Link>
          )
        }
      />
      <QuotationsClient
        rows={plain(rows) as never}
        total={total}
        page={page}
        pageSize={pageSize}
        clients={clients}
        perms={{
          canDelete: can(user, 'quotations', 'delete'),
          canExport: can(user, 'quotations', 'export'),
          canViewMoney: can(user, 'quotations', 'view_financial'),
        }}
      />
    </div>
  );
}

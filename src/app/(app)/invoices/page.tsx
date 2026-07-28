import Link from 'next/link';
import type { Metadata } from 'next';
import { Plus } from 'lucide-react';
import { requirePermission, can } from '@/server/auth/guard';
import { listInvoices, financeFormOptions } from '@/server/services/invoices';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/primitives';
import { KpiCard, KpiGrid } from '@/components/ui/kpi';
import { formatMoney } from '@/lib/format';
import { InvoicesClient } from './invoices-client';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'الفواتير' };
export const dynamic = 'force-dynamic';

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requirePermission('invoices', 'view');
  const [{ rows, total, page, pageSize, summary }, options] = await Promise.all([
    listInvoices({
      q: sp.q,
      status: sp.status,
      clientId: sp.clientId,
      page: sp.page ? Number(sp.page) : 1,
    }),
    financeFormOptions(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="الفواتير"
        description="حالة كل فاتورة محسوبة من المدفوعات المسجلة عليها"
        breadcrumbs={[{ label: 'المالية' }, { label: 'الفواتير' }]}
        actions={
          can(user, 'invoices', 'create') && (
            <Link href="/invoices/new">
              <Button>
                <Plus className="h-4 w-4" />
                فاتورة جديدة
              </Button>
            </Link>
          )
        }
      />

      <KpiGrid className="lg:grid-cols-3">
        <KpiCard label="إجمالي المفوتر" value={formatMoney(summary.invoicedMinor)} icon="ReceiptText" />
        <KpiCard label="المحصَّل" value={formatMoney(summary.collectedMinor)} icon="Wallet" tone="ok" />
        <KpiCard
          label="المتبقي"
          value={formatMoney(summary.outstandingMinor)}
          icon="AlertCircle"
          tone={summary.outstandingMinor > 0 ? 'warn' : 'neutral'}
        />
      </KpiGrid>

      <InvoicesClient
        rows={plain(rows) as never}
        total={total}
        page={page}
        pageSize={pageSize}
        options={plain(options) as never}
        perms={{
          canEdit: can(user, 'invoices', 'edit'),
          canExport: can(user, 'invoices', 'export'),
          canRecordPayment: can(user, 'payments', 'create'),
        }}
      />
    </div>
  );
}

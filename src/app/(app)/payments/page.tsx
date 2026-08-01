import type { Metadata } from 'next';
import { requirePermission, can } from '@/server/auth/guard';
import { listPayments, financeFormOptions } from '@/server/services/invoices';
import { PageHeader } from '@/components/page-header';
import { KpiCard, KpiGrid } from '@/components/ui/kpi';
import { formatMoney } from '@/lib/format';
import { PaymentsClient } from './payments-client';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'المدفوعات' };
export const dynamic = 'force-dynamic';

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requirePermission('payments', 'view');
  const [{ rows, total, page, pageSize, totalMinor }, options] = await Promise.all([
    listPayments({ clientId: sp.clientId, from: sp.from, to: sp.to, page: sp.page ? Number(sp.page) : 1 }),
    financeFormOptions(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="المدفوعات"
        description="كل الدفعات المسجلة مع مرجعها وطريقة السداد ومن سجّلها"
        breadcrumbs={[{ label: 'المالية' }, { label: 'المدفوعات' }]}
      />

      <KpiGrid className="lg:grid-cols-2">
        <KpiCard label="إجمالي المحصَّل (حسب الفلتر)" value={formatMoney(totalMinor)} icon="Wallet" tone="ok" />
        <KpiCard label="عدد الدفعات" value={String(total)} icon="Receipt" />
      </KpiGrid>

      <PaymentsClient
        rows={plain(rows) as never}
        total={total}
        page={page}
        pageSize={pageSize}
        options={plain(options) as never}
        perms={{
          canCreate: can(user, 'payments', 'create'),
          canDelete: can(user, 'payments', 'delete'),
          canExport: can(user, 'payments', 'export'),
        }}
      />
    </div>
  );
}

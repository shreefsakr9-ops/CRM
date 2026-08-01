import type { Metadata } from 'next';
import { requirePermission, can } from '@/server/auth/guard';
import { listExpenses, financeFormOptions } from '@/server/services/invoices';
import { PageHeader } from '@/components/page-header';
import { KpiCard, KpiGrid } from '@/components/ui/kpi';
import { formatMoney } from '@/lib/format';
import { ExpensesClient } from './expenses-client';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'المصروفات' };
export const dynamic = 'force-dynamic';

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requirePermission('expenses', 'view');
  const [{ rows, total, page, pageSize, totalMinor }, options] = await Promise.all([
    listExpenses({
      projectId: sp.projectId,
      category: sp.category,
      from: sp.from,
      to: sp.to,
      page: sp.page ? Number(sp.page) : 1,
    }),
    financeFormOptions(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="المصروفات المباشرة"
        description="التكاليف المرتبطة بالمشاريع — تُستخدم في احتساب ربحية كل مشروع"
        breadcrumbs={[{ label: 'المالية' }, { label: 'المصروفات' }]}
      />

      <KpiGrid className="lg:grid-cols-2">
        <KpiCard label="إجمالي المصروفات (حسب الفلتر)" value={formatMoney(totalMinor)} icon="CreditCard" tone="warn" />
        <KpiCard label="عدد السجلات" value={String(total)} icon="Receipt" />
      </KpiGrid>

      <ExpensesClient
        rows={plain(rows) as never}
        total={total}
        page={page}
        pageSize={pageSize}
        options={plain(options) as never}
        perms={{
          canCreate: can(user, 'expenses', 'create'),
          canDelete: can(user, 'expenses', 'delete'),
          canExport: can(user, 'expenses', 'export'),
        }}
      />
    </div>
  );
}

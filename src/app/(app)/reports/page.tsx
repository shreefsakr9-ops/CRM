import type { Metadata } from 'next';
import { requirePermission, can, scopeOf, Forbidden } from '@/server/auth/guard';
import { scopeAtLeast } from '@/server/auth/permissions';
import {
  salesReport,
  operationsReport,
  financialReport,
  marketingReport,
  parseRange,
} from '@/server/services/reports';
import { listAdWalletBalances, adWalletClientOptions } from '@/server/services/ad-wallets';
import { PageHeader } from '@/components/page-header';
import { ReportsClient } from './reports-client';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'التقارير' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission('reports', 'view');
  // تقارير هذه الصفحة كلها محسوبة على مستوى الشركة/الفريق بلا تقييد بنطاق
  // OWN (لا يوجد دعم لتصفية «سجلاتي فقط» في أي من دوال reports.ts) — فمن
  // يملك reports.view بنطاق OWN فقط (منفذ فردي) لا يحق له فتح الصفحة رغم
  // امتلاكه الصلاحية اسميًا؛ التحقق هنا دفاع إضافي حتى مع تخصيص صلاحيات فردية
  // مستقبلًا (User Permission Overrides) بنطاق أضيق من TEAM.
  if (!scopeAtLeast(scopeOf(user, 'reports'), 'TEAM')) {
    throw Forbidden('صلاحيتك على التقارير لا تشمل عرض هذه الصفحة');
  }
  const range = parseRange(sp.from, sp.to);

  const canFinance = can(user, 'reports', 'view_financial');
  const canAdWallets = can(user, 'ad_wallets', 'view');

  const [sales, operations, financial, marketing, adWallets, adWalletClients] = await Promise.all([
    salesReport(range),
    can(user, 'projects', 'view') ? operationsReport(range) : Promise.resolve(null),
    canFinance ? financialReport(range) : Promise.resolve(null),
    marketingReport(range),
    canAdWallets ? listAdWalletBalances(range) : Promise.resolve(null),
    canAdWallets ? adWalletClientOptions() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="التقارير"
        description="كل الأرقام محسوبة من البيانات الفعلية في قاعدة البيانات"
        breadcrumbs={[{ label: 'التقارير' }]}
      />
      <ReportsClient
        sales={plain(sales) as never}
        operations={plain(operations) as never}
        financial={plain(financial) as never}
        marketing={plain(marketing) as never}
        adWallets={plain(adWallets) as never}
        adWalletClients={adWalletClients}
        canCreateAdWallet={can(user, 'ad_wallets', 'create')}
        range={{ from: range.from.toISOString().slice(0, 10), to: range.to.toISOString().slice(0, 10) }}
        canExport={can(user, 'reports', 'export')}
      />
    </div>
  );
}

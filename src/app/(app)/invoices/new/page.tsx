import type { Metadata } from 'next';
import { requirePermission } from '@/server/auth/guard';
import { financeFormOptions } from '@/server/services/invoices';
import { PageHeader } from '@/components/page-header';
import { InvoiceBuilder } from '../invoice-builder';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'فاتورة جديدة' };
export const dynamic = 'force-dynamic';

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; projectId?: string; quotationId?: string }>;
}) {
  const sp = await searchParams;
  await requirePermission('invoices', 'create');
  const options = await financeFormOptions();

  return (
    <div className="space-y-5">
      <PageHeader
        title="فاتورة جديدة"
        description="الترقيم تلقائي بصيغة BP-INV-YYYY-0001، ويمكن توليدها من عرض سعر مقبول بضغطة واحدة"
        breadcrumbs={[{ label: 'المالية' }, { label: 'الفواتير', href: '/invoices' }, { label: 'جديدة' }]}
      />
      <InvoiceBuilder options={plain(options) as never} defaults={sp} />
    </div>
  );
}

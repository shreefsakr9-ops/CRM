import type { Metadata } from 'next';
import { requirePermission } from '@/server/auth/guard';
import { quotationFormOptions } from '@/server/services/quotations';
import { PageHeader } from '@/components/page-header';
import { QuotationBuilder } from '../quotation-builder';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'عرض سعر جديد' };
export const dynamic = 'force-dynamic';

export default async function NewQuotationPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; leadId?: string; dealId?: string }>;
}) {
  const sp = await searchParams;
  await requirePermission('quotations', 'create');
  const options = await quotationFormOptions();

  return (
    <div className="space-y-5">
      <PageHeader
        title="عرض سعر جديد"
        description="الترقيم تلقائي بصيغة BP-Q-YYYY-0001 والحسابات تتم بأعداد صحيحة بدون أخطاء تقريب"
        breadcrumbs={[
          { label: 'المبيعات' },
          { label: 'عروض الأسعار', href: '/quotations' },
          { label: 'جديد' },
        ]}
      />
      <QuotationBuilder initial={null} options={plain(options) as never} defaults={sp} />
    </div>
  );
}

import type { Metadata } from 'next';
import { requirePermission } from '@/server/auth/guard';
import { getQuotation, quotationFormOptions } from '@/server/services/quotations';
import { PageHeader } from '@/components/page-header';
import { QuotationBuilder } from '../../quotation-builder';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'تعديل عرض سعر' };
export const dynamic = 'force-dynamic';

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission('quotations', 'edit');
  const [quotation, options] = await Promise.all([getQuotation(id), quotationFormOptions()]);

  const initial = {
    id: quotation.id,
    clientId: quotation.clientId,
    leadId: quotation.leadId,
    dealId: quotation.dealId,
    contactId: quotation.contactId,
    issueDate: quotation.issueDate.toISOString(),
    expiryDate: quotation.expiryDate.toISOString(),
    currency: quotation.currency,
    headerDiscountType: quotation.headerDiscountType,
    headerDiscountValue: Number(quotation.headerDiscountValue),
    paymentTerms: quotation.paymentTerms,
    executionTerms: quotation.executionTerms,
    validityNote: quotation.validityNote,
    notes: quotation.notes,
    termsAr: quotation.termsAr,
    termsEn: quotation.termsEn,
    status: quotation.status,
    items: quotation.items.map((i) => ({
      serviceId: i.serviceId ?? '',
      nameAr: i.nameAr,
      nameEn: i.nameEn,
      description: i.description ?? '',
      quantity: String(Number(i.quantity)),
      unitPrice: String(Number(i.unitPriceMinor) / 100),
      discountType: i.discountType,
      discountValue:
        i.discountType === 'AMOUNT' ? String(Number(i.discountValue) / 100) : String(Number(i.discountValue)),
      taxRateId: i.taxRateId ?? '',
      taxRate: String(Number(i.taxRate)),
    })),
    installments: quotation.installments.map((i) => ({
      label: i.label,
      percentage: String(Number(i.percentage)),
      dueOffsetDays: String(i.dueOffsetDays),
    })),
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={`تعديل ${quotation.number}`}
        breadcrumbs={[
          { label: 'المبيعات' },
          { label: 'عروض الأسعار', href: '/quotations' },
          { label: quotation.number, href: `/quotations/${id}` },
          { label: 'تعديل' },
        ]}
      />
      <QuotationBuilder
        initial={plain(initial) as never}
        options={plain(options) as never}
        defaults={{}}
      />
    </div>
  );
}

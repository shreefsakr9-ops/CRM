import type { NextRequest } from 'next/server';
import { renderInvoicePdf, renderInvoiceHtml } from '@/server/services/invoice-pdf';
import { getInvoice } from '@/server/services/invoices';
import { apiError } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lang = request.nextUrl.searchParams.get('lang') === 'en' ? 'en' : 'ar';
    const preview = request.nextUrl.searchParams.get('preview') === '1';
    // getInvoice يفرض صلاحية العرض قبل أي توليد.
    const invoice = await getInvoice(id);

    // المعاينة بنفس قالب الـPDF تمامًا قبل التصدير.
    if (preview) {
      const html = await renderInvoiceHtml(id, lang);
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    const pdf = await renderInvoicePdf(id, lang);
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${invoice.number}-${lang}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

import type { NextRequest } from 'next/server';
import { renderQuotationPdf, renderQuotationHtml } from '@/server/services/quotation-pdf';
import { getQuotation } from '@/server/services/quotations';
import { apiError } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const lang = request.nextUrl.searchParams.get('lang') === 'en' ? 'en' : 'ar';
    const preview = request.nextUrl.searchParams.get('preview') === '1';
    const quotation = await getQuotation(id);

    // المعاينة تُعرض كـ HTML بنفس قالب الـ PDF تمامًا قبل التصدير.
    if (preview) {
      const html = await renderQuotationHtml(id, lang);
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const pdf = await renderQuotationPdf(id, lang);
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${quotation.number}-${lang}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

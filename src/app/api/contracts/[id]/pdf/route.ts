import type { NextRequest } from 'next/server';
import { renderContractPdf, renderContractHtml } from '@/server/services/contract-pdf';
import { getContract } from '@/server/services/contracts';
import { apiError } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lang = request.nextUrl.searchParams.get('lang') === 'en' ? 'en' : 'ar';
    const preview = request.nextUrl.searchParams.get('preview') === '1';
    // getContract يفرض الصلاحية والنطاق قبل أي توليد.
    const contract = await getContract(id);

    if (preview) {
      const html = await renderContractHtml(id, lang);
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    const pdf = await renderContractPdf(id, lang);
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${contract.number}-${lang}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

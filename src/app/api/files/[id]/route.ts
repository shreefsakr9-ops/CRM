import type { NextRequest } from 'next/server';
import { readFileForDownload } from '@/server/services/files';
import { apiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const exp = request.nextUrl.searchParams.get('exp') ?? '';
    const sig = request.nextUrl.searchParams.get('sig') ?? '';
    const { buffer, record } = await readFileForDownload(id, exp, sig);

    // نمنع تنفيذ أي محتوى داخل المتصفح ونجبر التنزيل للأنواع غير الآمنة.
    const inlineSafe = /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/plain)$/.test(
      record.mimeType,
    );
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': record.mimeType,
        'Content-Disposition': `${inlineSafe ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(record.originalName)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

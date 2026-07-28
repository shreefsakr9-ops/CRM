import { prisma } from '@/server/db';

export const dynamic = 'force-dynamic';

/** فحص صحة للحاوية والـ Reverse Proxy — لا يكشف أي بيانات. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok', db: 'up', at: new Date().toISOString() });
  } catch {
    return Response.json({ status: 'degraded', db: 'down' }, { status: 503 });
  }
}

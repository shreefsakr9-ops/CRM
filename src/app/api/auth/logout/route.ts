import { NextResponse } from 'next/server';
import { destroyCurrentSession, getCurrentUser } from '@/server/auth/session';
import { audit } from '@/server/services/audit';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user) {
    await audit({
      userId: user.id,
      action: 'LOGOUT',
      module: 'users',
      entityType: 'USER',
      entityId: user.id,
      summary: 'تسجيل خروج',
    });
  }
  await destroyCurrentSession();
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}

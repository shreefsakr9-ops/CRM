import type { Metadata } from 'next';
import { requireUser } from '@/server/auth/guard';
import { prisma } from '@/server/db';
import { PageHeader } from '@/components/page-header';
import { twoFactorStatus } from '@/server/services/two-factor';
import { ProfileClient } from './profile-client';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'الملف الشخصي' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await requireUser();
  const [me, sessions, twoFactor] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        nameEn: true,
        email: true,
        phone: true,
        jobTitle: true,
        locale: true,
        timezone: true,
        lastLoginAt: true,
        role: { select: { nameAr: true } },
        department: { select: { nameAr: true } },
      },
    }),
    prisma.session.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, ip: true, userAgent: true, createdAt: true, lastSeenAt: true },
    }),
    twoFactorStatus(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="الملف الشخصي"
        description="بياناتك وتفضيلاتك وكلمة المرور والجلسات النشطة"
        breadcrumbs={[{ label: 'الملف الشخصي' }]}
      />
      <ProfileClient
        me={plain(me) as never}
        sessions={plain(sessions) as never}
        currentSessionId={user.sessionId}
        twoFactor={twoFactor}
      />
    </div>
  );
}

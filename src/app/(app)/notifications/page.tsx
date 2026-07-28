import type { Metadata } from 'next';
import { requireUser } from '@/server/auth/guard';
import { listMyNotifications, getPreferences } from '@/server/services/notifications';
import { PageHeader } from '@/components/page-header';
import { NotificationsClient } from './notifications-client';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'الإشعارات' };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  await requireUser();
  const [notifications, preferences] = await Promise.all([
    listMyNotifications({ take: 100 }),
    getPreferences(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="مركز الإشعارات"
        description="كل التنبيهات مولّدة من الخادم — لا تعتمد على فتح الصفحة"
        breadcrumbs={[{ label: 'الرئيسية' }, { label: 'الإشعارات' }]}
      />
      <NotificationsClient
        notifications={plain(notifications) as never}
        preferences={plain(preferences) as never}
      />
    </div>
  );
}

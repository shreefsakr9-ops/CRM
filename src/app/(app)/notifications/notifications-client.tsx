'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCheck, Bell, BellOff, Settings2 } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, Checkbox, EmptyState, Select } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatRelative } from '@/lib/format';
import { label, tone, NOTIFICATION_TYPE } from '@/i18n/labels';
import { cn } from '@/lib/utils';
import { markReadAction, markAllReadAction, setPreferenceAction } from './actions';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

interface Preference {
  type: string;
  inApp: boolean;
  email: boolean;
  digest: string;
}

export function NotificationsClient({
  notifications,
  preferences,
}: {
  notifications: Notification[];
  preferences: Preference[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = React.useState<'all' | 'unread' | 'settings'>('unread');
  const [browserPermission, setBrowserPermission] = React.useState<NotificationPermission>('default');

  React.useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserPermission(Notification.permission);
    }
  }, []);

  const unread = notifications.filter((n) => !n.readAt);
  const shown = tab === 'unread' ? unread : notifications;
  const prefMap = new Map(preferences.map((p) => [p.type, p]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-md border border-line p-0.5">
          {(
            [
              ['unread', `غير مقروء (${unread.length})`],
              ['all', 'الكل'],
              ['settings', 'الإعدادات'],
            ] as const
          ).map(([key, text]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'rounded px-3 py-1.5 text-xs transition-colors',
                tab === key ? 'bg-brand/15 text-brand' : 'text-ink-muted hover:text-ink',
              )}
            >
              {text}
            </button>
          ))}
        </div>

        {tab !== 'settings' && unread.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            type="button"
            onClick={async () => {
              const res = await markAllReadAction();
              if (res.ok) toast.success(`تم تعليم ${res.data} إشعارًا كمقروء`);
              router.refresh();
            }}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            تعليم الكل كمقروء
          </Button>
        )}

        {tab !== 'settings' && 'Notification' in globalThis && browserPermission !== 'granted' && (
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={async () => {
              const result = await Notification.requestPermission();
              setBrowserPermission(result);
              if (result === 'granted') {
                new Notification('Blue Point OS', { body: 'تم تفعيل إشعارات المتصفح بنجاح' });
                toast.success('تم تفعيل إشعارات المتصفح');
              }
            }}
          >
            <Bell className="h-3.5 w-3.5" />
            تفعيل إشعارات المتصفح
          </Button>
        )}
      </div>

      {tab === 'settings' ? (
        <Card>
          <CardHeader
            title="تفضيلات الإشعارات"
            subtitle="التنبيهات الأمنية إلزامية ولا يمكن إيقافها"
            action={<Settings2 className="h-4 w-4 text-ink-faint" />}
          />
          <CardBody className="p-0">
            <ul className="divide-y divide-line">
              {Object.keys(NOTIFICATION_TYPE).map((type) => {
                const pref = prefMap.get(type);
                const isSecurity = type === 'SECURITY';
                return (
                  <li key={type} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-ink">{label('notificationType', type)}</p>
                      {isSecurity && <p className="text-[11px] text-warn">إلزامي</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Checkbox
                        label="داخل النظام"
                        disabled={isSecurity}
                        defaultChecked={pref?.inApp ?? true}
                        onChange={async (e) => {
                          const res = await setPreferenceAction(type, {
                            inApp: e.target.checked,
                            email: pref?.email ?? false,
                            digest: (pref?.digest as 'NONE') ?? 'NONE',
                          });
                          if (!res.ok) toast.error(res.error);
                          else toast.success('تم حفظ التفضيل');
                        }}
                      />
                      <Checkbox
                        label="بريد إلكتروني"
                        disabled={isSecurity}
                        defaultChecked={pref?.email ?? false}
                        onChange={async (e) => {
                          const res = await setPreferenceAction(type, {
                            inApp: pref?.inApp ?? true,
                            email: e.target.checked,
                            digest: (pref?.digest as 'NONE') ?? 'NONE',
                          });
                          if (!res.ok) toast.error(res.error);
                          else toast.success('تم حفظ التفضيل');
                        }}
                      />
                      <Select
                        className="h-8 w-auto text-xs"
                        defaultValue={pref?.digest ?? 'NONE'}
                        disabled={isSecurity}
                        onChange={async (e) => {
                          const res = await setPreferenceAction(type, {
                            inApp: pref?.inApp ?? true,
                            email: pref?.email ?? false,
                            digest: e.target.value as 'NONE' | 'DAILY' | 'WEEKLY',
                          });
                          if (!res.ok) toast.error(res.error);
                          else toast.success('تم حفظ التفضيل');
                        }}
                      >
                        <option value="NONE">بدون ملخص</option>
                        <option value="DAILY">ملخص يومي</option>
                        <option value="WEEKLY">ملخص أسبوعي</option>
                      </Select>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="p-0">
            {shown.length === 0 ? (
              <EmptyState
                icon={<BellOff className="h-5 w-5" />}
                title={tab === 'unread' ? 'لا توجد إشعارات غير مقروءة' : 'لا توجد إشعارات'}
                description="ستظهر هنا التنبيهات الخاصة بمهامك وعملائك وفواتيرك."
              />
            ) : (
              <ul className="divide-y divide-line">
                {shown.map((n) => {
                  const content = (
                    <div
                      className={cn(
                        'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-navy-800/40',
                        !n.readAt && 'bg-brand/5',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                          n.readAt ? 'bg-transparent' : 'bg-brand',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm text-ink">{n.title}</p>
                          <Badge tone={tone('notificationType', n.type)}>
                            {label('notificationType', n.type)}
                          </Badge>
                        </div>
                        {n.body && <p className="mt-0.5 text-xs text-ink-muted">{n.body}</p>}
                        <p className="mt-1 text-[11px] text-ink-faint">{formatRelative(n.createdAt)}</p>
                      </div>
                      {!n.readAt && (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.preventDefault();
                            await markReadAction([n.id]);
                            router.refresh();
                          }}
                          className="shrink-0 rounded p-1 text-ink-faint hover:text-brand"
                          title="تعليم كمقروء"
                        >
                          <CheckCheck className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                  return (
                    <li key={n.id}>
                      {n.link ? (
                        <Link
                          href={n.link}
                          onClick={() => {
                            if (!n.readAt) void markReadAction([n.id]);
                          }}
                        >
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

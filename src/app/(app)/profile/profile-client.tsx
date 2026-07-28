'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Save, KeyRound, LogOut, Monitor } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Select } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatRelative } from '@/lib/format';
import { updateProfileAction, changePasswordAction, revokeSessionAction } from './actions';

export function ProfileClient({
  me,
  sessions,
  currentSessionId,
}: {
  me: {
    id: string;
    name: string;
    nameEn: string | null;
    email: string;
    phone: string | null;
    jobTitle: string | null;
    locale: string;
    timezone: string;
    lastLoginAt: string | null;
    role: { nameAr: string };
    department: { nameAr: string } | null;
  };
  sessions: {
    id: string;
    ip: string | null;
    userAgent: string | null;
    createdAt: string;
    lastSeenAt: string;
  }[];
  currentSessionId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  const [pwPending, setPwPending] = React.useState(false);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setPending(true);
          const res = await updateProfileAction(Object.fromEntries(fd.entries()));
          setPending(false);
          if (!res.ok) return toast.error(res.error);
          toast.success('تم حفظ الملف الشخصي');
          router.refresh();
        }}
      >
        <Card>
          <CardHeader title="بياناتي" subtitle={`${me.role.nameAr}${me.department ? ` · ${me.department.nameAr}` : ''}`} />
          <CardBody className="space-y-4">
            <Field label="الاسم" required>
              <Input name="name" defaultValue={me.name} required minLength={3} />
            </Field>
            <Field label="البريد الإلكتروني" hint="لتغيير البريد تواصل مع مدير النظام">
              <Input value={me.email} dir="ltr" disabled />
            </Field>
            <Field label="رقم الهاتف">
              <Input name="phone" defaultValue={me.phone ?? ''} dir="ltr" />
            </Field>
            <Field label="لغة الواجهة">
              <Select name="locale" defaultValue={me.locale}>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </Select>
            </Field>
            <Field label="المنطقة الزمنية" hint="تُعرض كل التواريخ حسب هذه المنطقة">
              <Select name="timezone" defaultValue={me.timezone}>
                <option value="Africa/Cairo">القاهرة (Africa/Cairo)</option>
                <option value="Asia/Riyadh">الرياض (Asia/Riyadh)</option>
                <option value="Asia/Dubai">دبي (Asia/Dubai)</option>
                <option value="UTC">UTC</option>
              </Select>
            </Field>
            <p className="text-[11px] text-ink-faint">
              آخر تسجيل دخول: {me.lastLoginAt ? formatDate(me.lastLoginAt, 'ar', me.timezone, true) : '—'}
            </p>
            <div className="flex justify-end">
              <Button type="submit" loading={pending}>
                <Save className="h-4 w-4" />
                حفظ
              </Button>
            </div>
          </CardBody>
        </Card>
      </form>

      <div className="space-y-4">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            setPwPending(true);
            const res = await changePasswordAction(
              String(fd.get('current')),
              String(fd.get('next')),
              String(fd.get('confirm')),
            );
            setPwPending(false);
            if (!res.ok) return toast.error(res.error);
            toast.success('تم تغيير كلمة المرور');
            form.reset();
          }}
        >
          <Card>
            <CardHeader
              title="كلمة المرور"
              subtitle="١٠ أحرف على الأقل، مع حرف كبير وحرف صغير ورقم"
            />
            <CardBody className="space-y-4">
              <Field label="كلمة المرور الحالية" required>
                <Input name="current" type="password" dir="ltr" required autoComplete="current-password" />
              </Field>
              <Field label="كلمة المرور الجديدة" required>
                <Input name="next" type="password" dir="ltr" required minLength={10} autoComplete="new-password" />
              </Field>
              <Field label="تأكيد كلمة المرور" required>
                <Input name="confirm" type="password" dir="ltr" required minLength={10} autoComplete="new-password" />
              </Field>
              <div className="flex justify-end">
                <Button type="submit" loading={pwPending}>
                  <KeyRound className="h-4 w-4" />
                  تغيير كلمة المرور
                </Button>
              </div>
            </CardBody>
          </Card>
        </form>

        <Card>
          <CardHeader
            title="الجلسات النشطة"
            subtitle="يمكنك إنهاء أي جلسة لا تعرفها فورًا"
            action={<Monitor className="h-4 w-4 text-ink-faint" />}
          />
          <CardBody className="p-0">
            <ul className="divide-y divide-line">
              {sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-xs text-ink">
                      <span className="num" dir="ltr">
                        {s.ip ?? 'غير معروف'}
                      </span>
                      {s.id === currentSessionId && <Badge tone="ok">هذه الجلسة</Badge>}
                    </p>
                    <p className="truncate text-[10px] text-ink-faint" dir="ltr">
                      {s.userAgent?.slice(0, 70) ?? '—'}
                    </p>
                    <p className="text-[10px] text-ink-faint">آخر نشاط {formatRelative(s.lastSeenAt)}</p>
                  </div>
                  {s.id !== currentSessionId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={async () => {
                        const res = await revokeSessionAction(s.id);
                        toast[res.ok ? 'success' : 'error'](res.ok ? 'تم إنهاء الجلسة' : res.error);
                        router.refresh();
                      }}
                    >
                      <LogOut className="h-3.5 w-3.5 text-danger" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Save, KeyRound, LogOut, Monitor, ShieldCheck, ShieldOff, Copy, RefreshCw } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Select } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/format';
import { RelativeTime } from '@/components/relative-time';
import { cn } from '@/lib/utils';
import {
  updateProfileAction,
  changePasswordAction,
  revokeSessionAction,
  beginTwoFactorAction,
  confirmTwoFactorAction,
  disableTwoFactorAction,
  regenerateRecoveryCodesAction,
} from './actions';

export function ProfileClient({
  me,
  sessions,
  currentSessionId,
  twoFactor,
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
  twoFactor: { enabled: boolean; remainingRecoveryCodes: number };
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

        <TwoFactorCard status={twoFactor} />

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
                    <p className="text-[10px] text-ink-faint">
                      آخر نشاط <RelativeTime value={s.lastSeenAt} />
                    </p>
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

/**
 * المصادقة الثنائية.
 * السر ورموز الاسترجاع تُعرض مرة واحدة فقط ولا تُخزَّن في المتصفح — إن أغلق
 * المستخدم الصفحة قبل حفظها فعليه إعادة التوليد. هذا مقصود.
 */
function TwoFactorCard({ status }: { status: { enabled: boolean; remainingRecoveryCodes: number } }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  const [setup, setSetup] = React.useState<{ secret: string; otpauth: string; qrSvg: string } | null>(null);
  const [codes, setCodes] = React.useState<string[] | null>(null);

  const begin = async () => {
    setPending(true);
    const res = await beginTwoFactorAction();
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    setSetup(res.data);
  };

  const confirm = async (code: string) => {
    setPending(true);
    const res = await confirmTwoFactorAction(code);
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    setSetup(null);
    setCodes(res.data);
    toast.success('تم تفعيل المصادقة الثنائية');
    router.refresh();
  };

  const disable = async (password: string) => {
    setPending(true);
    const res = await disableTwoFactorAction(password);
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    toast.success('تم إيقاف المصادقة الثنائية');
    router.refresh();
  };

  const regenerate = async (password: string) => {
    setPending(true);
    const res = await regenerateRecoveryCodesAction(password);
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    setCodes(res.data);
    toast.success('أُعيد توليد رموز الاسترجاع');
    router.refresh();
  };

  return (
    <Card>
      <CardHeader
        title="المصادقة الثنائية"
        subtitle="طبقة حماية ثانية عند الدخول — رمز من تطبيق المصادقة"
        action={
          status.enabled ? (
            <Badge tone="ok" dot>
              مفعّلة
            </Badge>
          ) : (
            <Badge tone="warn" dot>
              غير مفعّلة
            </Badge>
          )
        }
      />
      <CardBody className="space-y-4">
        {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />}

        {!codes && setup && (
          <div className="space-y-4">
            <p className="text-xs leading-6 text-ink-muted">
              امسح الرمز بتطبيق المصادقة (Google Authenticator أو Microsoft Authenticator أو
              1Password)، ثم أدخل الرمز الظاهر لتأكيد التفعيل.
            </p>
            <div className="flex flex-wrap items-start gap-4">
              <div
                className="w-40 shrink-0 rounded-md bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
                // الـSVG مولَّد على السيرفر من قيمة نحن من أنشأها، لا من مدخل مستخدم.
                dangerouslySetInnerHTML={{ __html: setup.qrSvg }}
              />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="bp-label">أو أدخل السر يدويًا</p>
                <code className="num block break-all rounded border border-line bg-surface-sunken px-2 py-1.5 text-[11px] text-ink" dir="ltr">
                  {setup.secret}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(setup.secret);
                    toast.success('نُسخ السر');
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  نسخ
                </Button>
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void confirm(String(fd.get('code') ?? ''));
              }}
              className="flex flex-wrap items-end gap-2"
            >
              <Field label="الرمز من التطبيق" className="flex-1">
                <Input name="code" dir="ltr" placeholder="123456" required autoFocus />
              </Field>
              <Button type="submit" loading={pending}>
                <ShieldCheck className="h-4 w-4" />
                تأكيد التفعيل
              </Button>
              <Button type="button" variant="ghost" onClick={() => setSetup(null)}>
                إلغاء
              </Button>
            </form>
          </div>
        )}

        {!codes && !setup && !status.enabled && (
          <div className="space-y-3">
            <p className="text-xs leading-6 text-ink-muted">
              عند التفعيل سيُطلب منك رمز إضافي بعد كلمة المرور في كل تسجيل دخول. تحتاج تطبيق
              مصادقة على هاتفك.
            </p>
            <Button type="button" loading={pending} onClick={() => void begin()}>
              <ShieldCheck className="h-4 w-4" />
              تفعيل المصادقة الثنائية
            </Button>
          </div>
        )}

        {!codes && !setup && status.enabled && (
          <div className="space-y-4">
            <p className="text-xs leading-6 text-ink-muted">
              رموز الاسترجاع المتبقية:{' '}
              <span className={cn('num font-bold', status.remainingRecoveryCodes <= 2 ? 'text-warn' : 'text-ink')}>
                {status.remainingRecoveryCodes}
              </span>
              {status.remainingRecoveryCodes <= 2 && ' — يُفضَّل توليد رموز جديدة'}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                const password = String(fd.get('password') ?? '');
                const intent = (form.elements.namedItem('intent') as HTMLInputElement | null)?.value;
                if (intent === 'disable') void disable(password);
                else void regenerate(password);
                form.reset();
              }}
              className="space-y-3"
            >
              <Field label="كلمة المرور الحالية" hint="مطلوبة لأي تغيير على إعدادات الحماية" required>
                <Input name="password" type="password" dir="ltr" required autoComplete="current-password" />
              </Field>
              <input type="hidden" name="intent" value="regenerate" />
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  loading={pending}
                  onClick={(e) => {
                    const form = e.currentTarget.form;
                    if (form) (form.elements.namedItem('intent') as HTMLInputElement).value = 'regenerate';
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  رموز استرجاع جديدة
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  variant="danger"
                  loading={pending}
                  onClick={(e) => {
                    const form = e.currentTarget.form;
                    if (form) (form.elements.namedItem('intent') as HTMLInputElement).value = 'disable';
                  }}
                >
                  <ShieldOff className="h-3.5 w-3.5" />
                  إيقاف
                </Button>
              </div>
            </form>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const toast = useToast();
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-warn/25 bg-warn/10 p-3 text-xs leading-6 text-ink-muted">
        <p className="font-semibold text-ink">احفظ هذه الرموز الآن</p>
        <p className="mt-1">
          كل رمز يُستخدم مرة واحدة عند فقد هاتفك. <strong>لن تظهر مرة أخرى</strong> — النظام يحفظ
          نسخة مجزّأة فقط ولا يستطيع استعادتها.
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-1.5" dir="ltr">
        {codes.map((code) => (
          <li key={code} className="num rounded border border-line bg-surface-sunken px-2 py-1 text-center text-[11px] text-ink">
            {code}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          variant="secondary"
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(codes.join('\n'));
            toast.success('نُسخت الرموز');
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          نسخ الكل
        </Button>
        <Button size="sm" type="button" onClick={onDone}>
          حفظتها
        </Button>
      </div>
    </div>
  );
}

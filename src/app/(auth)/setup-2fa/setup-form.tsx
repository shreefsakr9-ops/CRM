'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Copy, LogOut } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { beginTwoFactorAction, confirmTwoFactorAction } from '@/app/(app)/profile/actions';

/**
 * شاشة التفعيل الإجباري. تعيد استخدام نفس إجراءات الملف الشخصي — لا مسار
 * تفعيل ثانٍ بقواعد مختلفة.
 */
export function SetupTwoFactorForm({ roleLabel }: { roleLabel: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  const [setup, setSetup] = React.useState<{ secret: string; otpauth: string; qrSvg: string } | null>(
    null,
  );
  const [codes, setCodes] = React.useState<string[] | null>(null);

  // نبدأ التوليد فور فتح الصفحة: المستخدم هنا مُلزَم، فلا معنى لخطوة إضافية.
  React.useEffect(() => {
    let active = true;
    void (async () => {
      const res = await beginTwoFactorAction();
      if (!active) return;
      if (res.ok && res.data) setSetup(res.data);
      else if (!res.ok) toast.error(res.error);
    })();
    return () => {
      active = false;
    };
  }, [toast]);

  const confirm = async (code: string) => {
    setPending(true);
    const res = await confirmTwoFactorAction(code);
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    setCodes(res.data);
  };

  if (codes) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-warn/25 bg-warn/10 p-3 text-xs leading-6 text-ink-muted">
          <p className="font-semibold text-ink">احفظ رموز الاسترجاع الآن</p>
          <p className="mt-1">
            كل رمز يُستخدم مرة واحدة عند فقد هاتفك. <strong>لن تظهر مرة أخرى</strong> — النظام يحفظ
            نسخة مجزّأة فقط.
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-1.5" dir="ltr">
          {codes.map((code) => (
            <li
              key={code}
              className="num rounded border border-line bg-surface-sunken px-2 py-1 text-center text-[11px] text-ink"
            >
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
          <Button size="sm" type="button" onClick={() => router.replace('/dashboard')}>
            حفظتها — متابعة
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-brand/25 bg-brand/10 px-3 py-2.5 text-xs leading-6 text-ink-muted">
        <p className="flex items-center gap-1.5 font-semibold text-ink">
          <ShieldCheck className="h-3.5 w-3.5 text-brand" />
          المصادقة الثنائية مطلوبة لحسابك
        </p>
        <p className="mt-1">
          دورك (<span className="num">{roleLabel}</span>) يمنح صلاحيات واسعة، لذلك يشترط النظام
          تفعيل التحقق بخطوتين قبل المتابعة.
        </p>
      </div>

      {!setup ? (
        <p className="text-xs text-ink-faint">جارٍ تجهيز رمز التفعيل…</p>
      ) : (
        <>
          <p className="text-xs leading-6 text-ink-muted">
            امسح الرمز بتطبيق مصادقة (Google Authenticator أو Microsoft Authenticator أو 1Password)
            ثم أدخل الرمز الظاهر.
          </p>
          <div className="flex justify-center">
            <div
              className="w-44 rounded-md bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
              // مولَّد على السيرفر من قيمة أنشأها النظام، لا من مدخل مستخدم.
              dangerouslySetInnerHTML={{ __html: setup.qrSvg }}
            />
          </div>
          <div className="space-y-1.5">
            <p className="bp-label">أو أدخل السر يدويًا</p>
            <code
              className="num block break-all rounded border border-line bg-surface-sunken px-2 py-1.5 text-[11px] text-ink"
              dir="ltr"
            >
              {setup.secret}
            </code>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              void confirm(String(fd.get('code') ?? ''));
            }}
            className="space-y-3"
          >
            <Field label="الرمز من التطبيق">
              <Input name="code" dir="ltr" placeholder="123456" required autoFocus />
            </Field>
            <Button type="submit" loading={pending} className="w-full justify-center" size="lg">
              {!pending && <ShieldCheck className="h-4 w-4" />}
              تفعيل والمتابعة
            </Button>
          </form>
        </>
      )}

      <form action="/api/auth/logout" method="post" className="pt-1 text-center">
        <button type="submit" className="text-[11px] text-ink-faint hover:text-ink">
          <LogOut className="me-1 inline h-3 w-3" />
          تسجيل الخروج
        </button>
      </form>
    </div>
  );
}

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Send, CheckCircle2, XCircle, ShieldCheck, Mail, MailX } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { Button, Field, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  submitApprovalAction,
  approveQuotationAction,
  markSentAction,
  quotationRecipientAction,
  clientDecisionAction,
} from '../actions';

export function QuotationActions({
  id,
  status,
  preparedById,
  currentUserId,
  clientId,
  perms,
}: {
  id: string;
  status: string;
  preparedById: string;
  currentUserId: string;
  clientId: string | null;
  perms: {
    canEdit: boolean;
    canApprove: boolean;
    canCreateContract: boolean;
    canCreateProject: boolean;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const [drawer, setDrawer] = React.useState<'approve' | 'reject' | 'decision' | 'send' | null>(
    null,
  );
  const [pending, setPending] = React.useState(false);
  const [recipient, setRecipient] = React.useState<{
    mailEnabled: boolean;
    recipient: { name: string; email: string; source: 'contact' | 'lead' } | null;
    defaultLang: 'ar' | 'en';
  } | null>(null);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => {
    setPending(true);
    const res = await fn();
    setPending(false);
    if (!res.ok) return toast.error(res.error ?? 'حدث خطأ');
    toast.success(msg);
    setDrawer(null);
    router.refresh();
  };

  // نعرض المستلم الفعلي قبل الإرسال — لا يُرسل بريد لجهة لم يرها المستخدم.
  const openSend = async () => {
    setDrawer('send');
    setRecipient(null);
    const res = await quotationRecipientAction(id);
    if (res.ok && res.data) setRecipient(res.data);
    else if (!res.ok) toast.error(res.error);
  };

  const send = async (email: boolean, lang: 'ar' | 'en') => {
    setPending(true);
    const res = await markSentAction(id, { email, lang });
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(res.data?.detail ?? 'تم');
    setDrawer(null);
    router.refresh();
  };

  const canSubmit = perms.canEdit && ['DRAFT', 'REVISED'].includes(status);
  const canDecide = perms.canApprove && status === 'PENDING_INTERNAL_APPROVAL';
  const canSend = perms.canEdit && ['APPROVED_INTERNALLY', 'DRAFT', 'REVISED'].includes(status);
  const canClientDecide = perms.canEdit && ['SENT', 'UNDER_REVIEW', 'REVISED'].includes(status);
  const isAccepted = status === 'ACCEPTED';

  if (!canSubmit && !canDecide && !canSend && !canClientDecide && !isAccepted) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canSubmit && (
          <Button size="sm" onClick={() => void run(() => submitApprovalAction(id), 'تم الإرسال للاعتماد الداخلي')} loading={pending} type="button">
            <ShieldCheck className="h-3.5 w-3.5" />
            إرسال للاعتماد الداخلي
          </Button>
        )}
        {canDecide && (
          <>
            <Button size="sm" variant="success" onClick={() => setDrawer('approve')} type="button">
              <CheckCircle2 className="h-3.5 w-3.5" />
              اعتماد
            </Button>
            <Button size="sm" variant="danger" onClick={() => setDrawer('reject')} type="button">
              <XCircle className="h-3.5 w-3.5" />
              طلب تعديل
            </Button>
          </>
        )}
        {canSend && (
          <Button size="sm" variant="secondary" onClick={() => void openSend()} type="button">
            <Send className="h-3.5 w-3.5" />
            إرسال للعميل
          </Button>
        )}
        {canClientDecide && (
          <Button size="sm" variant="outline" onClick={() => setDrawer('decision')} type="button">
            تسجيل قرار العميل
          </Button>
        )}
        {isAccepted && (
          <>
            {perms.canCreateContract && (
              <a href={`/contracts?quotationId=${id}${clientId ? `&clientId=${clientId}` : ''}`}>
                <Button size="sm">إنشاء عقد من هذا العرض</Button>
              </a>
            )}
            {perms.canCreateProject && (
              <a href={`/projects/new?quotationId=${id}${clientId ? `&clientId=${clientId}` : ''}`}>
                <Button size="sm" variant="outline">
                  إنشاء مشروع من هذا العرض
                </Button>
              </a>
            )}
          </>
        )}
      </div>

      <Drawer
        open={drawer === 'send'}
        onClose={() => setDrawer(null)}
        title="إرسال عرض السعر"
        description="الحالة تتغير إلى «مُرسل» بعد نجاح الإرسال فقط."
        width="sm"
      >
        {recipient === null ? (
          <p className="text-xs text-ink-faint">جارٍ تحديد المستلم…</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const intent = String(fd.get('intent') ?? 'email');
              void send(intent === 'email', (fd.get('lang') as 'ar' | 'en') ?? 'ar');
            }}
            className="space-y-4"
          >
            {!recipient.mailEnabled && (
              <p className="rounded-md border border-warn/25 bg-warn/10 p-3 text-xs leading-6 text-ink-muted">
                خادم البريد غير مضبوط، لذلك لا يمكن الإرسال آليًا. نزّل الـPDF وأرسله بنفسك ثم علّم
                العرض كمُرسل.
              </p>
            )}
            {recipient.mailEnabled && !recipient.recipient && (
              <p className="rounded-md border border-warn/25 bg-warn/10 p-3 text-xs leading-6 text-ink-muted">
                لا يوجد بريد إلكتروني لجهة الاتصال ولا للعميل المحتمل. أضف البريد أولًا ليصله العرض
                تلقائيًا.
              </p>
            )}
            {recipient.mailEnabled && recipient.recipient && (
              <>
                <div className="rounded-md border border-line bg-surface-sunken/60 p-3">
                  <p className="text-[11px] text-ink-faint">
                    سيصل البريد مع مرفق PDF إلى
                    {recipient.recipient.source === 'lead' ? ' (بريد العميل المحتمل)' : ''}
                  </p>
                  <p className="mt-0.5 text-sm text-ink">{recipient.recipient.name}</p>
                  <p className="num text-xs text-ink-muted" dir="ltr">
                    {recipient.recipient.email}
                  </p>
                </div>
                <Field label="لغة المستند">
                  <Select
                    name="lang"
                    defaultValue={recipient.defaultLang}
                    options={[
                      { value: 'ar', label: 'العربية' },
                      { value: 'en', label: 'English' },
                    ]}
                  />
                </Field>
              </>
            )}

            <input type="hidden" name="intent" value="email" />
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                loading={pending}
                disabled={pending}
                onClick={(e) => {
                  const form = e.currentTarget.form;
                  if (form) (form.elements.namedItem('intent') as HTMLInputElement).value = 'manual';
                }}
              >
                <MailX className="h-3.5 w-3.5" />
                تعليم كمُرسل فقط
              </Button>
              {recipient.mailEnabled && recipient.recipient && (
                <Button
                  type="submit"
                  size="sm"
                  loading={pending}
                  disabled={pending}
                  onClick={(e) => {
                    const form = e.currentTarget.form;
                    if (form) (form.elements.namedItem('intent') as HTMLInputElement).value = 'email';
                  }}
                >
                  <Mail className="h-3.5 w-3.5" />
                  إرسال بالبريد
                </Button>
              )}
            </div>
          </form>
        )}
      </Drawer>

      <Drawer
        open={drawer === 'approve' || drawer === 'reject'}
        onClose={() => setDrawer(null)}
        title={drawer === 'approve' ? 'اعتماد عرض السعر' : 'طلب تعديل على العرض'}
        description={
          preparedById === currentUserId
            ? 'ملاحظة: الاعتماد الذاتي قد يكون ممنوعًا حسب إعدادات النظام.'
            : undefined
        }
        width="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void run(
              () => approveQuotationAction(id, drawer === 'approve', String(fd.get('comment') ?? '')),
              drawer === 'approve' ? 'تم اعتماد العرض' : 'تم إرجاع العرض للتعديل',
            );
          }}
          className="space-y-4"
        >
          <Field label="ملاحظة" hint="ستصل لمن أعدّ العرض كإشعار">
            <Textarea name="comment" rows={4} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant={drawer === 'approve' ? 'success' : 'danger'} loading={pending}>
              {drawer === 'approve' ? 'اعتماد' : 'إرجاع للتعديل'}
            </Button>
          </div>
        </form>
      </Drawer>

      <Drawer
        open={drawer === 'decision'}
        onClose={() => setDrawer(null)}
        title="قرار العميل"
        description="القبول يحوّل الصفقة إلى ناجحة وينشئ ملف العميل تلقائيًا إن لم يكن موجودًا."
        width="sm"
      >
        <div className="space-y-4">
          <Button
            className="w-full justify-center"
            variant="success"
            loading={pending}
            type="button"
            onClick={() =>
              void run(() => clientDecisionAction(id, true), 'تم تسجيل قبول العميل — الصفقة أصبحت ناجحة')
            }
          >
            <CheckCircle2 className="h-4 w-4" />
            العميل وافق
          </Button>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              void run(
                () => clientDecisionAction(id, false, String(fd.get('reason') ?? '')),
                'تم تسجيل رفض العميل',
              );
            }}
            className="space-y-3 border-t border-line pt-4"
          >
            <Field label="سبب الرفض">
              <Textarea name="reason" rows={3} />
            </Field>
            <Button type="submit" variant="danger" className="w-full justify-center" loading={pending}>
              <XCircle className="h-4 w-4" />
              العميل رفض
            </Button>
          </form>
        </div>
      </Drawer>
    </>
  );
}

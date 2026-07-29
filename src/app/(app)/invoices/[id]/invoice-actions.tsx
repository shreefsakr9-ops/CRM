'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Send, Wallet, Ban, Mail, MailX } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  RecipientPicker,
  type RecipientOption,
  type RecipientChoice,
} from '@/components/recipient-picker';
import { formatMoney } from '@/lib/format';
import { options as labelOptions } from '@/i18n/labels';
import {
  sendInvoiceAction,
  cancelInvoiceAction,
  recordPaymentAction,
  invoiceRecipientAction,
} from '../actions';

export function InvoiceActions({
  invoice,
  perms,
}: {
  invoice: {
    id: string;
    number: string;
    status: string;
    clientId: string;
    currency: string;
    remainingMinor: number;
  };
  perms: { canEdit: boolean; canRecordPayment: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [drawer, setDrawer] = React.useState<'pay' | 'cancel' | 'send' | null>(null);
  const [pending, setPending] = React.useState(false);
  const [recipient, setRecipient] = React.useState<{
    mailEnabled: boolean;
    recipient: { name: string; email: string } | null;
    options: RecipientOption[];
  } | null>(null);
  const [choice, setChoice] = React.useState<RecipientChoice>({ ccContactIds: [] });

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => {
    setPending(true);
    const res = await fn();
    setPending(false);
    if (!res.ok) return toast.error(res.error ?? 'حدث خطأ');
    toast.success(msg);
    setDrawer(null);
    router.refresh();
  };

  // نعرض المستلم الفعلي قبل الإرسال — لا نرسل بريدًا لجهة لم يرها المستخدم.
  const openSend = async () => {
    setDrawer('send');
    setRecipient(null);
    setChoice({ ccContactIds: [] });
    const res = await invoiceRecipientAction(invoice.id);
    if (res.ok && res.data) setRecipient(res.data);
    else if (!res.ok) toast.error(res.error);
  };

  const send = async (email: boolean) => {
    setPending(true);
    const res = await sendInvoiceAction(invoice.id, {
      email,
      toContactId: choice.toContactId,
      ccContactIds: choice.ccContactIds,
    });
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(res.data?.detail ?? 'تم');
    setDrawer(null);
    router.refresh();
  };

  // ما يُعرض في صندوق المستلم يتبع الاختيار اليدوي، وإلا فالاختيار التلقائي —
  // حتى لا يظهر عنوان ويُرسل لغيره.
  const chosen = recipient?.options.find((o) => o.id === choice.toContactId);
  const effective = chosen ?? recipient?.recipient ?? null;

  return (
    <div className="flex flex-wrap gap-2">
      {perms.canEdit && invoice.status === 'DRAFT' && (
        <Button size="sm" type="button" onClick={() => void openSend()}>
          <Send className="h-3.5 w-3.5" />
          إرسال
        </Button>
      )}
      {perms.canRecordPayment && invoice.remainingMinor > 0 && invoice.status !== 'CANCELLED' && (
        <Button size="sm" variant="success" type="button" onClick={() => setDrawer('pay')}>
          <Wallet className="h-3.5 w-3.5" />
          تسجيل دفعة
        </Button>
      )}
      {perms.canEdit && invoice.status !== 'CANCELLED' && (
        <Button size="sm" variant="danger" type="button" onClick={() => setDrawer('cancel')}>
          <Ban className="h-3.5 w-3.5" />
          إلغاء
        </Button>
      )}

      <Drawer
        open={drawer === 'send'}
        onClose={() => setDrawer(null)}
        title={`إرسال الفاتورة ${invoice.number}`}
        description="الحالة تتغير إلى «مُرسلة» بعد نجاح الإرسال فقط."
        width="sm"
      >
        {recipient === null ? (
          <p className="text-xs text-ink-faint">جارٍ تحديد جهة الاتصال…</p>
        ) : (
          <div className="space-y-4">
            {!recipient.mailEnabled && (
              <p className="rounded-md border border-warn/25 bg-warn/10 p-3 text-xs leading-6 text-ink-muted">
                خادم البريد غير مضبوط، لذلك لا يمكن الإرسال آليًا. يمكنك تنزيل الـPDF وإرساله بنفسك
                ثم تعليم الفاتورة كمُرسلة.
              </p>
            )}
            {recipient.mailEnabled && !effective && (
              <p className="rounded-md border border-warn/25 bg-warn/10 p-3 text-xs leading-6 text-ink-muted">
                لا توجد جهة اتصال لها بريد إلكتروني عند هذا العميل. أضف جهة اتصال من نوع «مالية»
                لتصلها الفواتير تلقائيًا.
              </p>
            )}
            {recipient.mailEnabled && effective && (
              <>
                <div className="rounded-md border border-line bg-surface-sunken/60 p-3">
                  <p className="text-[11px] text-ink-faint">سيصل البريد مع مرفق PDF إلى</p>
                  <p className="mt-0.5 text-sm text-ink">{effective.name}</p>
                  <p className="num text-xs text-ink-muted" dir="ltr">
                    {effective.email}
                  </p>
                </div>
                <RecipientPicker
                  options={recipient.options}
                  value={choice}
                  onChange={setChoice}
                  disabled={pending}
                />
              </>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                type="button"
                loading={pending}
                disabled={pending}
                onClick={() => void send(false)}
              >
                <MailX className="h-3.5 w-3.5" />
                تعليم كمُرسلة فقط
              </Button>
              {recipient.mailEnabled && effective && (
                <Button size="sm" type="button" loading={pending} disabled={pending} onClick={() => void send(true)}>
                  <Mail className="h-3.5 w-3.5" />
                  إرسال بالبريد
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      <Drawer
        open={drawer === 'pay'}
        onClose={() => setDrawer(null)}
        title="تسجيل دفعة"
        description={`المتبقي ${formatMoney(invoice.remainingMinor, invoice.currency)}`}
        width="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void run(
              () =>
                recordPaymentAction({
                  ...Object.fromEntries(fd.entries()),
                  invoiceId: invoice.id,
                  clientId: invoice.clientId,
                  currency: invoice.currency,
                }),
              'تم تسجيل الدفعة',
            );
          }}
          className="space-y-4"
        >
          <Field label="المبلغ" required>
            <Input
              name="amount"
              type="number"
              min={0.01}
              step="0.01"
              dir="ltr"
              required
              defaultValue={invoice.remainingMinor / 100}
            />
          </Field>
          <Field label="تاريخ الدفع" required>
            <Input
              name="paidAt"
              type="date"
              dir="ltr"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Field label="طريقة الدفع" required>
            <Select name="method" defaultValue="BANK_TRANSFER" options={labelOptions('paymentMethod')} />
          </Field>
          <Field label="الرقم المرجعي">
            <Input name="reference" dir="ltr" />
          </Field>
          <Field label="ملاحظات">
            <Textarea name="notes" rows={2} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={pending}>
              تسجيل
            </Button>
          </div>
        </form>
      </Drawer>

      <Drawer
        open={drawer === 'cancel'}
        onClose={() => setDrawer(null)}
        title="إلغاء الفاتورة"
        description="الفواتير لا تُحذف — تُلغى مع تسجيل السبب حفاظًا على تسلسل الترقيم."
        width="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void run(
              () => cancelInvoiceAction(invoice.id, String(fd.get('reason') ?? '')),
              'تم إلغاء الفاتورة',
            );
          }}
          className="space-y-4"
        >
          <Field label="سبب الإلغاء" required>
            <Textarea name="reason" rows={3} required />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant="danger" loading={pending}>
              تأكيد الإلغاء
            </Button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}

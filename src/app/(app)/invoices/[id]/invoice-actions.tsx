'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Send, Wallet, Ban } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/format';
import { options as labelOptions } from '@/i18n/labels';
import { sendInvoiceAction, cancelInvoiceAction, recordPaymentAction } from '../actions';

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
  const [drawer, setDrawer] = React.useState<'pay' | 'cancel' | null>(null);
  const [pending, setPending] = React.useState(false);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => {
    setPending(true);
    const res = await fn();
    setPending(false);
    if (!res.ok) return toast.error(res.error ?? 'حدث خطأ');
    toast.success(msg);
    setDrawer(null);
    router.refresh();
  };

  return (
    <div className="flex flex-wrap gap-2">
      {perms.canEdit && invoice.status === 'DRAFT' && (
        <Button
          size="sm"
          loading={pending}
          type="button"
          onClick={() => void run(() => sendInvoiceAction(invoice.id), 'تم إرسال الفاتورة')}
        >
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

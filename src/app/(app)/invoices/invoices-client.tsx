'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Send, Wallet } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { FiltersBar } from '@/components/filters-bar';
import { Drawer } from '@/components/ui/drawer';
import { Badge, Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatMoney } from '@/lib/format';
import { label, tone, options as labelOptions } from '@/i18n/labels';
import { sendInvoiceAction, recordPaymentAction } from './actions';

interface Row {
  id: string;
  number: string;
  status: string;
  issueDate: string;
  dueDate: string;
  totalMinor: number;
  paidMinor: number;
  currency: string;
  client: { id: string; legalName: string; brandName: string | null };
  project: { id: string; name: string } | null;
  _count: { payments: number };
}

export function InvoicesClient({
  rows,
  total,
  page,
  pageSize,
  options,
  perms,
}: {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  options: { clients: { id: string; legalName: string; brandName: string | null }[] };
  perms: { canEdit: boolean; canExport: boolean; canRecordPayment: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [paying, setPaying] = React.useState<Row | null>(null);
  const [pending, setPending] = React.useState(false);

  const columns: Column<Row>[] = [
    {
      key: 'number',
      header: 'الفاتورة',
      primary: true,
      exportValue: (r) => r.number,
      render: (r) => (
        <div className="min-w-0">
          <p className="num truncate text-sm">{r.number}</p>
          <p className="truncate text-[11px] text-ink-faint">
            {r.client.brandName || r.client.legalName}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      exportValue: (r) => label('invoiceStatus', r.status),
      render: (r) => (
        <Badge tone={tone('invoiceStatus', r.status)}>{label('invoiceStatus', r.status)}</Badge>
      ),
    },
    {
      key: 'total',
      header: 'الإجمالي',
      align: 'end',
      exportValue: (r) => r.totalMinor / 100,
      render: (r) => <span className="num text-xs">{formatMoney(r.totalMinor, r.currency)}</span>,
    },
    {
      key: 'paid',
      header: 'المدفوع',
      align: 'end',
      exportValue: (r) => r.paidMinor / 100,
      render: (r) => (
        <span className={`num text-xs ${r.paidMinor > 0 ? 'text-ok' : 'text-ink-faint'}`}>
          {formatMoney(r.paidMinor, r.currency)}
        </span>
      ),
    },
    {
      key: 'remaining',
      header: 'المتبقي',
      align: 'end',
      exportValue: (r) => (r.totalMinor - r.paidMinor) / 100,
      render: (r) => (
        <span className="num text-xs text-warn">
          {formatMoney(r.totalMinor - r.paidMinor, r.currency)}
        </span>
      ),
    },
    {
      key: 'dueDate',
      header: 'الاستحقاق',
      exportValue: (r) => r.dueDate,
      render: (r) => {
        const overdue = new Date(r.dueDate) < new Date() && r.paidMinor < r.totalMinor;
        return (
          <span className={overdue ? 'text-xs text-danger' : 'text-xs text-ink-muted'}>
            {formatDate(r.dueDate)}
          </span>
        );
      },
    },
    {
      key: 'issueDate',
      header: 'الإصدار',
      defaultHidden: true,
      exportValue: (r) => r.issueDate,
      render: (r) => <span className="text-xs text-ink-muted">{formatDate(r.issueDate)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'end',
      render: (r) => (
        <div className="flex justify-end gap-1">
          {perms.canEdit && r.status === 'DRAFT' && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              title="إرسال"
              onClick={async () => {
                const res = await sendInvoiceAction(r.id);
                toast[res.ok ? 'success' : 'error'](res.ok ? 'تم إرسال الفاتورة' : res.error);
                router.refresh();
              }}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
          {perms.canRecordPayment && r.paidMinor < r.totalMinor && r.status !== 'CANCELLED' && (
            <Button variant="ghost" size="sm" type="button" title="تسجيل دفعة" onClick={() => setPaying(r)}>
              <Wallet className="h-3.5 w-3.5 text-ok" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <FiltersBar
        searchPlaceholder="ابحث برقم الفاتورة أو العميل…"
        filters={[
          { key: 'status', label: 'الحالة', options: labelOptions('invoiceStatus') },
          {
            key: 'clientId',
            label: 'العميل',
            options: options.clients.map((c) => ({ value: c.id, label: c.brandName || c.legalName })),
          },
        ]}
      />

      <DataTable
        rows={rows}
        columns={columns}
        getKey={(r) => r.id}
        rowHref={(r) => `/invoices/${r.id}`}
        total={total}
        page={page}
        pageSize={pageSize}
        storageKey="invoices"
        exportName="invoices"
        canExport={perms.canExport}
        emptyTitle="لا توجد فواتير"
        emptyDescription="أنشئ فاتورة يدويًا أو من عرض سعر مقبول."
      />

      <Drawer
        open={paying !== null}
        onClose={() => setPaying(null)}
        title="تسجيل دفعة"
        description={
          paying
            ? `${paying.number} — المتبقي ${formatMoney(paying.totalMinor - paying.paidMinor, paying.currency)}`
            : undefined
        }
        width="sm"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!paying) return;
            const fd = new FormData(e.currentTarget);
            setPending(true);
            const res = await recordPaymentAction({
              ...Object.fromEntries(fd.entries()),
              invoiceId: paying.id,
              clientId: paying.client.id,
              currency: paying.currency,
            });
            setPending(false);
            if (!res.ok) return toast.error(res.error);
            toast.success('تم تسجيل الدفعة وتحديث حالة الفاتورة');
            setPaying(null);
            router.refresh();
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
              defaultValue={paying ? (paying.totalMinor - paying.paidMinor) / 100 : 0}
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
              تسجيل الدفعة
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}

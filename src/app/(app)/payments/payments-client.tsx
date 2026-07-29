'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { FiltersBar } from '@/components/filters-bar';
import { Drawer, ConfirmDialog } from '@/components/ui/drawer';
import { Badge, Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatMoney } from '@/lib/format';
import { label, options as labelOptions } from '@/i18n/labels';
import { recordPaymentAction, deletePaymentAction } from '../invoices/actions';

interface Row {
  id: string;
  amountMinor: number;
  currency: string;
  paidAt: string;
  method: string;
  reference: string | null;
  notes: string | null;
  client: { id: string; legalName: string; brandName: string | null };
  invoice: { id: string; number: string } | null;
  recordedBy: { name: string };
}

export function PaymentsClient({
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
  options: {
    clients: { id: string; legalName: string; brandName: string | null; currency: string }[];
  };
  perms: { canCreate: boolean; canDelete: boolean; canExport: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<Row | null>(null);
  const [pending, setPending] = React.useState(false);

  const columns: Column<Row>[] = [
    {
      key: 'client',
      header: 'العميل',
      primary: true,
      exportValue: (r) => r.client.legalName,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{r.client.brandName || r.client.legalName}</p>
          {r.invoice && (
            <Link href={`/invoices/${r.invoice.id}`} className="num text-[11px] text-brand hover:underline">
              {r.invoice.number}
            </Link>
          )}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'المبلغ',
      align: 'end',
      exportValue: (r) => r.amountMinor / 100,
      render: (r) => (
        <span className="num text-sm font-medium text-ok">{formatMoney(r.amountMinor, r.currency)}</span>
      ),
    },
    {
      key: 'paidAt',
      header: 'تاريخ الدفع',
      exportValue: (r) => r.paidAt,
      render: (r) => <span className="text-xs text-ink-muted">{formatDate(r.paidAt)}</span>,
    },
    {
      key: 'method',
      header: 'الطريقة',
      exportValue: (r) => label('paymentMethod', r.method),
      render: (r) => <Badge tone="neutral">{label('paymentMethod', r.method)}</Badge>,
    },
    {
      key: 'reference',
      header: 'المرجع',
      exportValue: (r) => r.reference ?? '',
      render: (r) => (
        <span className="num text-xs text-ink-faint" dir="ltr">
          {r.reference ?? '—'}
        </span>
      ),
    },
    {
      key: 'recordedBy',
      header: 'سجّلها',
      exportValue: (r) => r.recordedBy.name,
      render: (r) => <span className="text-xs text-ink-muted">{r.recordedBy.name}</span>,
    },
    ...(perms.canDelete
      ? [
          {
            key: 'actions',
            header: '',
            align: 'end' as const,
            render: (r: Row) => (
              <Button variant="ghost" size="sm" type="button" onClick={() => setConfirmDelete(r)}>
                <Trash2 className="h-3.5 w-3.5 text-danger" />
              </Button>
            ),
          } satisfies Column<Row>,
        ]
      : []),
  ];

  return (
    <>
      <FiltersBar
        searchPlaceholder="بحث…"
        filters={[
          {
            key: 'clientId',
            label: 'العميل',
            options: options.clients.map((c) => ({ value: c.id, label: c.brandName || c.legalName })),
          },
        ]}
      >
        {perms.canCreate && (
          <Button onClick={() => setCreateOpen(true)} type="button">
            <Plus className="h-4 w-4" />
            تسجيل دفعة
          </Button>
        )}
      </FiltersBar>

      <DataTable
        rows={rows}
        columns={columns}
        getKey={(r) => r.id}
        total={total}
        page={page}
        pageSize={pageSize}
        storageKey="payments"
        exportName="payments"
        canExport={perms.canExport}
        emptyTitle="لا توجد مدفوعات"
        emptyDescription="سجّل الدفعات من صفحة الفاتورة أو مباشرة من هنا."
      />

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="تسجيل دفعة"
        description="يمكن ربط الدفعة بفاتورة أو تسجيلها كدفعة عامة على حساب العميل."
        width="sm"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setPending(true);
            const res = await recordPaymentAction(Object.fromEntries(fd.entries()));
            setPending(false);
            if (!res.ok) return toast.error(res.error);
            toast.success('تم تسجيل الدفعة');
            setCreateOpen(false);
            router.refresh();
          }}
          className="space-y-4"
        >
          <Field label="العميل" required>
            <Select name="clientId" required>
              <option value="">— اختر —</option>
              {options.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.brandName || c.legalName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="المبلغ" required>
            <Input name="amount" type="number" min={0.01} step="0.01" dir="ltr" required />
          </Field>
          <Field label="العملة">
            <Select name="currency" defaultValue="EGP">
              <option value="EGP">EGP</option>
              <option value="SAR">SAR</option>
              <option value="USD">USD</option>
              <option value="AED">AED</option>
            </Select>
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

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="حذف الدفعة"
        message="سيتم حذف الدفعة وإعادة احتساب حالة الفاتورة المرتبطة تلقائيًا."
        confirmLabel="حذف"
        onConfirm={async () => {
          if (!confirmDelete) return;
          const res = await deletePaymentAction(confirmDelete.id);
          toast[res.ok ? 'success' : 'error'](res.ok ? 'تم الحذف' : res.error);
          setConfirmDelete(null);
          router.refresh();
        }}
      />
    </>
  );
}

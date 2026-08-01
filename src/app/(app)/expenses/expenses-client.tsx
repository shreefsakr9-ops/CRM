'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { FiltersBar } from '@/components/filters-bar';
import { DateRangeFilter } from '@/components/date-range-filter';
import { Drawer, ConfirmDialog } from '@/components/ui/drawer';
import { Badge, Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatMoney } from '@/lib/format';
import { label, options as labelOptions } from '@/i18n/labels';
import { createExpenseAction, deleteExpenseAction } from '../invoices/actions';

interface Row {
  id: string;
  category: string;
  description: string;
  vendor: string | null;
  amountMinor: number;
  currency: string;
  spentOn: string;
  project: { id: string; name: string } | null;
  client: { id: string; legalName: string; brandName: string | null } | null;
  recordedBy: { name: string };
}

export function ExpensesClient({
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
    projects: { id: string; name: string; clientId: string }[];
    clients: { id: string; legalName: string; brandName: string | null }[];
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
      key: 'description',
      header: 'المصروف',
      primary: true,
      exportValue: (r) => r.description,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{r.description}</p>
          <p className="truncate text-[11px] text-ink-faint">
            {[r.vendor, r.project?.name].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'التصنيف',
      exportValue: (r) => label('expenseCategory', r.category),
      render: (r) => <Badge tone="neutral">{label('expenseCategory', r.category)}</Badge>,
    },
    {
      key: 'amount',
      header: 'المبلغ',
      align: 'end',
      exportValue: (r) => r.amountMinor / 100,
      render: (r) => (
        <span className="num text-sm font-medium text-warn">{formatMoney(r.amountMinor, r.currency)}</span>
      ),
    },
    {
      key: 'spentOn',
      header: 'تاريخ الصرف',
      exportValue: (r) => r.spentOn,
      render: (r) => <span className="text-xs text-ink-muted">{formatDate(r.spentOn)}</span>,
    },
    {
      key: 'client',
      header: 'العميل',
      defaultHidden: true,
      exportValue: (r) => r.client?.legalName ?? '',
      render: (r) => (
        <span className="text-xs text-ink-muted">
          {r.client?.brandName || r.client?.legalName || '—'}
        </span>
      ),
    },
    {
      key: 'recordedBy',
      header: 'سجّله',
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
          { key: 'category', label: 'التصنيف', options: labelOptions('expenseCategory') },
          {
            key: 'projectId',
            label: 'المشروع',
            options: options.projects.map((p) => ({ value: p.id, label: p.name })),
          },
        ]}
      >
        <DateRangeFilter />
        {perms.canCreate && (
          <Button onClick={() => setCreateOpen(true)} type="button">
            <Plus className="h-4 w-4" />
            تسجيل مصروف
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
        storageKey="expenses"
        exportName="expenses"
        canExport={perms.canExport}
        emptyTitle="لا توجد مصروفات"
        emptyDescription="سجّل التكاليف المباشرة (فريلانسرز، إنتاج، انتقالات…) لتظهر في ربحية المشاريع."
      />

      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="تسجيل مصروف" width="sm">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setPending(true);
            const res = await createExpenseAction(Object.fromEntries(fd.entries()));
            setPending(false);
            if (!res.ok) return toast.error(res.error);
            toast.success('تم تسجيل المصروف');
            setCreateOpen(false);
            router.refresh();
          }}
          className="space-y-4"
        >
          <Field label="الوصف" required>
            <Input name="description" required minLength={2} />
          </Field>
          <Field label="التصنيف" required>
            <Select name="category" defaultValue="OTHER" options={labelOptions('expenseCategory')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
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
          </div>
          <Field label="تاريخ الصرف" required>
            <Input
              name="spentOn"
              type="date"
              dir="ltr"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Field label="المشروع" hint="ضروري لاحتساب ربحية المشروع">
            <Select name="projectId">
              <option value="">— بدون —</option>
              {options.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="العميل">
            <Select name="clientId">
              <option value="">— بدون —</option>
              {options.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.brandName || c.legalName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="المورد">
            <Input name="vendor" />
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
        title="حذف المصروف"
        message={`سيتم حذف «${confirmDelete?.description}» حذفًا ناعمًا وسيُعاد احتساب ربحية المشروع.`}
        confirmLabel="حذف"
        onConfirm={async () => {
          if (!confirmDelete) return;
          const res = await deleteExpenseAction(confirmDelete.id);
          toast[res.ok ? 'success' : 'error'](res.ok ? 'تم الحذف' : res.error);
          setConfirmDelete(null);
          router.refresh();
        }}
      />
    </>
  );
}

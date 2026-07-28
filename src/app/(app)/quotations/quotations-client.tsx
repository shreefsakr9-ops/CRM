'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { FiltersBar } from '@/components/filters-bar';
import { ConfirmDialog } from '@/components/ui/drawer';
import { Badge, Button } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatMoney } from '@/lib/format';
import { label, tone, options as labelOptions } from '@/i18n/labels';
import { deleteQuotationAction } from './actions';

interface Row {
  id: string;
  number: string;
  version: number;
  status: string;
  issueDate: string;
  expiryDate: string;
  totalMinor: number | null;
  currency: string;
  client: { id: string; legalName: string; brandName: string | null } | null;
  lead: { id: string; fullName: string } | null;
  preparedBy: { id: string; name: string };
  approvedBy: { name: string } | null;
  _count: { items: number; versions: number };
}

export function QuotationsClient({
  rows,
  total,
  page,
  pageSize,
  clients,
  perms,
}: {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  clients: { id: string; legalName: string; brandName: string | null }[];
  perms: { canDelete: boolean; canExport: boolean; canViewMoney: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = React.useState<Row | null>(null);

  const columns: Column<Row>[] = [
    {
      key: 'number',
      header: 'رقم العرض',
      primary: true,
      exportValue: (r) => r.number,
      render: (r) => (
        <div className="min-w-0">
          <p className="num truncate text-sm">{r.number}</p>
          <p className="truncate text-[11px] text-ink-faint">
            {r.client?.brandName || r.client?.legalName || r.lead?.fullName || '—'}
            {r._count.versions > 0 && ` · ${r._count.versions + 1} نسخة`}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      exportValue: (r) => label('quotationStatus', r.status),
      render: (r) => (
        <Badge tone={tone('quotationStatus', r.status)}>{label('quotationStatus', r.status)}</Badge>
      ),
    },
    {
      key: 'total',
      header: 'الإجمالي',
      align: 'end',
      exportValue: (r) => (r.totalMinor ?? 0) / 100,
      render: (r) =>
        r.totalMinor !== null ? (
          <span className="num text-xs">{formatMoney(r.totalMinor, r.currency)}</span>
        ) : (
          <span className="text-[11px] text-ink-faint">—</span>
        ),
    },
    {
      key: 'issueDate',
      header: 'تاريخ الإصدار',
      exportValue: (r) => r.issueDate,
      render: (r) => <span className="text-xs text-ink-muted">{formatDate(r.issueDate)}</span>,
    },
    {
      key: 'expiryDate',
      header: 'صالح حتى',
      exportValue: (r) => r.expiryDate,
      render: (r) => {
        const expired = new Date(r.expiryDate) < new Date();
        return (
          <span className={expired ? 'text-xs text-danger' : 'text-xs text-ink-muted'}>
            {formatDate(r.expiryDate)}
          </span>
        );
      },
    },
    {
      key: 'preparedBy',
      header: 'أعدّه',
      exportValue: (r) => r.preparedBy.name,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-xs text-ink-muted">{r.preparedBy.name}</p>
          {r.approvedBy && (
            <p className="truncate text-[10px] text-ok">اعتمده {r.approvedBy.name}</p>
          )}
        </div>
      ),
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
        searchPlaceholder="ابحث برقم العرض أو اسم العميل…"
        filters={[
          { key: 'status', label: 'الحالة', options: labelOptions('quotationStatus') },
          {
            key: 'clientId',
            label: 'العميل',
            options: clients.map((c) => ({ value: c.id, label: c.brandName || c.legalName })),
          },
        ]}
      />

      <DataTable
        rows={rows}
        columns={columns}
        getKey={(r) => r.id}
        rowHref={(r) => `/quotations/${r.id}`}
        total={total}
        page={page}
        pageSize={pageSize}
        storageKey="quotations"
        exportName="quotations"
        canExport={perms.canExport}
        emptyTitle="لا توجد عروض أسعار"
        emptyDescription="ابدأ بإنشاء عرض سعر من صفقة أو عميل محتمل."
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="حذف عرض السعر"
        message={`سيتم حذف «${confirmDelete?.number}» حذفًا ناعمًا. العروض المقبولة لا يمكن حذفها.`}
        confirmLabel="حذف"
        onConfirm={async () => {
          if (!confirmDelete) return;
          const res = await deleteQuotationAction(confirmDelete.id);
          toast[res.ok ? 'success' : 'error'](res.ok ? 'تم الحذف' : res.error);
          setConfirmDelete(null);
          router.refresh();
        }}
      />
    </>
  );
}

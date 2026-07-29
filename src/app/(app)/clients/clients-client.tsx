'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { FiltersBar } from '@/components/filters-bar';
import { Drawer, ConfirmDialog } from '@/components/ui/drawer';
import { Avatar, Badge, Button } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/format';
import { RelativeTime } from '@/components/relative-time';
import { label, tone, options as labelOptions } from '@/i18n/labels';
import { deleteClientAction } from './actions';
import { ClientForm } from './client-form';

interface Row {
  id: string;
  legalName: string;
  brandName: string | null;
  type: string;
  industry: string | null;
  city: string | null;
  countryCode: string | null;
  status: string;
  currency: string;
  renewalDate: string | null;
  lastContactAt: string | null;
  satisfaction: number | null;
  accountManager: { id: string; name: string; avatarUrl: string | null } | null;
  salesOwner: { id: string; name: string } | null;
  _count: { projects: number; contracts: number; invoices: number; contacts: number };
}

export function ClientsClient({
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
  options: { users: { id: string; name: string }[]; countries: { code: string; nameAr: string }[] };
  perms: { canCreate: boolean; canEdit: boolean; canDelete: boolean; canExport: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<Row | null>(null);

  const columns: Column<Row>[] = [
    {
      key: 'legalName',
      header: 'العميل',
      primary: true,
      sortable: true,
      exportValue: (r) => r.legalName,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{r.brandName || r.legalName}</p>
          <p className="truncate text-[11px] text-ink-faint">
            {[r.industry, r.city].filter(Boolean).join(' · ') || r.legalName}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      exportValue: (r) => label('clientStatus', r.status),
      render: (r) => <Badge tone={tone('clientStatus', r.status)}>{label('clientStatus', r.status)}</Badge>,
    },
    {
      key: 'accountManager',
      header: 'مدير الحساب',
      exportValue: (r) => r.accountManager?.name ?? '',
      render: (r) =>
        r.accountManager ? (
          <div className="flex items-center gap-1.5">
            <Avatar name={r.accountManager.name} src={r.accountManager.avatarUrl} size={22} />
            <span className="truncate text-xs text-ink-muted">{r.accountManager.name}</span>
          </div>
        ) : (
          <Badge tone="warn">غير محدد</Badge>
        ),
    },
    {
      key: 'counts',
      header: 'المشاريع / العقود',
      align: 'center',
      exportValue: (r) => `${r._count.projects}/${r._count.contracts}`,
      render: (r) => (
        <span className="num text-xs text-ink-muted">
          {r._count.projects} / {r._count.contracts}
        </span>
      ),
    },
    {
      key: 'renewalDate',
      header: 'تاريخ التجديد',
      sortable: true,
      exportValue: (r) => r.renewalDate ?? '',
      render: (r) => {
        if (!r.renewalDate) return <span className="text-xs text-ink-faint">—</span>;
        const days = (new Date(r.renewalDate).getTime() - Date.now()) / 86_400_000;
        return (
          <span className={days < 30 ? 'text-xs text-warn' : 'text-xs text-ink-muted'}>
            {formatDate(r.renewalDate)}
          </span>
        );
      },
    },
    {
      key: 'lastContactAt',
      header: 'آخر تواصل',
      sortable: true,
      defaultHidden: true,
      exportValue: (r) => r.lastContactAt ?? '',
      render: (r) => (
        <RelativeTime value={r.lastContactAt} className="text-xs text-ink-muted" />
      ),
    },
    {
      key: 'satisfaction',
      header: 'الرضا',
      align: 'center',
      defaultHidden: true,
      exportValue: (r) => r.satisfaction ?? '',
      render: (r) => (r.satisfaction ? <span className="num text-xs">{r.satisfaction}/5</span> : '—'),
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
        searchPlaceholder="ابحث باسم العميل أو الرقم الضريبي…"
        filters={[
          { key: 'status', label: 'الحالة', options: labelOptions('clientStatus') },
          {
            key: 'accountManagerId',
            label: 'مدير الحساب',
            options: options.users.map((u) => ({ value: u.id, label: u.name })),
          },
        ]}
      >
        {perms.canCreate && (
          <Button onClick={() => setCreateOpen(true)} type="button">
            <Plus className="h-4 w-4" />
            عميل جديد
          </Button>
        )}
      </FiltersBar>

      <DataTable
        rows={rows}
        columns={columns}
        getKey={(r) => r.id}
        rowHref={(r) => `/clients/${r.id}`}
        total={total}
        page={page}
        pageSize={pageSize}
        storageKey="clients"
        exportName="clients"
        canExport={perms.canExport}
        emptyTitle="لا يوجد عملاء"
        emptyDescription="يتم إنشاء العملاء تلقائيًا عند قبول عرض سعر، أو يمكنك إضافتهم يدويًا."
      />

      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="عميل جديد">
        <ClientForm
          initial={null}
          options={options}
          onDone={() => {
            setCreateOpen(false);
            router.refresh();
          }}
        />
      </Drawer>

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="حذف العميل"
        message={`سيتم حذف «${confirmDelete?.legalName}» حذفًا ناعمًا. المشاريع والفواتير المرتبطة ستبقى محفوظة ويمكن استرجاع العميل لاحقًا.`}
        confirmLabel="حذف"
        onConfirm={async () => {
          if (!confirmDelete) return;
          const res = await deleteClientAction(confirmDelete.id);
          toast[res.ok ? 'success' : 'error'](res.ok ? 'تم الحذف' : res.error);
          setConfirmDelete(null);
          router.refresh();
        }}
      />
    </>
  );
}

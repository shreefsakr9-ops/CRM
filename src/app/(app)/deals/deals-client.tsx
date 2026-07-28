'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { FiltersBar } from '@/components/filters-bar';
import { Drawer, ConfirmDialog } from '@/components/ui/drawer';
import { Avatar, Badge, Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatMoney, formatPercent } from '@/lib/format';
import { label, tone, options as labelOptions } from '@/i18n/labels';
import { createDealAction, deleteDealAction } from '../pipeline/actions';

interface Row {
  id: string;
  title: string;
  valueMinor: number | null;
  currency: string;
  probability: number;
  status: string;
  expectedCloseDate: string | null;
  competitor: string | null;
  stage: { id: string; nameAr: string; color: string } | null;
  owner: { id: string; name: string; avatarUrl: string | null } | null;
  client: { id: string; legalName: string; brandName: string | null } | null;
  lead: { id: string; fullName: string } | null;
  service: { nameAr: string } | null;
  lossReason: { nameAr: string } | null;
}

interface Options {
  stages: { id: string; nameAr: string }[];
  users: { id: string; name: string }[];
  clients: { id: string; legalName: string; brandName: string | null }[];
  services: { id: string; nameAr: string }[];
}

export function DealsClient({
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
  options: Options;
  perms: {
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canExport: boolean;
    canAssign: boolean;
    canViewMoney: boolean;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<Row | null>(null);
  const [pending, setPending] = React.useState(false);

  const columns: Column<Row>[] = [
    {
      key: 'title',
      header: 'الصفقة',
      primary: true,
      sortable: true,
      exportValue: (r) => r.title,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{r.title}</p>
          <p className="truncate text-[11px] text-ink-faint">
            {r.client?.brandName || r.client?.legalName || r.lead?.fullName || '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'stage',
      header: 'المرحلة',
      exportValue: (r) => r.stage?.nameAr ?? '',
      render: (r) =>
        r.stage ? (
          <span
            className="inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px]"
            style={{ background: `${r.stage.color}22`, color: r.stage.color }}
          >
            {r.stage.nameAr}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'value',
      header: 'القيمة',
      align: 'end',
      sortable: true,
      exportValue: (r) => (r.valueMinor ?? 0) / 100,
      render: (r) =>
        r.valueMinor !== null ? (
          <span className="num text-xs">{formatMoney(r.valueMinor, r.currency)}</span>
        ) : (
          <span className="text-[11px] text-ink-faint">—</span>
        ),
    },
    {
      key: 'probability',
      header: 'الاحتمالية',
      align: 'end',
      exportValue: (r) => r.probability,
      render: (r) => <span className="num text-xs text-ink-muted">{formatPercent(r.probability, 'ar', 0)}</span>,
    },
    {
      key: 'status',
      header: 'الحالة',
      exportValue: (r) => label('dealStatus', r.status),
      render: (r) => (
        <div className="flex flex-col gap-1">
          <Badge tone={tone('dealStatus', r.status)}>{label('dealStatus', r.status)}</Badge>
          {r.lossReason && <span className="text-[10px] text-ink-faint">{r.lossReason.nameAr}</span>}
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'المسؤول',
      exportValue: (r) => r.owner?.name ?? '',
      render: (r) =>
        r.owner ? (
          <div className="flex items-center gap-1.5">
            <Avatar name={r.owner.name} src={r.owner.avatarUrl} size={22} />
            <span className="truncate text-xs text-ink-muted">{r.owner.name}</span>
          </div>
        ) : (
          '—'
        ),
    },
    {
      key: 'expectedCloseDate',
      header: 'الإغلاق المتوقع',
      sortable: true,
      exportValue: (r) => r.expectedCloseDate ?? '',
      render: (r) => <span className="text-xs text-ink-muted">{formatDate(r.expectedCloseDate)}</span>,
    },
    {
      key: 'service',
      header: 'الخدمة',
      defaultHidden: true,
      exportValue: (r) => r.service?.nameAr ?? '',
      render: (r) => <span className="text-xs text-ink-muted">{r.service?.nameAr ?? '—'}</span>,
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
        searchPlaceholder="ابحث بعنوان الصفقة…"
        filters={[
          { key: 'stageId', label: 'المرحلة', options: options.stages.map((s) => ({ value: s.id, label: s.nameAr })) },
          { key: 'status', label: 'الحالة', options: labelOptions('dealStatus') },
          { key: 'ownerId', label: 'المسؤول', options: options.users.map((u) => ({ value: u.id, label: u.name })) },
        ]}
      >
        {perms.canCreate && (
          <Button onClick={() => setCreateOpen(true)} type="button">
            <Plus className="h-4 w-4" />
            صفقة جديدة
          </Button>
        )}
      </FiltersBar>

      <DataTable
        rows={rows}
        columns={columns}
        getKey={(r) => r.id}
        rowHref={(r) => `/deals/${r.id}`}
        total={total}
        page={page}
        pageSize={pageSize}
        storageKey="deals"
        exportName="deals"
        canExport={perms.canExport}
        emptyTitle="لا توجد صفقات"
        emptyDescription="تُنشأ الصفقات تلقائيًا عند تأهيل عميل محتمل، أو يمكنك إنشاؤها يدويًا."
      />

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="صفقة جديدة"
        description="اربطها بعميل حالي أو اتركها مرتبطة بعميل محتمل."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setPending(true);
            const res = await createDealAction(Object.fromEntries(fd.entries()));
            setPending(false);
            if (!res.ok) return toast.error(res.error);
            toast.success('تم إنشاء الصفقة');
            setCreateOpen(false);
            router.refresh();
          }}
          className="space-y-4"
        >
          <Field label="عنوان الصفقة" required>
            <Input name="title" required minLength={2} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
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
            <Field label="الخدمة">
              <Select name="serviceId">
                <option value="">— بدون —</option>
                {options.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nameAr}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="القيمة" required>
              <Input name="value" type="number" min={0} step="0.01" dir="ltr" required />
            </Field>
            <Field label="العملة">
              <Select name="currency" defaultValue="EGP">
                <option value="EGP">EGP</option>
                <option value="SAR">SAR</option>
                <option value="USD">USD</option>
                <option value="AED">AED</option>
              </Select>
            </Field>
            <Field label="المرحلة" required>
              <Select name="stageId" required>
                {options.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nameAr}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="المسؤول">
              <Select name="ownerId" disabled={!perms.canAssign}>
                <option value="">— أنا —</option>
                {options.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="تاريخ الإغلاق المتوقع">
              <Input name="expectedCloseDate" type="date" dir="ltr" />
            </Field>
            <Field label="المنافس">
              <Input name="competitor" />
            </Field>
          </div>
          <Field label="الاعتراضات / ملاحظات">
            <Textarea name="objections" rows={3} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={pending}>
              إنشاء
            </Button>
          </div>
        </form>
      </Drawer>

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="حذف الصفقة"
        message={`سيتم حذف «${confirmDelete?.title}» حذفًا ناعمًا ويمكن استرجاعها لاحقًا.`}
        confirmLabel="حذف"
        onConfirm={async () => {
          if (!confirmDelete) return;
          const res = await deleteDealAction(confirmDelete.id);
          toast[res.ok ? 'success' : 'error'](res.ok ? 'تم الحذف' : res.error);
          setConfirmDelete(null);
          router.refresh();
        }}
      />
    </>
  );
}

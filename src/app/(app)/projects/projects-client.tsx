'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { FiltersBar } from '@/components/filters-bar';
import { ConfirmDialog } from '@/components/ui/drawer';
import { Avatar, Badge, Button, Progress } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatMoney, daysBetween } from '@/lib/format';
import { label, tone, options as labelOptions } from '@/i18n/labels';
import { deleteProjectAction } from './actions';

interface Row {
  id: string;
  code: string;
  name: string;
  status: string;
  priority: string;
  progressPercent: number;
  startDate: string;
  endDate: string | null;
  budgetMinor: number | null;
  currency: string;
  client: { id: string; legalName: string; brandName: string | null };
  owner: { id: string; name: string; avatarUrl: string | null };
  accountManager: { id: string; name: string } | null;
  members: { user: { id: string; name: string; avatarUrl: string | null } }[];
  _count: { tasks: number; deliverables: number };
}

export function ProjectsClient({
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
    clients: { id: string; legalName: string; brandName: string | null }[];
    users: { id: string; name: string }[];
  };
  perms: { canDelete: boolean; canExport: boolean; canViewMoney: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = React.useState<Row | null>(null);

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'المشروع',
      primary: true,
      exportValue: (r) => r.name,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{r.name}</p>
          <p className="num truncate text-[11px] text-ink-faint">
            {r.code} · {r.client.brandName || r.client.legalName}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      exportValue: (r) => label('projectStatus', r.status),
      render: (r) => (
        <Badge tone={tone('projectStatus', r.status)}>{label('projectStatus', r.status)}</Badge>
      ),
    },
    {
      key: 'progress',
      header: 'الإنجاز',
      width: '140px',
      exportValue: (r) => r.progressPercent,
      render: (r) => (
        <Progress
          value={r.progressPercent}
          showLabel
          tone={r.progressPercent >= 100 ? 'ok' : r.progressPercent < 40 ? 'warn' : 'brand'}
        />
      ),
    },
    {
      key: 'team',
      header: 'الفريق',
      exportValue: (r) => r.members.map((m) => m.user.name).join(' | '),
      render: (r) => (
        <div className="flex -space-x-1.5 space-x-reverse">
          {r.members.slice(0, 4).map((m) => (
            <Avatar
              key={m.user.id}
              name={m.user.name}
              src={m.user.avatarUrl}
              size={22}
              className="ring-2 ring-surface-raised"
            />
          ))}
          {r.members.length > 4 && (
            <span className="num flex h-[22px] w-[22px] items-center justify-center rounded-full bg-navy-800 text-[9px] text-ink-muted ring-2 ring-surface-raised">
              +{r.members.length - 4}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'endDate',
      header: 'التسليم',
      exportValue: (r) => r.endDate ?? '',
      render: (r) => {
        if (!r.endDate) return <span className="text-xs text-ink-faint">—</span>;
        const days = daysBetween(r.endDate);
        const late = days < 0 && !['COMPLETED', 'CANCELLED'].includes(r.status);
        return (
          <div>
            <span className={late ? 'text-xs text-danger' : 'text-xs text-ink-muted'}>
              {formatDate(r.endDate)}
            </span>
            {late && <p className="num text-[10px] text-danger">متأخر {Math.abs(days)} يوم</p>}
          </div>
        );
      },
    },
    {
      key: 'tasks',
      header: 'المهام',
      align: 'center',
      exportValue: (r) => r._count.tasks,
      render: (r) => <span className="num text-xs text-ink-muted">{r._count.tasks}</span>,
    },
    {
      key: 'budget',
      header: 'الميزانية',
      align: 'end',
      defaultHidden: true,
      exportValue: (r) => (r.budgetMinor ?? 0) / 100,
      render: (r) =>
        r.budgetMinor !== null ? (
          <span className="num text-xs">{formatMoney(r.budgetMinor, r.currency)}</span>
        ) : (
          '—'
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
        searchPlaceholder="ابحث باسم المشروع أو الكود…"
        filters={[
          { key: 'status', label: 'الحالة', options: labelOptions('projectStatus') },
          {
            key: 'clientId',
            label: 'العميل',
            options: options.clients.map((c) => ({ value: c.id, label: c.brandName || c.legalName })),
          },
          {
            key: 'ownerId',
            label: 'المسؤول',
            options: options.users.map((u) => ({ value: u.id, label: u.name })),
          },
        ]}
      />

      <DataTable
        rows={rows}
        columns={columns}
        getKey={(r) => r.id}
        rowHref={(r) => `/projects/${r.id}`}
        total={total}
        page={page}
        pageSize={pageSize}
        storageKey="projects"
        exportName="projects"
        canExport={perms.canExport}
        emptyTitle="لا توجد مشاريع"
        emptyDescription="أنشئ مشروعًا من قالب جاهز ليتم توليد كل المهام والاعتماديات تلقائيًا."
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="حذف المشروع"
        message={`سيتم حذف «${confirmDelete?.name}» ومهامه حذفًا ناعمًا. يمكن استرجاعه لاحقًا.`}
        confirmLabel="حذف"
        onConfirm={async () => {
          if (!confirmDelete) return;
          const res = await deleteProjectAction(confirmDelete.id);
          toast[res.ok ? 'success' : 'error'](res.ok ? 'تم الحذف' : res.error);
          setConfirmDelete(null);
          router.refresh();
        }}
      />
    </>
  );
}

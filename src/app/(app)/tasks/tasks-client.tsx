'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, CheckCircle2 } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { FiltersBar } from '@/components/filters-bar';
import { DateRangeFilter } from '@/components/date-range-filter';
import { ConfirmDialog } from '@/components/ui/drawer';
import { Avatar, Badge, Button } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/format';
import { label, tone, options as labelOptions } from '@/i18n/labels';
import { deleteTaskAction, changeTaskStatusAction } from './actions';

interface Row {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  requiresApproval: boolean;
  actualMinutes: number;
  estimateMinutes: number | null;
  project: { id: string; name: string; code: string } | null;
  client: { id: string; legalName: string; brandName: string | null } | null;
  department: { nameAr: string } | null;
  assignees: { user: { id: string; name: string; avatarUrl: string | null } }[];
  checklist: { id: string; isDone: boolean; isRequired: boolean }[];
  _count: { subtasks: number; dependencies: number };
}

export function TasksClient({
  rows,
  total,
  page,
  pageSize,
  options,
  perms,
  hideFilters,
}: {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  options: {
    users: { id: string; name: string }[];
    projects: { id: string; name: string }[];
    departments: { id: string; nameAr: string }[];
  };
  perms: { canDelete: boolean; canExport: boolean; canEdit: boolean };
  hideFilters?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = React.useState<Row | null>(null);
  const now = Date.now();

  const columns: Column<Row>[] = [
    {
      key: 'title',
      header: 'المهمة',
      primary: true,
      exportValue: (r) => r.title,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{r.title}</p>
          <p className="truncate text-[11px] text-ink-faint">
            {[r.project?.name, r.client?.brandName || r.client?.legalName, r.department?.nameAr]
              .filter(Boolean)
              .join(' · ') || '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      exportValue: (r) => label('taskStatus', r.status),
      render: (r) => <Badge tone={tone('taskStatus', r.status)}>{label('taskStatus', r.status)}</Badge>,
    },
    {
      key: 'priority',
      header: 'الأولوية',
      exportValue: (r) => label('priority', r.priority),
      render: (r) => <Badge tone={tone('priority', r.priority)}>{label('priority', r.priority)}</Badge>,
    },
    {
      key: 'assignees',
      header: 'المسؤولون',
      exportValue: (r) => r.assignees.map((a) => a.user.name).join(' | '),
      render: (r) =>
        r.assignees.length === 0 ? (
          <Badge tone="warn">غير مسندة</Badge>
        ) : (
          <div className="flex -space-x-1.5 space-x-reverse">
            {r.assignees.slice(0, 3).map((a) => (
              <Avatar
                key={a.user.id}
                name={a.user.name}
                src={a.user.avatarUrl}
                size={22}
                className="ring-2 ring-surface-raised"
              />
            ))}
          </div>
        ),
    },
    {
      key: 'dueDate',
      header: 'الاستحقاق',
      exportValue: (r) => r.dueDate ?? '',
      render: (r) => {
        if (!r.dueDate) return <span className="text-xs text-ink-faint">—</span>;
        const overdue =
          new Date(r.dueDate).getTime() < now && !['COMPLETED', 'APPROVED', 'CANCELLED'].includes(r.status);
        return (
          <span className={overdue ? 'text-xs text-danger' : 'text-xs text-ink-muted'}>
            {formatDate(r.dueDate)}
          </span>
        );
      },
    },
    {
      key: 'checklist',
      header: 'قائمة التحقق',
      align: 'center',
      exportValue: (r) => `${r.checklist.filter((c) => c.isDone).length}/${r.checklist.length}`,
      render: (r) =>
        r.checklist.length === 0 ? (
          <span className="text-[11px] text-ink-faint">—</span>
        ) : (
          <span className="num text-xs text-ink-muted">
            {r.checklist.filter((c) => c.isDone).length}/{r.checklist.length}
          </span>
        ),
    },
    {
      key: 'time',
      header: 'الوقت (فعلي/مقدر)',
      align: 'center',
      defaultHidden: true,
      exportValue: (r) => `${r.actualMinutes}/${r.estimateMinutes ?? 0}`,
      render: (r) => (
        <span className="num text-xs text-ink-muted">
          {Math.round(r.actualMinutes / 6) / 10}س / {r.estimateMinutes ? Math.round(r.estimateMinutes / 6) / 10 : 0}س
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'end',
      render: (r) => (
        <div className="flex justify-end gap-1">
          {perms.canEdit && !['COMPLETED', 'APPROVED', 'CANCELLED'].includes(r.status) && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              title={r.requiresApproval ? 'إرسال للمراجعة' : 'إنهاء المهمة'}
              onClick={async () => {
                const res = await changeTaskStatusAction(
                  r.id,
                  r.requiresApproval ? 'WAITING_INTERNAL_REVIEW' : 'COMPLETED',
                );
                toast[res.ok ? 'success' : 'error'](res.ok ? 'تم التحديث' : res.error);
                router.refresh();
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-ok" />
            </Button>
          )}
          {perms.canDelete && (
            <Button variant="ghost" size="sm" type="button" onClick={() => setConfirmDelete(r)}>
              <Trash2 className="h-3.5 w-3.5 text-danger" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      {!hideFilters && (
        <FiltersBar
          searchPlaceholder="ابحث بعنوان المهمة…"
          filters={[
            { key: 'status', label: 'الحالة', options: labelOptions('taskStatus') },
            { key: 'priority', label: 'الأولوية', options: labelOptions('priority') },
            {
              key: 'projectId',
              label: 'المشروع',
              options: options.projects.map((p) => ({ value: p.id, label: p.name })),
            },
            {
              key: 'assigneeId',
              label: 'المسؤول',
              options: options.users.map((u) => ({ value: u.id, label: u.name })),
            },
            {
              key: 'departmentId',
              label: 'القسم',
              options: options.departments.map((d) => ({ value: d.id, label: d.nameAr })),
            },
          ]}
          quickFilters={[
            { key: 'filter', value: 'mine', label: 'مهامي' },
            { key: 'filter', value: 'today', label: 'مستحقة اليوم' },
            { key: 'filter', value: 'overdue', label: 'متأخرة' },
            { key: 'filter', value: 'week', label: 'هذا الأسبوع' },
          ]}
        >
          <DateRangeFilter />
        </FiltersBar>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        getKey={(r) => r.id}
        rowHref={(r) => `/tasks/${r.id}`}
        total={total}
        page={page}
        pageSize={pageSize}
        storageKey="tasks"
        exportName="tasks"
        canExport={perms.canExport}
        emptyTitle="لا توجد مهام"
        emptyDescription="أنشئ مهمة أو ولّد مهام مشروع من قالب جاهز."
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="حذف المهمة"
        message={`سيتم حذف «${confirmDelete?.title}» حذفًا ناعمًا ويمكن استرجاعها لاحقًا.`}
        confirmLabel="حذف"
        onConfirm={async () => {
          if (!confirmDelete) return;
          const res = await deleteTaskAction(confirmDelete.id);
          toast[res.ok ? 'success' : 'error'](res.ok ? 'تم الحذف' : res.error);
          setConfirmDelete(null);
          router.refresh();
        }}
      />
    </>
  );
}

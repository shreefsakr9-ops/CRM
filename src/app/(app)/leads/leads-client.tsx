'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { Upload, UserCheck, Trash2, RotateCcw, Phone, MessageCircle } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { FiltersBar } from '@/components/filters-bar';
import { Drawer, ConfirmDialog } from '@/components/ui/drawer';
import { Avatar, Badge, Button, Field, Select, Input } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatMoney, formatRelative } from '@/lib/format';
import { label, tone, options as labelOptions } from '@/i18n/labels';
import { assignLeadsAction, deleteLeadAction, restoreLeadAction, importLeadsAction } from './actions';

interface Row {
  id: string;
  fullName: string;
  companyName: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  status: string;
  priority: string;
  score: number;
  estimatedValueMinor: number | null;
  currency: string;
  nextFollowUpAt: string | null;
  lastContactAt: string | null;
  firstContactAt: string | null;
  createdAt: string;
  deletedAt: string | null;
  source: { nameAr: string } | null;
  assignedTo: { id: string; name: string; avatarUrl: string | null } | null;
  stage: { id: string; nameAr: string; color: string } | null;
  interestedService: { nameAr: string } | null;
}

interface Options {
  sources: { id: string; nameAr: string }[];
  stages: { id: string; nameAr: string }[];
  users: { id: string; name: string }[];
}

export function LeadsClient({
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
    canAssign: boolean;
    canDelete: boolean;
    canRestore: boolean;
    canExport: boolean;
    canCreate: boolean;
    canViewMoney: boolean;
  };
}) {
  const toast = useToast();
  const router = useRouter();
  const [importOpen, setImportOpen] = React.useState(false);
  const [assignOpen, setAssignOpen] = React.useState<string[] | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<Row | null>(null);

  const now = Date.now();

  const columns: Column<Row>[] = [
    {
      key: 'fullName',
      header: 'العميل',
      primary: true,
      sortable: true,
      exportValue: (r) => r.fullName,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{r.fullName}</p>
          {r.companyName && <p className="truncate text-[11px] text-ink-faint">{r.companyName}</p>}
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'التواصل',
      exportValue: (r) => [r.phone, r.email].filter(Boolean).join(' | '),
      render: (r) => (
        <div className="flex items-center gap-1.5">
          {r.phone && (
            <a
              href={`tel:${r.phone}`}
              className="rounded p-1 text-ink-muted hover:bg-navy-800 hover:text-brand"
              title={r.phone}
            >
              <Phone className="h-3.5 w-3.5" />
            </a>
          )}
          {r.whatsapp && (
            <a
              href={`https://wa.me/${r.whatsapp.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded p-1 text-ink-muted hover:bg-navy-800 hover:text-ok"
              title="واتساب"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </a>
          )}
          <span className="num truncate text-[11px] text-ink-faint" dir="ltr">
            {r.phone ?? '—'}
          </span>
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
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px]"
            style={{ background: `${r.stage.color}22`, color: r.stage.color }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: r.stage.color }} />
            {r.stage.nameAr}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'status',
      header: 'الحالة',
      exportValue: (r) => label('leadStatus', r.status),
      render: (r) => <Badge tone={tone('leadStatus', r.status)}>{label('leadStatus', r.status)}</Badge>,
    },
    {
      key: 'source',
      header: 'المصدر',
      exportValue: (r) => r.source?.nameAr ?? '',
      render: (r) => <span className="text-xs text-ink-muted">{r.source?.nameAr ?? '—'}</span>,
    },
    {
      key: 'estimatedValue',
      header: 'القيمة المتوقعة',
      align: 'end',
      sortable: true,
      exportValue: (r) => (r.estimatedValueMinor ?? 0) / 100,
      render: (r) =>
        perms.canViewMoney && r.estimatedValueMinor !== null ? (
          <span className="num text-xs">{formatMoney(r.estimatedValueMinor, r.currency)}</span>
        ) : (
          <span className="text-[11px] text-ink-faint">—</span>
        ),
    },
    {
      key: 'assignedTo',
      header: 'المسؤول',
      exportValue: (r) => r.assignedTo?.name ?? '',
      render: (r) =>
        r.assignedTo ? (
          <div className="flex items-center gap-1.5">
            <Avatar name={r.assignedTo.name} src={r.assignedTo.avatarUrl} size={22} />
            <span className="truncate text-xs text-ink-muted">{r.assignedTo.name}</span>
          </div>
        ) : (
          <Badge tone="warn">غير مسند</Badge>
        ),
    },
    {
      key: 'nextFollowUpAt',
      header: 'المتابعة القادمة',
      sortable: true,
      exportValue: (r) => r.nextFollowUpAt ?? '',
      render: (r) => {
        if (!r.nextFollowUpAt) return <Badge tone="warn">بدون متابعة</Badge>;
        const overdue = new Date(r.nextFollowUpAt).getTime() < now;
        return (
          <span className={overdue ? 'text-xs text-danger' : 'text-xs text-ink-muted'}>
            {formatRelative(r.nextFollowUpAt)}
          </span>
        );
      },
    },
    {
      key: 'priority',
      header: 'الأولوية',
      exportValue: (r) => label('priority', r.priority),
      defaultHidden: true,
      render: (r) => <Badge tone={tone('priority', r.priority)}>{label('priority', r.priority)}</Badge>,
    },
    {
      key: 'createdAt',
      header: 'تاريخ الإضافة',
      sortable: true,
      defaultHidden: true,
      exportValue: (r) => r.createdAt,
      render: (r) => <span className="text-xs text-ink-faint">{formatDate(r.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'end',
      render: (r) => (
        <div className="flex justify-end gap-1">
          {r.deletedAt
            ? perms.canRestore && (
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={async () => {
                    const res = await restoreLeadAction(r.id);
                    toast[res.ok ? 'success' : 'error'](res.ok ? 'تم الاسترجاع' : res.error);
                    router.refresh();
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              )
            : perms.canDelete && (
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
      <FiltersBar
        searchPlaceholder="ابحث بالاسم أو الشركة أو الهاتف…"
        filters={[
          { key: 'stageId', label: 'المرحلة', options: options.stages.map((s) => ({ value: s.id, label: s.nameAr })) },
          { key: 'status', label: 'الحالة', options: labelOptions('leadStatus') },
          { key: 'sourceId', label: 'المصدر', options: options.sources.map((s) => ({ value: s.id, label: s.nameAr })) },
          { key: 'assignedToId', label: 'المسؤول', options: options.users.map((u) => ({ value: u.id, label: u.name })) },
          { key: 'priority', label: 'الأولوية', options: labelOptions('priority') },
        ]}
        quickFilters={[
          { key: 'filter', value: 'uncontacted', label: 'بدون تواصل' },
          { key: 'filter', value: 'followup', label: 'متابعات مستحقة' },
          { key: 'filter', value: 'followup-overdue', label: 'متابعات متأخرة' },
          ...(perms.canRestore ? [{ key: 'filter', value: 'deleted', label: 'المحذوفة' }] : []),
        ]}
      >
        {perms.canCreate && (
          <Button variant="secondary" onClick={() => setImportOpen(true)} type="button">
            <Upload className="h-4 w-4" />
            استيراد CSV
          </Button>
        )}
      </FiltersBar>

      <DataTable
        rows={rows}
        columns={columns}
        getKey={(r) => r.id}
        rowHref={(r) => `/leads/${r.id}`}
        total={total}
        page={page}
        pageSize={pageSize}
        storageKey="leads"
        exportName="leads"
        canExport={perms.canExport}
        emptyTitle="لا يوجد عملاء محتملون"
        emptyDescription="ابدأ بإضافة عميل محتمل أو استورد قائمة من ملف CSV."
        bulkActions={
          perms.canAssign
            ? (selected, clear) => (
                <Button
                  size="sm"
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setAssignOpen(selected);
                    clear();
                  }}
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  إسناد جماعي
                </Button>
              )
            : undefined
        }
      />

      <AssignDrawer
        ids={assignOpen}
        users={options.users}
        onClose={() => setAssignOpen(null)}
        onDone={(n) => {
          toast.success(`تم إسناد ${n} عميل محتمل`);
          router.refresh();
        }}
      />

      <ImportDrawer
        open={importOpen}
        users={options.users}
        onClose={() => setImportOpen(false)}
        onDone={(r) => {
          toast.success(
            `تم استيراد ${r.created} سجل`,
            `${r.duplicates.length} مكرر تم تجاهله · ${r.errors.length} خطأ`,
          );
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="حذف العميل المحتمل"
        message={`سيتم نقل «${confirmDelete?.fullName}» إلى المحذوفات ويمكن استرجاعه لاحقًا. لن تُفقد أي بيانات.`}
        confirmLabel="حذف"
        onConfirm={async () => {
          if (!confirmDelete) return;
          const res = await deleteLeadAction(confirmDelete.id);
          toast[res.ok ? 'success' : 'error'](res.ok ? 'تم الحذف' : res.error);
          setConfirmDelete(null);
          router.refresh();
        }}
      />
    </>
  );
}

function AssignDrawer({
  ids,
  users,
  onClose,
  onDone,
}: {
  ids: string[] | null;
  users: { id: string; name: string }[];
  onClose: () => void;
  onDone: (n: number) => void;
}) {
  const toast = useToast();
  const [assignee, setAssignee] = React.useState('');
  const [pending, setPending] = React.useState(false);

  return (
    <Drawer
      open={ids !== null}
      onClose={onClose}
      title="إسناد جماعي"
      description={`سيتم إسناد ${ids?.length ?? 0} سجل إلى المستخدم المحدد وإشعاره.`}
      width="sm"
    >
      <Field label="المسؤول الجديد" required>
        <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">— اختر —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="mt-4 flex justify-end">
        <Button
          disabled={!assignee}
          loading={pending}
          type="button"
          onClick={async () => {
            if (!ids || !assignee) return;
            setPending(true);
            const res = await assignLeadsAction(ids, assignee);
            setPending(false);
            if (!res.ok) return toast.error(res.error);
            onDone(res.data ?? 0);
            onClose();
          }}
        >
          إسناد
        </Button>
      </div>
    </Drawer>
  );
}

function ImportDrawer({
  open,
  users,
  onClose,
  onDone,
}: {
  open: boolean;
  users: { id: string; name: string }[];
  onClose: () => void;
  onDone: (r: { created: number; duplicates: string[]; errors: { row: number; message: string }[] }) => void;
}) {
  const toast = useToast();
  const [rows, setRows] = React.useState<Record<string, string>[]>([]);
  const [assignee, setAssignee] = React.useState('');
  const [pending, setPending] = React.useState(false);

  const handleFile = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        setRows(result.data);
        toast.info(`تم قراءة ${result.data.length} صف — راجع المعاينة قبل الاستيراد`);
      },
      error: () => toast.error('تعذّر قراءة الملف'),
    });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="استيراد عملاء محتملين"
      description="ملف CSV بالأعمدة: fullName, phone, whatsapp, email, companyName, city, sourceKey, campaign, estimatedValue, notes"
    >
      <div className="space-y-4">
        <Field label="ملف CSV" required>
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </Field>

        <Field label="إسناد كل السجلات إلى" hint="اتركه فارغًا لإسنادها إليك">
          <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">— أنا —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>

        {rows.length > 0 && (
          <div className="rounded-md border border-line">
            <p className="border-b border-line px-3 py-2 text-xs text-ink-muted">
              معاينة أول ٥ صفوف من {rows.length}
            </p>
            <div className="max-h-56 overflow-auto p-3 text-[11px]">
              <table className="w-full">
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-b border-line/50">
                      <td className="py-1 pe-2 text-ink">{r.fullName ?? '—'}</td>
                      <td className="py-1 pe-2 text-ink-faint" dir="ltr">
                        {r.phone ?? '—'}
                      </td>
                      <td className="py-1 text-ink-faint">{r.companyName ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="rounded-md border border-info/25 bg-info/10 px-3 py-2 text-[11px] text-info">
          السجلات المكررة (بنفس الهاتف أو البريد) سيتم تخطيها تلقائيًا ولن تُنشأ مرتين.
        </p>

        <div className="flex justify-end">
          <Button
            disabled={rows.length === 0}
            loading={pending}
            type="button"
            onClick={async () => {
              setPending(true);
              const res = await importLeadsAction(rows as never, assignee || undefined);
              setPending(false);
              if (!res.ok) return toast.error(res.error);
              onDone(res.data!);
              setRows([]);
              onClose();
            }}
          >
            استيراد {rows.length > 0 && `(${rows.length})`}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { FiltersBar } from '@/components/filters-bar';
import { Drawer, ConfirmDialog } from '@/components/ui/drawer';
import { Badge, Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatMoney, daysBetween } from '@/lib/format';
import { label, tone, options as labelOptions } from '@/i18n/labels';
import { saveContractAction, renewContractAction, deleteContractAction } from './actions';

interface Row {
  id: string;
  number: string;
  title: string;
  startDate: string;
  endDate: string;
  renewalDate: string | null;
  autoRenew: boolean;
  valueMinor: number | null;
  currency: string;
  status: string;
  paymentTerms: string | null;
  reminderDays: number[];
  notes: string | null;
  clientId: string;
  quotationId: string | null;
  ownerId: string;
  client: { id: string; legalName: string; brandName: string | null };
  owner: { id: string; name: string };
  quotation: { id: string; number: string } | null;
  services: { serviceId: string; service: { nameAr: string } }[];
}

interface Options {
  clients: { id: string; legalName: string; brandName: string | null }[];
  users: { id: string; name: string }[];
  services: { id: string; nameAr: string }[];
  quotations: { id: string; number: string; clientId: string | null; totalMinor: number; currency: string }[];
}

export function ContractsClient({
  rows,
  total,
  page,
  pageSize,
  options,
  defaults,
  perms,
}: {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  options: Options;
  defaults: { quotationId?: string; clientId?: string };
  perms: {
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canExport: boolean;
    canViewMoney: boolean;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = React.useState<Row | 'new' | null>(
    defaults.quotationId && perms.canCreate ? 'new' : null,
  );
  const [confirmDelete, setConfirmDelete] = React.useState<Row | null>(null);

  const columns: Column<Row>[] = [
    {
      key: 'number',
      header: 'العقد',
      primary: true,
      exportValue: (r) => r.number,
      render: (r) => (
        <div className="min-w-0">
          <p className="num truncate text-sm">{r.number}</p>
          <p className="truncate text-[11px] text-ink-faint">{r.title}</p>
        </div>
      ),
    },
    {
      key: 'client',
      header: 'العميل',
      exportValue: (r) => r.client.legalName,
      render: (r) => (
        <span className="truncate text-xs text-ink-muted">
          {r.client.brandName || r.client.legalName}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      exportValue: (r) => label('contractStatus', r.status),
      render: (r) => (
        <Badge tone={tone('contractStatus', r.status)}>{label('contractStatus', r.status)}</Badge>
      ),
    },
    {
      key: 'value',
      header: 'القيمة',
      align: 'end',
      exportValue: (r) => (r.valueMinor ?? 0) / 100,
      render: (r) =>
        r.valueMinor !== null ? (
          <span className="num text-xs">{formatMoney(r.valueMinor, r.currency)}</span>
        ) : (
          <span className="text-[11px] text-ink-faint">—</span>
        ),
    },
    {
      key: 'period',
      header: 'المدة',
      exportValue: (r) => `${r.startDate} → ${r.endDate}`,
      render: (r) => (
        <span className="text-xs text-ink-muted">
          {formatDate(r.startDate)} → {formatDate(r.endDate)}
        </span>
      ),
    },
    {
      key: 'renewalDate',
      header: 'التجديد',
      exportValue: (r) => r.renewalDate ?? '',
      render: (r) => {
        if (!r.renewalDate) return <span className="text-xs text-ink-faint">—</span>;
        const days = daysBetween(r.renewalDate);
        return (
          <div>
            <span className={days <= 30 ? 'text-xs text-warn' : 'text-xs text-ink-muted'}>
              {formatDate(r.renewalDate)}
            </span>
            {days >= 0 && days <= 30 && (
              <p className="num text-[10px] text-warn">باقي {days} يوم</p>
            )}
            {r.autoRenew && <p className="text-[10px] text-ok">تجديد تلقائي</p>}
          </div>
        );
      },
    },
    ...(perms.canEdit
      ? [
          {
            key: 'actions',
            header: '',
            align: 'end' as const,
            render: (r: Row) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" type="button" onClick={() => setEditing(r)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  title="تجديد لمدة ١٢ شهرًا"
                  onClick={async () => {
                    const res = await renewContractAction(r.id, 12);
                    toast[res.ok ? 'success' : 'error'](
                      res.ok ? 'تم إنشاء عقد تجديد كمسودة' : res.error,
                    );
                    router.refresh();
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                {perms.canDelete && (
                  <Button variant="ghost" size="sm" type="button" onClick={() => setConfirmDelete(r)}>
                    <Trash2 className="h-3.5 w-3.5 text-danger" />
                  </Button>
                )}
              </div>
            ),
          } satisfies Column<Row>,
        ]
      : []),
  ];

  return (
    <>
      <FiltersBar
        searchPlaceholder="ابحث برقم العقد أو العميل…"
        filters={[
          { key: 'status', label: 'الحالة', options: labelOptions('contractStatus') },
          {
            key: 'clientId',
            label: 'العميل',
            options: options.clients.map((c) => ({ value: c.id, label: c.brandName || c.legalName })),
          },
        ]}
        quickFilters={[{ key: 'filter', value: 'renewing', label: 'قريبة التجديد' }]}
      >
        {perms.canCreate && (
          <Button onClick={() => setEditing('new')} type="button">
            <Plus className="h-4 w-4" />
            عقد جديد
          </Button>
        )}
      </FiltersBar>

      <DataTable
        rows={rows}
        columns={columns}
        getKey={(r) => r.id}
        rowHref={(r) => `/contracts/${r.id}`}
        total={total}
        page={page}
        pageSize={pageSize}
        storageKey="contracts"
        exportName="contracts"
        canExport={perms.canExport}
        emptyTitle="لا توجد عقود"
        emptyDescription="أنشئ عقدًا من عرض سعر مقبول أو يدويًا."
      />

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'عقد جديد' : 'تعديل العقد'}
        width="lg"
      >
        {editing !== null && (
          <ContractForm
            key={editing === 'new' ? 'new' : editing.id}
            initial={editing === 'new' ? null : editing}
            options={options}
            defaults={defaults}
            onDone={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="حذف العقد"
        message={`سيتم حذف العقد «${confirmDelete?.number}» حذفًا ناعمًا ويمكن استرجاعه لاحقًا.`}
        confirmLabel="حذف"
        onConfirm={async () => {
          if (!confirmDelete) return;
          const res = await deleteContractAction(confirmDelete.id);
          toast[res.ok ? 'success' : 'error'](res.ok ? 'تم الحذف' : res.error);
          setConfirmDelete(null);
          router.refresh();
        }}
      />
    </>
  );
}

function ContractForm({
  initial,
  options,
  defaults,
  onDone,
}: {
  initial: Row | null;
  options: Options;
  defaults: { quotationId?: string; clientId?: string };
  onDone: () => void;
}) {
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  const [serviceIds, setServiceIds] = React.useState<string[]>(
    initial?.services.map((s) => s.serviceId) ?? [],
  );
  const [autoRenew, setAutoRenew] = React.useState(initial?.autoRenew ?? false);
  const [reminders, setReminders] = React.useState<number[]>(initial?.reminderDays ?? [30, 14, 7, 1]);
  const [quotationId, setQuotationId] = React.useState(
    initial?.quotationId ?? defaults.quotationId ?? '',
  );
  const [clientId, setClientId] = React.useState(initial?.clientId ?? defaults.clientId ?? '');
  // تعديل موجود بقيمة محجوبة (null) يعني أن المستخدم لا يملك صلاحية رؤيتها —
  // نقفل الحقل بدل تعبئته بصفر قابل للحفظ والذي يمحو القيمة الحقيقية فعليًا.
  const valueLocked = initial !== null && initial.valueMinor === null;
  const [value, setValue] = React.useState(
    initial?.valueMinor != null ? String(initial.valueMinor / 100) : '0',
  );

  // اختيار عرض سعر يملأ العميل والقيمة تلقائيًا — بدون إعادة إدخال البيانات.
  const onPickQuotation = (id: string) => {
    setQuotationId(id);
    const q = options.quotations.find((x) => x.id === id);
    if (q) {
      if (q.clientId) setClientId(q.clientId);
      setValue(String(q.totalMinor / 100));
    }
  };

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setPending(true);
        const res = await saveContractAction(
          {
            ...Object.fromEntries(fd.entries()),
            clientId,
            quotationId: quotationId || null,
            value: Number(value || 0),
            serviceIds,
            autoRenew,
            reminderDays: reminders,
          },
          initial?.id,
        );
        setPending(false);
        if (!res.ok) return toast.error(res.error);
        toast.success('تم حفظ العقد');
        onDone();
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="عنوان العقد" required className="sm:col-span-2">
          <Input name="title" defaultValue={initial?.title} required minLength={2} />
        </Field>
        <Field label="عرض السعر المرتبط" hint="اختياره يملأ العميل والقيمة تلقائيًا">
          <Select value={quotationId} onChange={(e) => onPickQuotation(e.target.value)}>
            <option value="">— بدون —</option>
            {options.quotations.map((q) => (
              <option key={q.id} value={q.id}>
                {q.number}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="العميل" required>
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            <option value="">— اختر —</option>
            {options.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.brandName || c.legalName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="تاريخ البداية" required>
          <Input
            name="startDate"
            type="date"
            dir="ltr"
            required
            defaultValue={initial?.startDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)}
          />
        </Field>
        <Field label="تاريخ الانتهاء" required>
          <Input
            name="endDate"
            type="date"
            dir="ltr"
            required
            defaultValue={initial?.endDate?.slice(0, 10) ?? ''}
          />
        </Field>
        <Field label="تاريخ التجديد" hint="افتراضيًا = تاريخ الانتهاء">
          <Input
            name="renewalDate"
            type="date"
            dir="ltr"
            defaultValue={initial?.renewalDate?.slice(0, 10) ?? ''}
          />
        </Field>
        <Field
          label="قيمة العقد"
          required={!valueLocked}
          hint={valueLocked ? 'لا تملك صلاحية عرض أو تعديل القيمة المالية' : undefined}
        >
          <Input
            type="number"
            min={0}
            step="0.01"
            dir="ltr"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required={!valueLocked}
            disabled={valueLocked}
          />
        </Field>
        <Field label="العملة">
          <Select name="currency" defaultValue={initial?.currency ?? 'EGP'}>
            <option value="EGP">EGP</option>
            <option value="SAR">SAR</option>
            <option value="USD">USD</option>
            <option value="AED">AED</option>
          </Select>
        </Field>
        <Field label="المسؤول عن العقد">
          <Select name="ownerId" defaultValue={initial?.ownerId ?? ''}>
            <option value="">— أنا —</option>
            {options.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="الحالة">
          <Select
            name="status"
            defaultValue={initial?.status ?? 'DRAFT'}
            options={labelOptions('contractStatus')}
          />
        </Field>
        <Field label="شروط الدفع" className="sm:col-span-2">
          <Input name="paymentTerms" defaultValue={initial?.paymentTerms ?? ''} />
        </Field>
      </div>

      <div>
        <p className="bp-label">الخدمات المشمولة</p>
        <div className="flex flex-wrap gap-2">
          {options.services.map((s) => (
            <Checkbox
              key={s.id}
              label={s.nameAr}
              checked={serviceIds.includes(s.id)}
              onChange={(e) =>
                setServiceIds((prev) =>
                  e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id),
                )
              }
            />
          ))}
        </div>
      </div>

      <div>
        <p className="bp-label">تنبيهات التجديد (بالأيام قبل الموعد)</p>
        <div className="flex flex-wrap gap-2">
          {[60, 30, 14, 7, 3, 1].map((d) => (
            <Checkbox
              key={d}
              label={`${d} يوم`}
              checked={reminders.includes(d)}
              onChange={(e) =>
                setReminders((prev) =>
                  e.target.checked ? [...prev, d].sort((a, b) => b - a) : prev.filter((x) => x !== d),
                )
              }
            />
          ))}
        </div>
      </div>

      <Checkbox
        label="تجديد تلقائي (ينشئ عقدًا جديدًا كمسودة عند الانتهاء)"
        checked={autoRenew}
        onChange={(e) => setAutoRenew(e.target.checked)}
      />

      <Field label="ملاحظات">
        <Textarea name="notes" rows={3} defaultValue={initial?.notes ?? ''} />
      </Field>

      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          حفظ العقد
        </Button>
      </div>
    </form>
  );
}

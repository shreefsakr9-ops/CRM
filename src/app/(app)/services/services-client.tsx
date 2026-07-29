'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Power, Trash2, X } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { FiltersBar } from '@/components/filters-bar';
import { Drawer, ConfirmDialog } from '@/components/ui/drawer';
import { Badge, Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/format';
import { label, tone, options as labelOptions } from '@/i18n/labels';
import { saveServiceAction, toggleServiceAction, deleteServiceAction } from './actions';

interface Deliverable {
  id?: string;
  nameAr: string;
  nameEn: string;
  quantity: number;
}

interface Row {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  description: string | null;
  basePriceMinor: number | null;
  currency: string;
  billingType: string;
  durationDays: number | null;
  defaultTaxRateId: string | null;
  defaultPaymentTerms: string | null;
  departmentKeys: string[];
  isPackage: boolean;
  isActive: boolean;
  deliverables: Deliverable[];
  _count: { quotationItems: number; deals: number };
}

interface Options {
  taxRates: { id: string; nameAr: string; rate: number }[];
  departments: { key: string; nameAr: string }[];
  currencies: { code: string; nameAr: string }[];
}

export function ServicesClient({
  services,
  options,
  perms,
}: {
  services: Row[];
  options: Options;
  perms: { canCreate: boolean; canEdit: boolean; canDelete: boolean; canViewMoney: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = React.useState<Row | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<Row | null>(null);

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'الخدمة',
      primary: true,
      exportValue: (r) => r.nameAr,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{r.nameAr}</p>
          <p className="truncate text-[11px] text-ink-faint" dir="ltr">
            {r.code} · {r.nameEn}
          </p>
        </div>
      ),
    },
    {
      key: 'billingType',
      header: 'نوع الفوترة',
      exportValue: (r) => label('billingType', r.billingType),
      render: (r) => <Badge tone={tone('billingType', r.billingType)}>{label('billingType', r.billingType)}</Badge>,
    },
    {
      key: 'price',
      header: 'السعر الأساسي',
      align: 'end',
      exportValue: (r) => (r.basePriceMinor ?? 0) / 100,
      render: (r) =>
        perms.canViewMoney && r.basePriceMinor !== null ? (
          <span className="num text-xs">{formatMoney(r.basePriceMinor, r.currency)}</span>
        ) : (
          <span className="text-[11px] text-ink-faint">—</span>
        ),
    },
    {
      key: 'deliverables',
      header: 'المخرجات',
      exportValue: (r) => r.deliverables.map((d) => d.nameAr).join(' | '),
      render: (r) => <span className="num text-xs text-ink-muted">{r.deliverables.length}</span>,
      align: 'center',
    },
    {
      key: 'departments',
      header: 'الأقسام المسؤولة',
      defaultHidden: true,
      exportValue: (r) => r.departmentKeys.join(' | '),
      render: (r) => (
        <span className="text-[11px] text-ink-muted">
          {r.departmentKeys
            .map((k) => options.departments.find((d) => d.key === k)?.nameAr ?? k)
            .join('، ') || '—'}
        </span>
      ),
    },
    {
      key: 'usage',
      header: 'الاستخدام',
      align: 'center',
      exportValue: (r) => r._count.quotationItems,
      render: (r) => (
        <span className="num text-xs text-ink-faint">
          {r._count.quotationItems} عرض · {r._count.deals} صفقة
        </span>
      ),
    },
    {
      key: 'isActive',
      header: 'الحالة',
      exportValue: (r) => (r.isActive ? 'نشطة' : 'موقوفة'),
      render: (r) => (
        <Badge tone={r.isActive ? 'ok' : 'muted'} dot>
          {r.isActive ? 'نشطة' : 'موقوفة'}
        </Badge>
      ),
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
                  title={r.isActive ? 'إيقاف' : 'تفعيل'}
                  onClick={async () => {
                    const res = await toggleServiceAction(r.id, !r.isActive);
                    toast[res.ok ? 'success' : 'error'](res.ok ? 'تم التحديث' : res.error);
                    router.refresh();
                  }}
                >
                  <Power className={`h-3.5 w-3.5 ${r.isActive ? 'text-ok' : 'text-ink-faint'}`} />
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
        searchPlaceholder="ابحث باسم الخدمة أو الكود…"
        filters={[
          { key: 'billingType', label: 'نوع الفوترة', options: labelOptions('billingType') },
          {
            key: 'active',
            label: 'الحالة',
            options: [
              { value: 'active', label: 'نشطة' },
              { value: 'inactive', label: 'موقوفة' },
            ],
          },
        ]}
      >
        {perms.canCreate && (
          <Button onClick={() => setEditing('new')} type="button">
            <Plus className="h-4 w-4" />
            خدمة جديدة
          </Button>
        )}
      </FiltersBar>

      <DataTable
        rows={services}
        columns={columns}
        getKey={(r) => r.id}
        storageKey="services"
        exportName="services"
        canExport
        emptyTitle="لا توجد خدمات"
        emptyDescription="أضف خدمات Blue Point ليتم استخدامها في عروض الأسعار والمشاريع."
      />

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'خدمة جديدة' : 'تعديل الخدمة'}
        width="lg"
      >
        {editing !== null && (
          <ServiceForm
            key={editing === 'new' ? 'new' : editing.id}
            initial={editing === 'new' ? null : editing}
            options={options}
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
        title="حذف الخدمة"
        message={`سيتم حذف «${confirmDelete?.nameAr}» حذفًا ناعمًا. عروض الأسعار السابقة تحتفظ ببياناتها كما هي.`}
        confirmLabel="حذف"
        onConfirm={async () => {
          if (!confirmDelete) return;
          const res = await deleteServiceAction(confirmDelete.id);
          toast[res.ok ? 'success' : 'error'](res.ok ? 'تم الحذف' : res.error);
          setConfirmDelete(null);
          router.refresh();
        }}
      />
    </>
  );
}

function ServiceForm({
  initial,
  options,
  onDone,
}: {
  initial: Row | null;
  options: Options;
  onDone: () => void;
}) {
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  const [deliverables, setDeliverables] = React.useState<Deliverable[]>(
    initial?.deliverables ?? [],
  );
  const [departments, setDepartments] = React.useState<string[]>(initial?.departmentKeys ?? []);
  const [isPackage, setIsPackage] = React.useState(initial?.isPackage ?? false);
  const [isActive, setIsActive] = React.useState(initial?.isActive ?? true);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setPending(true);
        const res = await saveServiceAction(
          {
            ...Object.fromEntries(fd.entries()),
            departmentKeys: departments,
            deliverables,
            isPackage,
            isActive,
            prices: [],
          },
          initial?.id,
        );
        setPending(false);
        if (!res.ok) return toast.error(res.error);
        toast.success('تم حفظ الخدمة');
        onDone();
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الكود" required hint="مثال: SVC-SMM">
          <Input name="code" defaultValue={initial?.code} required dir="ltr" />
        </Field>
        <Field label="نوع الفوترة" required>
          <Select
            name="billingType"
            defaultValue={initial?.billingType ?? 'ONE_TIME'}
            options={labelOptions('billingType')}
          />
        </Field>
        <Field label="الاسم بالعربية" required>
          <Input name="nameAr" defaultValue={initial?.nameAr} required />
        </Field>
        <Field label="الاسم بالإنجليزية" required>
          <Input name="nameEn" defaultValue={initial?.nameEn} required dir="ltr" />
        </Field>
        <Field label="السعر الأساسي" required>
          <Input
            name="basePrice"
            type="number"
            min={0}
            step="0.01"
            dir="ltr"
            defaultValue={initial?.basePriceMinor ? initial.basePriceMinor / 100 : 0}
          />
        </Field>
        <Field label="العملة">
          <Select name="currency" defaultValue={initial?.currency ?? 'EGP'}>
            {options.currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.nameAr} ({c.code})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="الضريبة الافتراضية" hint="قابلة للتغيير في كل عرض سعر">
          <Select name="defaultTaxRateId" defaultValue={initial?.defaultTaxRateId ?? ''}>
            <option value="">— بدون —</option>
            {options.taxRates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nameAr}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="مدة التنفيذ (أيام)">
          <Input name="durationDays" type="number" min={0} dir="ltr" defaultValue={initial?.durationDays ?? ''} />
        </Field>
        <Field label="شروط الدفع الافتراضية" className="sm:col-span-2">
          <Input name="defaultPaymentTerms" defaultValue={initial?.defaultPaymentTerms ?? ''} />
        </Field>
        <Field label="الوصف" className="sm:col-span-2">
          <Textarea name="description" rows={3} defaultValue={initial?.description ?? ''} />
        </Field>
      </div>

      <div>
        <p className="bp-label">الأقسام المسؤولة</p>
        <div className="flex flex-wrap gap-2">
          {options.departments.map((d) => (
            <Checkbox
              key={d.key}
              label={d.nameAr}
              checked={departments.includes(d.key)}
              onChange={(e) =>
                setDepartments((prev) =>
                  e.target.checked ? [...prev, d.key] : prev.filter((k) => k !== d.key),
                )
              }
            />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="bp-label mb-0">المخرجات (Deliverables)</p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setDeliverables((d) => [...d, { nameAr: '', nameEn: '', quantity: 1 }])}
          >
            <Plus className="h-3.5 w-3.5" />
            إضافة
          </Button>
        </div>
        <div className="space-y-2">
          {deliverables.length === 0 && (
            <p className="text-[11px] text-ink-faint">لا توجد مخرجات محددة — تُستخدم لتوليد مهام المشروع.</p>
          )}
          {deliverables.map((d, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={d.nameAr}
                onChange={(e) =>
                  setDeliverables((prev) =>
                    prev.map((x, xi) => (xi === i ? { ...x, nameAr: e.target.value } : x)),
                  )
                }
                placeholder="الاسم بالعربية"
                required
              />
              <Input
                value={d.nameEn}
                onChange={(e) =>
                  setDeliverables((prev) =>
                    prev.map((x, xi) => (xi === i ? { ...x, nameEn: e.target.value } : x)),
                  )
                }
                placeholder="English name"
                dir="ltr"
                required
              />
              <Input
                type="number"
                min={1}
                value={d.quantity}
                onChange={(e) =>
                  setDeliverables((prev) =>
                    prev.map((x, xi) => (xi === i ? { ...x, quantity: Number(e.target.value) } : x)),
                  )
                }
                className="w-20"
                dir="ltr"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setDeliverables((prev) => prev.filter((_, xi) => xi !== i))}
              >
                <X className="h-4 w-4 text-danger" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <Checkbox label="باقة (تحتوي خدمات أخرى)" checked={isPackage} onChange={(e) => setIsPackage(e.target.checked)} />
        <Checkbox label="نشطة" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          حفظ
        </Button>
      </div>
    </form>
  );
}

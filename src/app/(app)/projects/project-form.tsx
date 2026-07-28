'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Checkbox, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { options as labelOptions } from '@/i18n/labels';
import { createProjectAction, updateProjectAction } from './actions';

interface Options {
  clients: { id: string; legalName: string; brandName: string | null; currency: string }[];
  users: { id: string; name: string; role: { key: string; nameAr: string } }[];
  services: { id: string; nameAr: string }[];
  templates: { id: string; nameAr: string; _count: { tasks: number } }[];
  contracts: { id: string; number: string; clientId: string }[];
  quotations: { id: string; number: string; clientId: string | null; totalMinor: number }[];
  deals: { id: string; title: string; clientId: string | null }[];
}

export interface ProjectFormValues {
  id?: string;
  name?: string;
  clientId?: string;
  dealId?: string | null;
  quotationId?: string | null;
  contractId?: string | null;
  templateId?: string | null;
  ownerId?: string;
  accountManagerId?: string | null;
  startDate?: string;
  endDate?: string | null;
  status?: string;
  priority?: string;
  budgetMinor?: number | null;
  currency?: string;
  progressMode?: string;
  progressPercent?: number;
  internalNotes?: string | null;
  clientNotes?: string | null;
  members?: { user: { id: string } }[];
  services?: { serviceId: string }[];
}

export function ProjectForm({
  initial,
  options,
  defaults,
}: {
  initial: ProjectFormValues | null;
  options: Options;
  defaults: { clientId?: string; quotationId?: string; contractId?: string; dealId?: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  const [clientId, setClientId] = React.useState(initial?.clientId ?? defaults.clientId ?? '');
  const [quotationId, setQuotationId] = React.useState(initial?.quotationId ?? defaults.quotationId ?? '');
  const [memberIds, setMemberIds] = React.useState<string[]>(
    initial?.members?.map((m) => m.user.id) ?? [],
  );
  const [serviceIds, setServiceIds] = React.useState<string[]>(
    initial?.services?.map((s) => s.serviceId) ?? [],
  );
  const [budget, setBudget] = React.useState(
    initial?.budgetMinor != null ? String(initial.budgetMinor / 100) : '0',
  );
  const [progressMode, setProgressMode] = React.useState(initial?.progressMode ?? 'TASKS');

  // اختيار عرض سعر مقبول يملأ العميل والميزانية.
  const onPickQuotation = (id: string) => {
    setQuotationId(id);
    const q = options.quotations.find((x) => x.id === id);
    if (q) {
      if (q.clientId) setClientId(q.clientId);
      setBudget(String(q.totalMinor / 100));
    }
  };

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setPending(true);
        const payload = {
          ...Object.fromEntries(fd.entries()),
          clientId,
          quotationId: quotationId || null,
          memberIds,
          serviceIds,
          budget: Number(budget || 0),
          progressMode,
        };
        const res = initial?.id
          ? await updateProjectAction(initial.id, payload)
          : await createProjectAction(payload);
        setPending(false);
        if (!res.ok) return toast.error(res.error);
        toast.success(initial?.id ? 'تم حفظ المشروع' : 'تم إنشاء المشروع وتوليد مهامه');
        const id = initial?.id ?? (res.data as { id: string } | undefined)?.id;
        router.push(id ? `/projects/${id}` : '/projects');
        router.refresh();
      }}
      className="grid gap-4 lg:grid-cols-3"
    >
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader title="بيانات المشروع" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="اسم المشروع" required className="sm:col-span-2">
              <Input name="name" defaultValue={initial?.name} required minLength={2} />
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
            <Field label="عرض السعر المرتبط" hint="يملأ العميل والميزانية تلقائيًا">
              <Select value={quotationId} onChange={(e) => onPickQuotation(e.target.value)}>
                <option value="">— بدون —</option>
                {options.quotations.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.number}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="العقد المرتبط">
              <Select name="contractId" defaultValue={initial?.contractId ?? defaults.contractId ?? ''}>
                <option value="">— بدون —</option>
                {options.contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.number}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="الصفقة المرتبطة">
              <Select name="dealId" defaultValue={initial?.dealId ?? defaults.dealId ?? ''}>
                <option value="">— بدون —</option>
                {options.deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </Select>
            </Field>
            {!initial?.id && (
              <Field
                label="قالب المشروع"
                className="sm:col-span-2"
                hint="سيتم توليد المهام والاعتماديات وتواريخ الاستحقاق من تاريخ البداية"
              >
                <Select name="templateId" defaultValue="">
                  <option value="">— بدون قالب —</option>
                  {options.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nameAr} ({t._count.tasks} مهمة)
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="تاريخ البداية" required>
              <Input
                name="startDate"
                type="date"
                dir="ltr"
                required
                defaultValue={initial?.startDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)}
              />
            </Field>
            <Field label="تاريخ التسليم">
              <Input name="endDate" type="date" dir="ltr" defaultValue={initial?.endDate?.slice(0, 10) ?? ''} />
            </Field>
            <Field label="الميزانية">
              <Input
                type="number"
                min={0}
                step="0.01"
                dir="ltr"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
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
            <Field label="ملاحظات داخلية" className="sm:col-span-2">
              <Textarea name="internalNotes" rows={2} defaultValue={initial?.internalNotes ?? ''} />
            </Field>
            <Field label="ملاحظات العميل" className="sm:col-span-2">
              <Textarea name="clientNotes" rows={2} defaultValue={initial?.clientNotes ?? ''} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="فريق العمل" subtitle="أعضاء الفريق يرون المشروع ومهامه" />
          <CardBody>
            <div className="grid gap-2 sm:grid-cols-2">
              {options.users.map((u) => (
                <Checkbox
                  key={u.id}
                  label={`${u.name} — ${u.role.nameAr}`}
                  checked={memberIds.includes(u.id)}
                  onChange={(e) =>
                    setMemberIds((prev) =>
                      e.target.checked ? [...prev, u.id] : prev.filter((x) => x !== u.id),
                    )
                  }
                />
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="الخدمات المشمولة" />
          <CardBody className="flex flex-wrap gap-2">
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
          </CardBody>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="الإدارة والحالة" />
          <CardBody className="space-y-4">
            <Field label="مسؤول المشروع">
              <Select name="ownerId" defaultValue={initial?.ownerId ?? ''}>
                <option value="">— أنا —</option>
                {options.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="مدير الحساب">
              <Select name="accountManagerId" defaultValue={initial?.accountManagerId ?? ''}>
                <option value="">— بدون —</option>
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
                defaultValue={initial?.status ?? 'ONBOARDING'}
                options={labelOptions('projectStatus')}
              />
            </Field>
            <Field label="الأولوية">
              <Select
                name="priority"
                defaultValue={initial?.priority ?? 'MEDIUM'}
                options={labelOptions('priority')}
              />
            </Field>
            <Field label="طريقة احتساب الإنجاز" hint="حسب المهام أو المخرجات أو يدويًا">
              <Select value={progressMode} onChange={(e) => setProgressMode(e.target.value)}>
                <option value="TASKS">نسبة المهام المكتملة</option>
                <option value="DELIVERABLES">نسبة المخرجات المعتمدة</option>
                <option value="MANUAL">يدوي</option>
              </Select>
            </Field>
            {progressMode === 'MANUAL' && (
              <Field label="نسبة الإنجاز %">
                <Input
                  name="progressPercent"
                  type="number"
                  min={0}
                  max={100}
                  dir="ltr"
                  defaultValue={initial?.progressPercent ?? 0}
                />
              </Field>
            )}
          </CardBody>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" loading={pending} className="flex-1 justify-center">
            <Save className="h-4 w-4" />
            {initial?.id ? 'حفظ' : 'إنشاء المشروع'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            إلغاء
          </Button>
        </div>
      </div>
    </form>
  );
}

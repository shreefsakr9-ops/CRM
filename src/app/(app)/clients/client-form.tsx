'use client';

import * as React from 'react';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { options as labelOptions } from '@/i18n/labels';
import { createClientAction, updateClientAction } from './actions';

export interface ClientFormValues {
  id?: string;
  legalName?: string;
  brandName?: string | null;
  type?: string;
  industry?: string | null;
  countryCode?: string | null;
  city?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  commercialReg?: string | null;
  website?: string | null;
  currency?: string;
  accountManagerId?: string | null;
  salesOwnerId?: string | null;
  status?: string;
  satisfaction?: number | null;
  renewalDate?: string | null;
  internalNotes?: string | null;
}

export function ClientForm({
  initial,
  options,
  onDone,
}: {
  initial: ClientFormValues | null;
  options: { users: { id: string; name: string }[]; countries: { code: string; nameAr: string }[] };
  onDone: (id?: string) => void;
}) {
  const toast = useToast();
  const [pending, setPending] = React.useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const values = Object.fromEntries(fd.entries());
        setPending(true);
        const res = initial?.id
          ? await updateClientAction(initial.id, values)
          : await createClientAction(values);
        setPending(false);
        if (!res.ok) return toast.error(res.error);
        toast.success(initial?.id ? 'تم حفظ التعديلات' : 'تم إنشاء العميل');
        onDone((res.data as { id?: string } | undefined)?.id);
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الاسم القانوني" required className="sm:col-span-2">
          <Input name="legalName" defaultValue={initial?.legalName} required minLength={2} />
        </Field>
        <Field label="الاسم التجاري (Brand)">
          <Input name="brandName" defaultValue={initial?.brandName ?? ''} />
        </Field>
        <Field label="النوع">
          <Select name="type" defaultValue={initial?.type ?? 'COMPANY'}>
            <option value="COMPANY">شركة</option>
            <option value="INDIVIDUAL">فرد</option>
          </Select>
        </Field>
        <Field label="المجال">
          <Input name="industry" defaultValue={initial?.industry ?? ''} />
        </Field>
        <Field label="الدولة">
          <Select name="countryCode" defaultValue={initial?.countryCode ?? 'EG'}>
            <option value="">— اختر —</option>
            {options.countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.nameAr}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="المدينة">
          <Input name="city" defaultValue={initial?.city ?? ''} />
        </Field>
        <Field label="العنوان" className="sm:col-span-2">
          <Input name="address" defaultValue={initial?.address ?? ''} />
        </Field>
        <Field label="الرقم الضريبي">
          <Input name="taxNumber" defaultValue={initial?.taxNumber ?? ''} dir="ltr" />
        </Field>
        <Field label="السجل التجاري">
          <Input name="commercialReg" defaultValue={initial?.commercialReg ?? ''} dir="ltr" />
        </Field>
        <Field label="الموقع الإلكتروني">
          <Input name="website" defaultValue={initial?.website ?? ''} dir="ltr" />
        </Field>
        <Field label="العملة المفضلة">
          <Select name="currency" defaultValue={initial?.currency ?? 'EGP'}>
            <option value="EGP">EGP</option>
            <option value="SAR">SAR</option>
            <option value="USD">USD</option>
            <option value="AED">AED</option>
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
        <Field label="مسؤول المبيعات">
          <Select name="salesOwnerId" defaultValue={initial?.salesOwnerId ?? ''}>
            <option value="">— بدون —</option>
            {options.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="الحالة">
          <Select name="status" defaultValue={initial?.status ?? 'ACTIVE'} options={labelOptions('clientStatus')} />
        </Field>
        <Field label="تقييم الرضا (١–٥)">
          <Input
            name="satisfaction"
            type="number"
            min={1}
            max={5}
            dir="ltr"
            defaultValue={initial?.satisfaction ?? ''}
          />
        </Field>
        <Field label="تاريخ التجديد">
          <Input
            name="renewalDate"
            type="date"
            dir="ltr"
            defaultValue={initial?.renewalDate ? initial.renewalDate.slice(0, 10) : ''}
          />
        </Field>
      </div>

      <Field label="ملاحظات داخلية" hint="لا تظهر للعميل">
        <Textarea name="internalNotes" rows={3} defaultValue={initial?.internalNotes ?? ''} />
      </Field>

      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          {initial?.id ? 'حفظ التعديلات' : 'إنشاء العميل'}
        </Button>
      </div>
    </form>
  );
}

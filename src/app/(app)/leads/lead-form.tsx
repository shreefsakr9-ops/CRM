'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Save } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { checkDuplicatesAction, createLeadAction, updateLeadAction } from './actions';
import { options as labelOptions } from '@/i18n/labels';

export interface LeadFormOptions {
  sources: { id: string; nameAr: string }[];
  stages: { id: string; nameAr: string }[];
  services: { id: string; nameAr: string }[];
  users: { id: string; name: string }[];
  countries: { code: string; nameAr: string }[];
}

export interface LeadFormValues {
  id?: string;
  fullName?: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  companyName?: string | null;
  businessType?: string | null;
  countryCode?: string | null;
  city?: string | null;
  sourceId?: string | null;
  campaign?: string | null;
  interestedServiceId?: string | null;
  estimatedValueMinor?: number | null;
  currency?: string;
  assignedToId?: string | null;
  priority?: string;
  score?: number;
  stageId?: string | null;
  nextFollowUpAt?: string | null;
  expectedCloseDate?: string | null;
  noFollowUpReason?: string | null;
  notes?: string | null;
}

interface Duplicate {
  id: string;
  fullName: string;
  companyName: string | null;
  phone: string | null;
  status: string;
  assignedTo: { name: string } | null;
}

const dateValue = (v?: string | null) => (v ? new Date(v).toISOString().slice(0, 10) : '');

export function LeadForm({
  initial,
  options,
  canAssign,
}: {
  initial: LeadFormValues | null;
  options: LeadFormOptions;
  canAssign: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  const [duplicates, setDuplicates] = React.useState<Duplicate[]>([]);
  const [forceCreate, setForceCreate] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  // تعديل عميل محتمل موجود بقيمة محجوبة (null) يعني أن المستخدم لا يملك صلاحية
  // رؤيتها — نقفل الحقل بدل تعبئته بصفر قابل للحفظ يمحو القيمة الحقيقية فعليًا.
  const estimatedValueLocked = initial !== null && initial.estimatedValueMinor == null;

  const checkDuplicates = async () => {
    const fd = new FormData(formRef.current!);
    const res = await checkDuplicatesAction({
      phone: String(fd.get('phone') ?? ''),
      whatsapp: String(fd.get('whatsapp') ?? ''),
      email: String(fd.get('email') ?? ''),
      excludeId: initial?.id,
    });
    if (res.ok) setDuplicates((res.data ?? []) as Duplicate[]);
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const values = Object.fromEntries(fd.entries());
    setPending(true);
    const res = initial?.id
      ? await updateLeadAction(initial.id, values)
      : await createLeadAction(values, forceCreate);
    setPending(false);

    if (!res.ok) {
      toast.error(res.error);
      if (res.error.includes('مكرر') || res.error.includes('بنفس')) {
        await checkDuplicates();
        setForceCreate(true);
      }
      return;
    }
    toast.success(initial?.id ? 'تم حفظ التعديلات' : 'تم إنشاء العميل المحتمل');
    const id = initial?.id ?? (res.data as { id: string } | undefined)?.id;
    router.push(id ? `/leads/${id}` : '/leads');
    router.refresh();
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      {duplicates.length > 0 && (
        <div className="rounded-lg border border-warn/30 bg-warn/10 p-3">
          <p className="flex items-center gap-2 text-xs font-medium text-warn">
            <AlertTriangle className="h-4 w-4" />
            تم العثور على {duplicates.length} سجل مشابه بنفس الهاتف أو البريد
          </p>
          <ul className="mt-2 space-y-1">
            {duplicates.map((d) => (
              <li key={d.id} className="text-[11px] text-ink-muted">
                <a href={`/leads/${d.id}`} className="text-brand hover:underline">
                  {d.fullName}
                </a>
                {d.companyName && ` · ${d.companyName}`}
                {d.assignedTo && ` · مسند إلى ${d.assignedTo.name}`}
              </li>
            ))}
          </ul>
          {forceCreate && (
            <p className="mt-2 text-[11px] text-warn">
              اضغط حفظ مرة أخرى للإنشاء رغم التكرار (سيُسجَّل ذلك في سجل التدقيق).
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="بيانات العميل" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="اسم العميل" required className="sm:col-span-2">
                <Input name="fullName" defaultValue={initial?.fullName} required minLength={2} />
              </Field>
              <Field label="رقم الهاتف">
                <Input name="phone" defaultValue={initial?.phone ?? ''} dir="ltr" onBlur={checkDuplicates} />
              </Field>
              <Field label="رقم الواتساب">
                <Input name="whatsapp" defaultValue={initial?.whatsapp ?? ''} dir="ltr" onBlur={checkDuplicates} />
              </Field>
              <Field label="البريد الإلكتروني">
                <Input name="email" type="email" defaultValue={initial?.email ?? ''} dir="ltr" onBlur={checkDuplicates} />
              </Field>
              <Field label="اسم الشركة">
                <Input name="companyName" defaultValue={initial?.companyName ?? ''} />
              </Field>
              <Field label="نوع النشاط">
                <Input name="businessType" defaultValue={initial?.businessType ?? ''} placeholder="مطاعم، عيادات، عقارات…" />
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
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="بيانات الفرصة" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="المصدر">
                <Select name="sourceId" defaultValue={initial?.sourceId ?? ''}>
                  <option value="">— اختر —</option>
                  {options.sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameAr}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="الحملة">
                <Input name="campaign" defaultValue={initial?.campaign ?? ''} />
              </Field>
              <Field label="الخدمة المهتم بها">
                <Select name="interestedServiceId" defaultValue={initial?.interestedServiceId ?? ''}>
                  <option value="">— اختر —</option>
                  {options.services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameAr}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="المرحلة">
                <Select name="stageId" defaultValue={initial?.stageId ?? options.stages[0]?.id ?? ''}>
                  {options.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameAr}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="الميزانية التقديرية"
                hint={estimatedValueLocked ? 'لا تملك صلاحية عرض أو تعديل القيمة المالية' : undefined}
              >
                <Input
                  name="estimatedValue"
                  type="number"
                  min={0}
                  step="0.01"
                  dir="ltr"
                  defaultValue={initial?.estimatedValueMinor ? initial.estimatedValueMinor / 100 : 0}
                  disabled={estimatedValueLocked}
                />
              </Field>
              <Field label="العملة">
                <Select name="currency" defaultValue={initial?.currency ?? 'EGP'}>
                  <option value="EGP">جنيه مصري (EGP)</option>
                  <option value="SAR">ريال سعودي (SAR)</option>
                  <option value="USD">دولار (USD)</option>
                  <option value="AED">درهم (AED)</option>
                </Select>
              </Field>
              <Field label="ملاحظات" className="sm:col-span-2">
                <Textarea name="notes" defaultValue={initial?.notes ?? ''} rows={4} />
              </Field>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="المتابعة والإسناد" />
            <CardBody className="space-y-4">
              <Field label="المسؤول" hint={canAssign ? undefined : 'سيتم إسناده إليك تلقائيًا'}>
                <Select
                  name="assignedToId"
                  defaultValue={initial?.assignedToId ?? ''}
                  disabled={!canAssign}
                >
                  <option value="">— اختر —</option>
                  {options.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="الأولوية">
                <Select name="priority" defaultValue={initial?.priority ?? 'MEDIUM'} options={labelOptions('priority')} />
              </Field>
              <Field label="درجة التقييم (Lead Score)" hint="من ٠ إلى ١٠٠">
                <Input name="score" type="number" min={0} max={100} dir="ltr" defaultValue={initial?.score ?? 0} />
              </Field>
              <Field label="المتابعة القادمة" hint="مطلوبة للعملاء النشطين">
                <Input
                  name="nextFollowUpAt"
                  type="date"
                  dir="ltr"
                  defaultValue={dateValue(initial?.nextFollowUpAt)}
                />
              </Field>
              <Field label="سبب عدم تحديد متابعة" hint="يُستخدم فقط عند ترك المتابعة فارغة">
                <Input name="noFollowUpReason" defaultValue={initial?.noFollowUpReason ?? ''} />
              </Field>
              <Field label="تاريخ الإغلاق المتوقع">
                <Input
                  name="expectedCloseDate"
                  type="date"
                  dir="ltr"
                  defaultValue={dateValue(initial?.expectedCloseDate)}
                />
              </Field>
            </CardBody>
          </Card>

          <div className="flex gap-2">
            <Button type="submit" loading={pending} className="flex-1 justify-center">
              <Save className="h-4 w-4" />
              {initial?.id ? 'حفظ التعديلات' : 'إنشاء'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => router.back()}>
              إلغاء
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Save, GripVertical } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/format';
import { createQuotationAction, updateQuotationAction } from './actions';

/**
 * حاسبة عرض السعر — تعكس منطق السيرفر في src/server/services/money.ts
 * بأعداد صحيحة (وحدة صغرى) حتى لا تختلف الأرقام المعروضة عن المحفوظة.
 * السيرفر يبقى المرجع النهائي ويعيد الحساب دائمًا عند الحفظ.
 */
const SCALE = 10_000n;

function toScaled(value: number | string): bigint {
  const s = String(value ?? 0).trim() || '0';
  const neg = s.startsWith('-');
  const [i = '0', f = ''] = (neg ? s.slice(1) : s).split('.');
  const frac = (f + '00000').slice(0, 5);
  const base = BigInt(i || '0') * SCALE + BigInt(frac.slice(0, 4) || '0');
  const r = base + (Number(frac[4] ?? '0') >= 5 ? 1n : 0n);
  return neg ? -r : r;
}

function mulDivRound(a: bigint, b: bigint, d: bigint): bigint {
  if (d === 0n) return 0n;
  return (a * b * 2n + d) / (d * 2n);
}

export interface Line {
  serviceId: string;
  nameAr: string;
  nameEn: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountType: 'NONE' | 'PERCENT' | 'AMOUNT';
  discountValue: string;
  taxRateId: string;
  taxRate: string;
}

export interface Installment {
  label: string;
  percentage: string;
  dueOffsetDays: string;
}

interface Options {
  clients: {
    id: string;
    legalName: string;
    brandName: string | null;
    currency: string;
    contacts: { id: string; name: string; type: string }[];
  }[];
  leads: { id: string; fullName: string; companyName: string | null }[];
  services: {
    id: string;
    nameAr: string;
    nameEn: string;
    basePriceMinor: number;
    currency: string;
    defaultTaxRateId: string | null;
    description: string | null;
  }[];
  taxRates: { id: string; nameAr: string; rate: number }[];
  deals: { id: string; title: string; clientId: string | null; leadId: string | null }[];
  currencies: { code: string; nameAr: string }[];
  settings: { defaultValidityDays: number; defaultTermsAr: string; defaultTermsEn: string };
}

export interface QuotationInitial {
  id?: string;
  clientId?: string | null;
  leadId?: string | null;
  dealId?: string | null;
  contactId?: string | null;
  issueDate?: string;
  expiryDate?: string;
  currency?: string;
  headerDiscountType?: 'NONE' | 'PERCENT' | 'AMOUNT';
  headerDiscountValue?: number;
  paymentTerms?: string | null;
  executionTerms?: string | null;
  validityNote?: string | null;
  notes?: string | null;
  termsAr?: string | null;
  termsEn?: string | null;
  status?: string;
  items?: Line[];
  installments?: Installment[];
}

const emptyLine = (): Line => ({
  serviceId: '',
  nameAr: '',
  nameEn: '',
  description: '',
  quantity: '1',
  unitPrice: '0',
  discountType: 'NONE',
  discountValue: '0',
  taxRateId: '',
  taxRate: '0',
});

export function QuotationBuilder({
  initial,
  options,
  defaults,
}: {
  initial: QuotationInitial | null;
  options: Options;
  defaults: { clientId?: string; leadId?: string; dealId?: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const defaultExpiry = new Date(Date.now() + options.settings.defaultValidityDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [clientId, setClientId] = React.useState(initial?.clientId ?? defaults.clientId ?? '');
  const [leadId, setLeadId] = React.useState(initial?.leadId ?? defaults.leadId ?? '');
  const [dealId, setDealId] = React.useState(initial?.dealId ?? defaults.dealId ?? '');
  const [contactId, setContactId] = React.useState(initial?.contactId ?? '');
  const [currency, setCurrency] = React.useState(initial?.currency ?? 'EGP');
  const [lines, setLines] = React.useState<Line[]>(initial?.items?.length ? initial.items : [emptyLine()]);
  const [installments, setInstallments] = React.useState<Installment[]>(initial?.installments ?? []);
  const [headerDiscountType, setHeaderDiscountType] = React.useState(
    initial?.headerDiscountType ?? 'NONE',
  );
  const [headerDiscountValue, setHeaderDiscountValue] = React.useState(
    String(initial?.headerDiscountValue ?? 0),
  );

  const contacts = options.clients.find((c) => c.id === clientId)?.contacts ?? [];

  /* ── الحساب المباشر (معاينة) ─────────────────────── */
  const totals = React.useMemo(() => {
    const base = lines.map((l) => {
      const qty = toScaled(l.quantity || '0');
      const unit = BigInt(Math.round(Number(l.unitPrice || 0) * 100));
      const subtotal = mulDivRound(unit, qty, SCALE);
      let discount = 0n;
      if (l.discountType === 'PERCENT') {
        discount = mulDivRound(subtotal, toScaled(l.discountValue || '0'), 100n * SCALE);
      } else if (l.discountType === 'AMOUNT') {
        discount = BigInt(Math.round(Number(l.discountValue || 0) * 100));
      }
      if (discount > subtotal) discount = subtotal;
      return { subtotal, discount, net: subtotal - discount, taxRate: toScaled(l.taxRate || '0') };
    });

    const netBefore = base.reduce((s, l) => s + l.net, 0n);
    let headerDiscount = 0n;
    if (headerDiscountType === 'PERCENT') {
      headerDiscount = mulDivRound(netBefore, toScaled(headerDiscountValue || '0'), 100n * SCALE);
    } else if (headerDiscountType === 'AMOUNT') {
      headerDiscount = BigInt(Math.round(Number(headerDiscountValue || 0) * 100));
    }
    if (headerDiscount > netBefore) headerDiscount = netBefore;

    let allocated = 0n;
    let tax = 0n;
    let total = 0n;
    base.forEach((l, i) => {
      let share = 0n;
      if (headerDiscount > 0n && netBefore > 0n) {
        share =
          i === base.length - 1 ? headerDiscount - allocated : mulDivRound(l.net, headerDiscount, netBefore);
        if (i !== base.length - 1) allocated += share;
      }
      const netAfter = l.net - share;
      const t = mulDivRound(netAfter, l.taxRate, 100n * SCALE);
      tax += t;
      total += netAfter + t;
    });

    return {
      subtotal: base.reduce((s, l) => s + l.subtotal, 0n),
      discount: base.reduce((s, l) => s + l.discount, 0n) + headerDiscount,
      tax,
      total,
      lines: base,
    };
  }, [lines, headerDiscountType, headerDiscountValue]);

  const installmentSum = installments.reduce((s, i) => s + Number(i.percentage || 0), 0);
  const installmentsValid = installments.length === 0 || Math.abs(installmentSum - 100) < 0.0001;

  const updateLine = (index: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  const pickService = (index: number, serviceId: string) => {
    const service = options.services.find((s) => s.id === serviceId);
    if (!service) return updateLine(index, { serviceId: '' });
    const tax = options.taxRates.find((t) => t.id === service.defaultTaxRateId);
    updateLine(index, {
      serviceId,
      nameAr: service.nameAr,
      nameEn: service.nameEn,
      description: service.description ?? '',
      unitPrice: String(service.basePriceMinor / 100),
      taxRateId: service.defaultTaxRateId ?? '',
      taxRate: tax ? String(tax.rate) : '0',
    });
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!clientId && !leadId) return toast.error('اربط العرض بعميل أو عميل محتمل');
    if (!installmentsValid) return toast.error(`مجموع نسب الأقساط يجب أن يساوي 100% (الحالي ${installmentSum}%)`);

    const fd = new FormData(e.currentTarget);
    const payload = {
      clientId: clientId || null,
      leadId: leadId || null,
      dealId: dealId || null,
      contactId: contactId || null,
      issueDate: fd.get('issueDate'),
      expiryDate: fd.get('expiryDate'),
      currency,
      headerDiscountType,
      headerDiscountValue: Number(headerDiscountValue || 0),
      paymentTerms: fd.get('paymentTerms'),
      executionTerms: fd.get('executionTerms'),
      validityNote: fd.get('validityNote'),
      notes: fd.get('notes'),
      termsAr: fd.get('termsAr'),
      termsEn: fd.get('termsEn'),
      items: lines.map((l) => ({
        serviceId: l.serviceId || null,
        nameAr: l.nameAr,
        nameEn: l.nameEn || l.nameAr,
        description: l.description || null,
        quantity: Number(l.quantity || 0),
        unitPrice: Number(l.unitPrice || 0),
        discountType: l.discountType,
        discountValue: Number(l.discountValue || 0),
        taxRateId: l.taxRateId || null,
        taxRate: Number(l.taxRate || 0),
      })),
      installments: installments.map((i) => ({
        label: i.label,
        percentage: Number(i.percentage || 0),
        dueOffsetDays: Number(i.dueOffsetDays || 0),
      })),
    };

    setPending(true);
    const res = initial?.id
      ? await updateQuotationAction(initial.id, payload)
      : await createQuotationAction(payload);
    setPending(false);
    if (!res.ok) return toast.error(res.error);

    const id = (res.data as { id: string }).id;
    toast.success(
      initial?.id && id !== initial.id ? 'تم إنشاء نسخة جديدة من العرض' : 'تم حفظ عرض السعر',
    );
    router.push(`/quotations/${id}`);
    router.refresh();
  };

  const money = (v: bigint) => formatMoney(v, currency);

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="بيانات العرض" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="العميل" hint="اختر عميلًا حاليًا أو عميلًا محتملًا">
                <Select
                  value={clientId}
                  onChange={(e) => {
                    setClientId(e.target.value);
                    setContactId('');
                    const c = options.clients.find((x) => x.id === e.target.value);
                    if (c) setCurrency(c.currency);
                    if (e.target.value) setLeadId('');
                  }}
                >
                  <option value="">— بدون —</option>
                  {options.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.brandName || c.legalName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="العميل المحتمل">
                <Select
                  value={leadId}
                  onChange={(e) => {
                    setLeadId(e.target.value);
                    if (e.target.value) setClientId('');
                  }}
                  disabled={Boolean(clientId)}
                >
                  <option value="">— بدون —</option>
                  {options.leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.fullName}
                      {l.companyName ? ` — ${l.companyName}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="جهة الاتصال">
                <Select value={contactId} onChange={(e) => setContactId(e.target.value)} disabled={!clientId}>
                  <option value="">— بدون —</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="الصفقة المرتبطة">
                <Select value={dealId} onChange={(e) => setDealId(e.target.value)}>
                  <option value="">— بدون —</option>
                  {options.deals.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="تاريخ الإصدار" required>
                <Input
                  name="issueDate"
                  type="date"
                  dir="ltr"
                  required
                  defaultValue={initial?.issueDate?.slice(0, 10) ?? today}
                />
              </Field>
              <Field label="صالح حتى" required>
                <Input
                  name="expiryDate"
                  type="date"
                  dir="ltr"
                  required
                  defaultValue={initial?.expiryDate?.slice(0, 10) ?? defaultExpiry}
                />
              </Field>
              <Field label="العملة">
                <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {options.currencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.nameAr} ({c.code})
                    </option>
                  ))}
                </Select>
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="البنود"
              action={
                <Button type="button" size="sm" variant="secondary" onClick={() => setLines((l) => [...l, emptyLine()])}>
                  <Plus className="h-3.5 w-3.5" />
                  بند
                </Button>
              }
            />
            <CardBody className="space-y-3">
              {lines.map((line, i) => (
                <div key={i} className="rounded-md border border-line bg-surface-sunken/50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                      <GripVertical className="h-3.5 w-3.5" />
                      البند {i + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="num text-xs font-medium text-cyan">
                        {money(
                          totals.lines[i]
                            ? totals.lines[i]!.net +
                                mulDivRound(totals.lines[i]!.net, totals.lines[i]!.taxRate, 100n * SCALE)
                            : 0n,
                        )}
                      </span>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setLines((prev) => prev.filter((_, x) => x !== i))}
                          className="rounded p-1 text-danger hover:bg-danger/10"
                          aria-label="حذف البند"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="اختيار خدمة من الكتالوج">
                      <Select value={line.serviceId} onChange={(e) => pickService(i, e.target.value)}>
                        <option value="">— بند مخصص —</option>
                        {options.services.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nameAr}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="اسم البند (عربي)" required>
                      <Input
                        value={line.nameAr}
                        onChange={(e) => updateLine(i, { nameAr: e.target.value })}
                        required
                      />
                    </Field>
                    <Field label="اسم البند (إنجليزي)">
                      <Input
                        value={line.nameEn}
                        onChange={(e) => updateLine(i, { nameEn: e.target.value })}
                        dir="ltr"
                      />
                    </Field>
                    <Field label="الوصف">
                      <Input
                        value={line.description}
                        onChange={(e) => updateLine(i, { description: e.target.value })}
                      />
                    </Field>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <Field label="الكمية" required>
                      <Input
                        type="number"
                        min="0.0001"
                        step="0.25"
                        dir="ltr"
                        value={line.quantity}
                        onChange={(e) => updateLine(i, { quantity: e.target.value })}
                        required
                      />
                    </Field>
                    <Field label="سعر الوحدة" required>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        dir="ltr"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                        required
                      />
                    </Field>
                    <Field label="نوع الخصم">
                      <Select
                        value={line.discountType}
                        onChange={(e) => updateLine(i, { discountType: e.target.value as Line['discountType'] })}
                      >
                        <option value="NONE">بدون</option>
                        <option value="PERCENT">نسبة %</option>
                        <option value="AMOUNT">مبلغ</option>
                      </Select>
                    </Field>
                    <Field label="قيمة الخصم">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        dir="ltr"
                        value={line.discountValue}
                        onChange={(e) => updateLine(i, { discountValue: e.target.value })}
                        disabled={line.discountType === 'NONE'}
                      />
                    </Field>
                    <Field label="الضريبة">
                      <Select
                        value={line.taxRateId}
                        onChange={(e) => {
                          const t = options.taxRates.find((x) => x.id === e.target.value);
                          updateLine(i, { taxRateId: e.target.value, taxRate: t ? String(t.rate) : '0' });
                        }}
                      >
                        <option value="">بدون ضريبة</option>
                        {options.taxRates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nameAr}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="جدول السداد"
              subtitle="مجموع النسب يجب أن يساوي 100% — فرق التقريب يُضاف تلقائيًا لآخر قسط"
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setInstallments((p) => [
                      ...p,
                      { label: `الدفعة ${p.length + 1}`, percentage: '0', dueOffsetDays: '0' },
                    ])
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  دفعة
                </Button>
              }
            />
            <CardBody className="space-y-2">
              {installments.length === 0 && (
                <p className="text-[11px] text-ink-faint">لا يوجد جدول سداد — سيُعتبر السداد دفعة واحدة.</p>
              )}
              {installments.map((inst, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <Field label="الوصف" className="min-w-[8rem] flex-1">
                    <Input
                      value={inst.label}
                      onChange={(e) =>
                        setInstallments((p) => p.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)))
                      }
                      required
                    />
                  </Field>
                  <Field label="النسبة %" className="w-24">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      dir="ltr"
                      value={inst.percentage}
                      onChange={(e) =>
                        setInstallments((p) =>
                          p.map((x, xi) => (xi === i ? { ...x, percentage: e.target.value } : x)),
                        )
                      }
                    />
                  </Field>
                  <Field label="بعد (يوم)" className="w-24">
                    <Input
                      type="number"
                      min="0"
                      dir="ltr"
                      value={inst.dueOffsetDays}
                      onChange={(e) =>
                        setInstallments((p) =>
                          p.map((x, xi) => (xi === i ? { ...x, dueOffsetDays: e.target.value } : x)),
                        )
                      }
                    />
                  </Field>
                  <div className="num w-28 pb-2 text-xs text-ink-muted">
                    {money(mulDivRound(totals.total, toScaled(inst.percentage || '0'), 100n * SCALE))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setInstallments((p) => p.filter((_, xi) => xi !== i))}
                    className="mb-1.5 rounded p-1.5 text-danger hover:bg-danger/10"
                    aria-label="حذف الدفعة"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {installments.length > 0 && (
                <p className={`text-[11px] ${installmentsValid ? 'text-ok' : 'text-danger'}`}>
                  مجموع النسب: {installmentSum}%{installmentsValid ? ' ✓' : ' — يجب أن يساوي 100%'}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="الشروط والملاحظات" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="شروط الدفع">
                <Input name="paymentTerms" defaultValue={initial?.paymentTerms ?? ''} />
              </Field>
              <Field label="ملاحظة الصلاحية">
                <Input name="validityNote" defaultValue={initial?.validityNote ?? ''} />
              </Field>
              <Field label="شروط التنفيذ" className="sm:col-span-2">
                <Textarea name="executionTerms" rows={2} defaultValue={initial?.executionTerms ?? ''} />
              </Field>
              <Field label="الشروط والأحكام (عربي)">
                <Textarea
                  name="termsAr"
                  rows={5}
                  defaultValue={initial?.termsAr ?? options.settings.defaultTermsAr}
                />
              </Field>
              <Field label="الشروط والأحكام (إنجليزي)">
                <Textarea
                  name="termsEn"
                  rows={5}
                  dir="ltr"
                  defaultValue={initial?.termsEn ?? options.settings.defaultTermsEn}
                />
              </Field>
              <Field label="ملاحظات داخلية" className="sm:col-span-2">
                <Textarea name="notes" rows={2} defaultValue={initial?.notes ?? ''} />
              </Field>
            </CardBody>
          </Card>
        </div>

        {/* ملخص لزج */}
        <div className="space-y-4">
          <Card className="lg:sticky lg:top-[calc(var(--bp-header-h)+1rem)]">
            <CardHeader title="ملخص العرض" />
            <CardBody className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="خصم على الإجمالي">
                  <Select
                    value={headerDiscountType}
                    onChange={(e) => setHeaderDiscountType(e.target.value as 'NONE' | 'PERCENT' | 'AMOUNT')}
                  >
                    <option value="NONE">بدون</option>
                    <option value="PERCENT">نسبة %</option>
                    <option value="AMOUNT">مبلغ</option>
                  </Select>
                </Field>
                <Field label="القيمة">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    dir="ltr"
                    value={headerDiscountValue}
                    onChange={(e) => setHeaderDiscountValue(e.target.value)}
                    disabled={headerDiscountType === 'NONE'}
                  />
                </Field>
              </div>

              <dl className="space-y-1.5 border-t border-line pt-3 text-sm">
                <Row label="المجموع الفرعي" value={money(totals.subtotal)} />
                <Row label="إجمالي الخصم" value={`− ${money(totals.discount)}`} />
                <Row label="إجمالي الضريبة" value={money(totals.tax)} />
              </dl>
              <div className="flex items-center justify-between rounded-md bg-bp-gradient px-3 py-2.5 text-white">
                <span className="text-xs font-medium">الإجمالي النهائي</span>
                <span className="num text-base font-bold">{money(totals.total)}</span>
              </div>

              <Button type="submit" loading={pending} className="w-full justify-center" size="lg">
                <Save className="h-4 w-4" />
                {initial?.id ? 'حفظ' : 'إنشاء عرض السعر'}
              </Button>
              {initial?.id && initial.status && ['SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'].includes(initial.status) && (
                <p className="rounded-md border border-warn/25 bg-warn/10 px-3 py-2 text-[11px] text-warn">
                  هذا العرض أُرسل بالفعل — الحفظ سينشئ نسخة جديدة (إصدار أعلى) دون تعديل النسخة الحالية.
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="num text-xs text-ink">{value}</dd>
    </div>
  );
}

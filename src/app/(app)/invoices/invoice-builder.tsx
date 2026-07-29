'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Save, FileInput } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/format';
import { options as labelOptions } from '@/i18n/labels';
import { createInvoiceAction, invoiceFromQuotationAction } from './actions';

interface Line {
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

interface Options {
  clients: { id: string; legalName: string; brandName: string | null; currency: string }[];
  projects: { id: string; name: string; clientId: string }[];
  contracts: { id: string; number: string; clientId: string }[];
  quotations: { id: string; number: string; clientId: string | null }[];
  taxRates: { id: string; nameAr: string; rate: number }[];
}

const emptyLine = (): Line => ({
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

export function InvoiceBuilder({
  options,
  defaults,
}: {
  options: Options;
  defaults: { clientId?: string; projectId?: string; quotationId?: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  const [clientId, setClientId] = React.useState(defaults.clientId ?? '');
  const [currency, setCurrency] = React.useState('EGP');
  const [lines, setLines] = React.useState<Line[]>([emptyLine()]);

  const totals = React.useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    let tax = 0;
    for (const l of lines) {
      const s = Math.round(Number(l.quantity || 0) * Number(l.unitPrice || 0) * 100);
      let d = 0;
      if (l.discountType === 'PERCENT') d = Math.round((s * Number(l.discountValue || 0)) / 100);
      else if (l.discountType === 'AMOUNT') d = Math.round(Number(l.discountValue || 0) * 100);
      if (d > s) d = s;
      const t = Math.round(((s - d) * Number(l.taxRate || 0)) / 100);
      subtotal += s;
      discount += d;
      tax += t;
    }
    return { subtotal, discount, tax, total: subtotal - discount + tax };
  }, [lines]);

  const update = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, x) => (x === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-4">
      {options.quotations.length > 0 && (
        <Card>
          <CardHeader
            title="توليد من عرض سعر مقبول"
            subtitle="ينسخ البنود والضرائب والمجاميع كما هي بدون إعادة إدخال"
          />
          <CardBody className="flex flex-wrap items-end gap-3">
            <Field label="عرض السعر" className="min-w-[14rem] flex-1">
              <Select id="fromQuotation">
                <option value="">— اختر —</option>
                {options.quotations.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.number}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              type="button"
              variant="secondary"
              loading={pending}
              onClick={async () => {
                const el = document.getElementById('fromQuotation') as HTMLSelectElement | null;
                if (!el?.value) return toast.error('اختر عرض سعر أولًا');
                setPending(true);
                const res = await invoiceFromQuotationAction(el.value);
                setPending(false);
                if (!res.ok) return toast.error(res.error);
                toast.success('تم إنشاء الفاتورة من عرض السعر');
                router.push(`/invoices/${(res.data as { id: string }).id}`);
              }}
            >
              <FileInput className="h-4 w-4" />
              توليد الفاتورة
            </Button>
          </CardBody>
        </Card>
      )}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setPending(true);
          const res = await createInvoiceAction({
            ...Object.fromEntries(fd.entries()),
            clientId,
            currency,
            items: lines.map((l) => ({
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
          });
          setPending(false);
          if (!res.ok) return toast.error(res.error);
          toast.success('تم إنشاء الفاتورة');
          router.push(`/invoices/${(res.data as { id: string }).id}`);
        }}
        className="grid gap-4 lg:grid-cols-3"
      >
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="بيانات الفاتورة" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="العميل" required>
                <Select
                  value={clientId}
                  onChange={(e) => {
                    setClientId(e.target.value);
                    const c = options.clients.find((x) => x.id === e.target.value);
                    if (c) setCurrency(c.currency);
                  }}
                  required
                >
                  <option value="">— اختر —</option>
                  {options.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.brandName || c.legalName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="المشروع">
                <Select name="projectId" defaultValue={defaults.projectId ?? ''}>
                  <option value="">— بدون —</option>
                  {options.projects
                    .filter((p) => !clientId || p.clientId === clientId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="العقد">
                <Select name="contractId" defaultValue="">
                  <option value="">— بدون —</option>
                  {options.contracts
                    .filter((c) => !clientId || c.clientId === clientId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.number}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="العملة">
                <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="EGP">EGP</option>
                  <option value="SAR">SAR</option>
                  <option value="USD">USD</option>
                  <option value="AED">AED</option>
                </Select>
              </Field>
              <Field label="تاريخ الإصدار" required>
                <Input
                  name="issueDate"
                  type="date"
                  dir="ltr"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </Field>
              <Field label="تاريخ الاستحقاق" required>
                <Input
                  name="dueDate"
                  type="date"
                  dir="ltr"
                  required
                  defaultValue={new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10)}
                />
              </Field>
              <Field label="طريقة الدفع المتوقعة">
                <Select name="paymentMethod" defaultValue="">
                  <option value="">— غير محددة —</option>
                  {labelOptions('paymentMethod').map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="ملاحظات" className="sm:col-span-2">
                <Textarea name="notes" rows={2} />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="البنود"
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setLines((l) => [...l, emptyLine()])}
                >
                  <Plus className="h-3.5 w-3.5" />
                  بند
                </Button>
              }
            />
            <CardBody className="space-y-3">
              {lines.map((line, i) => (
                <div key={i} className="rounded-md border border-line bg-surface-sunken/50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] text-ink-faint">البند {i + 1}</span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLines((prev) => prev.filter((_, x) => x !== i))}
                        className="rounded p-1 text-danger hover:bg-danger/10"
                        aria-label="حذف"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="الوصف (عربي)" required>
                      <Input value={line.nameAr} onChange={(e) => update(i, { nameAr: e.target.value })} required />
                    </Field>
                    <Field label="الوصف (إنجليزي)">
                      <Input value={line.nameEn} onChange={(e) => update(i, { nameEn: e.target.value })} dir="ltr" />
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
                        onChange={(e) => update(i, { quantity: e.target.value })}
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
                        onChange={(e) => update(i, { unitPrice: e.target.value })}
                        required
                      />
                    </Field>
                    <Field label="نوع الخصم">
                      <Select
                        value={line.discountType}
                        onChange={(e) => update(i, { discountType: e.target.value as Line['discountType'] })}
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
                        onChange={(e) => update(i, { discountValue: e.target.value })}
                        disabled={line.discountType === 'NONE'}
                      />
                    </Field>
                    <Field label="الضريبة">
                      <Select
                        value={line.taxRateId}
                        onChange={(e) => {
                          const t = options.taxRates.find((x) => x.id === e.target.value);
                          update(i, { taxRateId: e.target.value, taxRate: t ? String(t.rate) : '0' });
                        }}
                      >
                        <option value="">بدون</option>
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
        </div>

        <div>
          <Card className="lg:sticky lg:top-[calc(var(--bp-header-h)+1rem)]">
            <CardHeader title="الإجماليات" />
            <CardBody className="space-y-2">
              <Row label="المجموع الفرعي" value={formatMoney(totals.subtotal, currency)} />
              <Row label="الخصم" value={`− ${formatMoney(totals.discount, currency)}`} />
              <Row label="الضريبة" value={formatMoney(totals.tax, currency)} />
              <div className="mt-2 flex items-center justify-between rounded-md bg-bp-gradient px-3 py-2.5 text-white">
                <span className="text-xs font-medium">الإجمالي</span>
                <span className="num text-base font-bold">{formatMoney(totals.total, currency)}</span>
              </div>
              <Button type="submit" loading={pending} className="w-full justify-center" size="lg">
                <Save className="h-4 w-4" />
                إنشاء الفاتورة
              </Button>
            </CardBody>
          </Card>
        </div>
      </form>
    </div>
  );
}

function Row({ label: l, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-ink-faint">{l}</span>
      <span className="num text-xs text-ink">{value}</span>
    </div>
  );
}

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, Plus, Minus, AlertTriangle } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Drawer } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/format';
import { createAdWalletTransactionAction } from './actions';

export interface AdWalletBalanceRow {
  clientId: string;
  clientName: string;
  depositedInRangeMinor: number;
  withdrawnInRangeMinor: number;
  balanceMinor: number;
}

export function AdWalletsSection({
  data,
  clients,
  canCreate,
}: {
  data: AdWalletBalanceRow[];
  clients: { id: string; name: string }[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [clientId, setClientId] = React.useState('');
  const [type, setType] = React.useState<'DEPOSIT' | 'WITHDRAWAL'>('DEPOSIT');
  const [amount, setAmount] = React.useState('');

  const selectedBalance = data.find((r) => r.clientId === clientId)?.balanceMinor ?? 0;
  const willGoNegative =
    type === 'WITHDRAWAL' && amount !== '' && Number(amount) * 100 > selectedBalance;

  const resetForm = () => {
    setClientId('');
    setType('DEPOSIT');
    setAmount('');
  };

  return (
    <Card>
      <CardHeader
        title="أرصدة إعلانات العملاء"
        subtitle="أمانة لدى الشركة — أموال العملاء لإنفاقها على إعلاناتهم، منفصلة تمامًا عن أموال الشركة ولا تدخل في أي حساب مالي آخر"
        action={
          canCreate && (
            <Button
              size="sm"
              type="button"
              onClick={() => {
                resetForm();
                setOpen(true);
              }}
            >
              <Wallet className="h-3.5 w-3.5" />
              إضافة / خصم رصيد
            </Button>
          )
        }
      />
      <CardBody className="p-0">
        {data.length === 0 ? (
          <EmptyState
            title="لا توجد أرصدة إعلانات مسجَّلة"
            description="سجّل أول إيداع لعميل من زر «إضافة / خصم رصيد»."
          />
        ) : (
          <div className="bp-table-scroll">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-sunken/60 text-[11px] text-ink-faint">
                  <th className="px-3 py-2 text-start">العميل</th>
                  <th className="px-3 py-2 text-end">المضاف (الفترة)</th>
                  <th className="px-3 py-2 text-end">المخصوم (الفترة)</th>
                  <th className="px-3 py-2 text-end">الرصيد المتبقي (تراكمي)</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.clientId} className="border-b border-line/60 last:border-0">
                    <td className="px-3 py-2.5 text-ink">{r.clientName}</td>
                    <td className="num px-3 py-2.5 text-end text-ok">
                      {formatMoney(r.depositedInRangeMinor)}
                    </td>
                    <td className="num px-3 py-2.5 text-end text-warn">
                      {formatMoney(r.withdrawnInRangeMinor)}
                    </td>
                    <td
                      className={
                        r.balanceMinor >= 0
                          ? 'num px-3 py-2.5 text-end font-semibold text-ink'
                          : 'num px-3 py-2.5 text-end font-semibold text-danger'
                      }
                    >
                      {formatMoney(r.balanceMinor)}
                      {r.balanceMinor < 0 && (
                        <Badge tone="danger" className="ms-2">
                          سالب
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>

      <Drawer open={open} onClose={() => setOpen(false)} title="إضافة / خصم رصيد إعلانات" width="sm">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setPending(true);
            const res = await createAdWalletTransactionAction(Object.fromEntries(fd.entries()));
            setPending(false);
            if (!res.ok) return toast.error(res.error);
            toast.success(type === 'DEPOSIT' ? 'تم تسجيل الإيداع' : 'تم تسجيل الخصم');
            setOpen(false);
            resetForm();
            router.refresh();
          }}
          className="space-y-4"
        >
          <Field label="العميل" required>
            <Select
              name="clientId"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
            >
              <option value="">— اختر العميل —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          {clientId && (
            <p className="text-[11px] text-ink-faint">
              الرصيد الحالي: <span className="num font-medium text-ink">{formatMoney(selectedBalance)}</span>
            </p>
          )}

          <Field label="نوع العملية" required>
            <Select
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value as 'DEPOSIT' | 'WITHDRAWAL')}
            >
              <option value="DEPOSIT">إضافة رصيد</option>
              <option value="WITHDRAWAL">خصم رصيد</option>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="المبلغ" required>
              <Input
                name="amount"
                type="number"
                min={0.01}
                step="0.01"
                dir="ltr"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="العملة">
              <Select name="currency" defaultValue="EGP">
                <option value="EGP">EGP</option>
                <option value="SAR">SAR</option>
                <option value="USD">USD</option>
                <option value="AED">AED</option>
              </Select>
            </Field>
          </div>

          {willGoNegative && (
            <div className="flex items-start gap-2 rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                المبلغ أكبر من الرصيد المتبقي الحالي ({formatMoney(selectedBalance)}) — سيصبح رصيد
                العميل سالبًا. يمكنك المتابعة إن كنت متأكدًا.
              </span>
            </div>
          )}

          <Field label="التاريخ" required>
            <Input
              name="occurredAt"
              type="date"
              dir="ltr"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </Field>

          <Field label="ملاحظة" hint="مثلًا: اسم الحملة أو سبب الخصم">
            <Textarea name="note" rows={2} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" loading={pending}>
              {type === 'DEPOSIT' ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
              حفظ
            </Button>
          </div>
        </form>
      </Drawer>
    </Card>
  );
}

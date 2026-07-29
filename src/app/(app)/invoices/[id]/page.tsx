import Link from 'next/link';
import type { Metadata } from 'next';
import { requirePermission, can } from '@/server/auth/guard';
import { findOr404 } from '@/server/auth/page-guard';
import { getInvoice } from '@/server/services/invoices';
import { PageHeader } from '@/components/page-header';
import { Eye, FileDown } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, KeyValue, Progress } from '@/components/ui/primitives';
import { formatDate, formatMoney } from '@/lib/format';
import { label, tone } from '@/i18n/labels';
import { plain } from '@/lib/utils';
import { InvoiceActions } from './invoice-actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const inv = await getInvoice(id);
    return { title: inv.number };
  } catch {
    return { title: 'فاتورة' };
  }
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('invoices', 'view');
  const invoice = await findOr404(() => getInvoice(id));
  const money = (v: bigint) => formatMoney(v, invoice.currency);
  const paidPercent =
    invoice.totalMinor > 0n ? Number((invoice.paidMinor * 100n) / invoice.totalMinor) : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={invoice.number}
        description={invoice.client.brandName || invoice.client.legalName}
        breadcrumbs={[
          { label: 'المالية' },
          { label: 'الفواتير', href: '/invoices' },
          { label: invoice.number },
        ]}
        badge={
          <Badge tone={tone('invoiceStatus', invoice.status)} dot>
            {label('invoiceStatus', invoice.status)}
          </Badge>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <a href={`/api/invoices/${id}/pdf?preview=1`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="ghost">
                <Eye className="h-3.5 w-3.5" />
                معاينة
              </Button>
            </a>
            <a href={`/api/invoices/${id}/pdf?lang=ar`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="secondary">
                <FileDown className="h-3.5 w-3.5" />
                PDF عربي
              </Button>
            </a>
            <a href={`/api/invoices/${id}/pdf?lang=en`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="secondary">
                <FileDown className="h-3.5 w-3.5" />
                PDF English
              </Button>
            </a>
            <InvoiceActions
              invoice={plain({
                id: invoice.id,
                number: invoice.number,
                status: invoice.status,
                clientId: invoice.clientId,
                currency: invoice.currency,
                remainingMinor: invoice.totalMinor - invoice.paidMinor,
              }) as never}
              perms={{
                canEdit: can(user, 'invoices', 'edit'),
                canRecordPayment: can(user, 'payments', 'create'),
              }}
            />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="البنود" />
            <CardBody className="p-0">
              <div className="bp-table-scroll">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface-sunken/60 text-[11px] text-ink-faint">
                      <th className="px-3 py-2 text-start">البند</th>
                      <th className="px-3 py-2 text-center">الكمية</th>
                      <th className="px-3 py-2 text-end">السعر</th>
                      <th className="px-3 py-2 text-end">الضريبة</th>
                      <th className="px-3 py-2 text-end">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item) => (
                      <tr key={item.id} className="border-b border-line/60 last:border-0">
                        <td className="px-3 py-2.5">
                          <p className="text-ink">{item.nameAr}</p>
                          {item.description && (
                            <p className="text-[11px] text-ink-faint">{item.description}</p>
                          )}
                        </td>
                        <td className="num px-3 py-2.5 text-center">{Number(item.quantity)}</td>
                        <td className="num px-3 py-2.5 text-end">{money(item.unitPriceMinor)}</td>
                        <td className="num px-3 py-2.5 text-end">
                          {item.taxMinor > 0n ? money(item.taxMinor) : '—'}
                        </td>
                        <td className="num px-3 py-2.5 text-end font-medium">{money(item.totalMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="المدفوعات" subtitle="المبلغ المدفوع مشتق من هذه السجلات ولا يُدخل يدويًا" />
            <CardBody className="p-0">
              {invoice.payments.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-ink-faint">لا توجد مدفوعات مسجلة</p>
              ) : (
                <ul className="divide-y divide-line">
                  {invoice.payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                      <div>
                        <p className="num text-sm text-ink">{money(p.amountMinor)}</p>
                        <p className="text-[11px] text-ink-faint">
                          {formatDate(p.paidAt, 'ar', user.timezone)} · {label('paymentMethod', p.method)}
                          {p.reference && ` · ${p.reference}`}
                        </p>
                      </div>
                      <span className="text-[11px] text-ink-faint">سجّلها {p.recordedBy.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="الإجماليات" />
            <CardBody className="space-y-2">
              <Row label="المجموع الفرعي" value={money(invoice.subtotalMinor)} />
              {invoice.discountMinor > 0n && (
                <Row label="الخصم" value={`− ${money(invoice.discountMinor)}`} />
              )}
              <Row label="الضريبة" value={money(invoice.taxMinor)} />
              <Row label="الإجمالي" value={money(invoice.totalMinor)} />
              <Row label="المدفوع" value={money(invoice.paidMinor)} />
              <div className="mt-2 flex items-center justify-between rounded-md bg-bp-gradient px-3 py-2.5 text-white">
                <span className="text-xs font-medium">المتبقي</span>
                <span className="num text-base font-bold">
                  {money(invoice.totalMinor - invoice.paidMinor)}
                </span>
              </div>
              <Progress value={paidPercent} showLabel tone={paidPercent >= 100 ? 'ok' : 'brand'} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="التفاصيل" />
            <CardBody>
              <dl className="divide-y divide-line/60">
                <KeyValue label="العميل">
                  <Link href={`/clients/${invoice.client.id}`} className="text-brand hover:underline">
                    {invoice.client.brandName || invoice.client.legalName}
                  </Link>
                </KeyValue>
                <KeyValue label="تاريخ الإصدار">
                  {formatDate(invoice.issueDate, 'ar', user.timezone)}
                </KeyValue>
                <KeyValue label="تاريخ الاستحقاق">
                  {formatDate(invoice.dueDate, 'ar', user.timezone)}
                </KeyValue>
                {invoice.project && (
                  <KeyValue label="المشروع">
                    <Link href={`/projects/${invoice.project.id}`} className="text-brand hover:underline">
                      {invoice.project.name}
                    </Link>
                  </KeyValue>
                )}
                {invoice.contract && (
                  <KeyValue label="العقد">
                    <Link href={`/contracts/${invoice.contract.id}`} className="text-brand hover:underline">
                      {invoice.contract.number}
                    </Link>
                  </KeyValue>
                )}
                {invoice.quotation && (
                  <KeyValue label="عرض السعر">
                    <Link href={`/quotations/${invoice.quotation.id}`} className="text-brand hover:underline">
                      {invoice.quotation.number}
                    </Link>
                  </KeyValue>
                )}
                {invoice.cancelReason && <KeyValue label="سبب الإلغاء">{invoice.cancelReason}</KeyValue>}
              </dl>
              {invoice.notes && (
                <p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 text-xs text-ink-muted">
                  {invoice.notes}
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
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

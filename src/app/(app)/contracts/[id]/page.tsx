import Link from 'next/link';
import type { Metadata } from 'next';
import { requirePermission } from '@/server/auth/guard';
import { findOr404 } from '@/server/auth/page-guard';
import { getContract } from '@/server/services/contracts';
import { PageHeader } from '@/components/page-header';
import { Eye, FileDown } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, KeyValue } from '@/components/ui/primitives';
import { formatDate, formatMoney, daysBetween } from '@/lib/format';
import { label, tone } from '@/i18n/labels';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const c = await getContract(id);
    return { title: c.number };
  } catch {
    return { title: 'عقد' };
  }
}

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('contracts', 'view');
  const contract = await findOr404(() => getContract(id));
  const daysToRenewal = contract.renewalDate ? daysBetween(contract.renewalDate) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={contract.number}
        description={contract.title}
        breadcrumbs={[
          { label: 'العملاء' },
          { label: 'العقود', href: '/contracts' },
          { label: contract.number },
        ]}
        badge={
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={tone('contractStatus', contract.status)} dot>
              {label('contractStatus', contract.status)}
            </Badge>
            {daysToRenewal !== null && daysToRenewal >= 0 && daysToRenewal <= 30 && (
              <Badge tone="warn">التجديد بعد {daysToRenewal} يوم</Badge>
            )}
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <a href={`/api/contracts/${id}/pdf?preview=1`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="ghost">
                <Eye className="h-3.5 w-3.5" />
                معاينة الملخص
              </Button>
            </a>
            <a href={`/api/contracts/${id}/pdf?lang=ar`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="secondary">
                <FileDown className="h-3.5 w-3.5" />
                ملخص PDF عربي
              </Button>
            </a>
            <a href={`/api/contracts/${id}/pdf?lang=en`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="secondary">
                <FileDown className="h-3.5 w-3.5" />
                Summary PDF
              </Button>
            </a>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="الخدمات المشمولة" />
            <CardBody>
              {contract.services.length === 0 ? (
                <p className="text-xs text-ink-faint">لم تُحدَّد خدمات لهذا العقد.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {contract.services.map((s) => (
                    <li key={s.serviceId}>
                      <Badge tone="brand">{s.service.nameAr}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {contract.projects.length > 0 && (
            <Card>
              <CardHeader title="المشاريع المرتبطة" />
              <CardBody className="p-0">
                <ul className="divide-y divide-line">
                  {contract.projects.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/projects/${p.id}`}
                        className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-navy-800/40"
                      >
                        <span className="truncate text-sm text-ink">{p.name}</span>
                        <Badge tone={tone('projectStatus', p.status)}>
                          {label('projectStatus', p.status)}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {contract.invoices.length > 0 && (
            <Card>
              <CardHeader title="الفواتير" />
              <CardBody className="p-0">
                <ul className="divide-y divide-line">
                  {contract.invoices.map((inv) => (
                    <li key={inv.id}>
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-navy-800/40"
                      >
                        <span className="num text-sm text-ink">{inv.number}</span>
                        <div className="flex items-center gap-2">
                          <span className="num text-xs text-ink-muted">
                            {formatMoney(inv.paidMinor, inv.currency)} / {formatMoney(inv.totalMinor, inv.currency)}
                          </span>
                          <Badge tone={tone('invoiceStatus', inv.status)}>
                            {label('invoiceStatus', inv.status)}
                          </Badge>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {contract.notes && (
            <Card>
              <CardHeader title="ملاحظات" />
              <CardBody>
                <p className="whitespace-pre-wrap text-xs text-ink-muted">{contract.notes}</p>
              </CardBody>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader title="تفاصيل العقد" />
          <CardBody>
            <dl className="divide-y divide-line/60">
              <KeyValue label="العميل">
                <Link href={`/clients/${contract.client.id}`} className="text-brand hover:underline">
                  {contract.client.brandName || contract.client.legalName}
                </Link>
              </KeyValue>
              {contract.valueMinor !== null && (
                <KeyValue label="قيمة العقد">
                  <span className="num">{formatMoney(contract.valueMinor, contract.currency)}</span>
                </KeyValue>
              )}
              <KeyValue label="تاريخ البداية">{formatDate(contract.startDate, 'ar', user.timezone)}</KeyValue>
              <KeyValue label="تاريخ الانتهاء">{formatDate(contract.endDate, 'ar', user.timezone)}</KeyValue>
              <KeyValue label="تاريخ التجديد">{formatDate(contract.renewalDate, 'ar', user.timezone)}</KeyValue>
              <KeyValue label="تجديد تلقائي">{contract.autoRenew ? 'نعم' : 'لا'}</KeyValue>
              <KeyValue label="تنبيهات التجديد">
                <span className="num">{contract.reminderDays.join('، ')} يوم قبل الموعد</span>
              </KeyValue>
              <KeyValue label="شروط الدفع">{contract.paymentTerms ?? '—'}</KeyValue>
              <KeyValue label="المسؤول">{contract.owner.name}</KeyValue>
              {contract.quotation && (
                <KeyValue label="عرض السعر">
                  <Link href={`/quotations/${contract.quotation.id}`} className="text-brand hover:underline">
                    {contract.quotation.number}
                  </Link>
                </KeyValue>
              )}
            </dl>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

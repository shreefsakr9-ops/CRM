import Link from 'next/link';
import type { Metadata } from 'next';
import { FileDown, Eye, Pencil } from 'lucide-react';
import { requirePermission, can } from '@/server/auth/guard';
import { findOr404 } from '@/server/auth/page-guard';
import { getQuotation } from '@/server/services/quotations';
import { PageHeader } from '@/components/page-header';
import { Badge, Button, Card, CardBody, CardHeader, KeyValue } from '@/components/ui/primitives';
import { formatDate, formatMoney } from '@/lib/format';
import { label, tone } from '@/i18n/labels';
import { QuotationActions } from './quotation-actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const q = await getQuotation(id);
    return { title: q.number };
  } catch {
    return { title: 'عرض سعر' };
  }
}

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('quotations', 'view');
  const q = await findOr404(() => getQuotation(id));
  const money = (v: bigint) => formatMoney(v, q.currency);

  return (
    <div className="space-y-5">
      <PageHeader
        title={q.number}
        description={
          q.client?.brandName || q.client?.legalName || q.lead?.fullName || 'غير مرتبط بعميل'
        }
        breadcrumbs={[
          { label: 'المبيعات' },
          { label: 'عروض الأسعار', href: '/quotations' },
          { label: q.number },
        ]}
        badge={
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={tone('quotationStatus', q.status)} dot>
              {label('quotationStatus', q.status)}
            </Badge>
            {q.version > 1 && <Badge tone="info">الإصدار {q.version}</Badge>}
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <a href={`/api/quotations/${id}/pdf?preview=1`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="ghost">
                <Eye className="h-3.5 w-3.5" />
                معاينة
              </Button>
            </a>
            <a href={`/api/quotations/${id}/pdf?lang=ar`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="secondary">
                <FileDown className="h-3.5 w-3.5" />
                PDF عربي
              </Button>
            </a>
            <a href={`/api/quotations/${id}/pdf?lang=en`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="secondary">
                <FileDown className="h-3.5 w-3.5" />
                PDF English
              </Button>
            </a>
            {can(user, 'quotations', 'edit') && (
              <Link href={`/quotations/${id}/edit`}>
                <Button size="sm" variant="secondary">
                  <Pencil className="h-3.5 w-3.5" />
                  تعديل
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <QuotationActions
        id={id}
        status={q.status}
        preparedById={q.preparedById}
        currentUserId={user.id}
        perms={{
          canEdit: can(user, 'quotations', 'edit'),
          canApprove: can(user, 'quotations', 'approve'),
          canCreateContract: can(user, 'contracts', 'create'),
          canCreateProject: can(user, 'projects', 'create'),
        }}
        clientId={q.clientId}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="البنود" />
            <CardBody className="p-0">
              <div className="bp-table-scroll">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface-sunken/60 text-[11px] text-ink-faint">
                      <th className="px-3 py-2 text-start">البند</th>
                      <th className="px-3 py-2 text-center">الكمية</th>
                      <th className="px-3 py-2 text-end">سعر الوحدة</th>
                      <th className="px-3 py-2 text-end">الخصم</th>
                      <th className="px-3 py-2 text-end">الضريبة</th>
                      <th className="px-3 py-2 text-end">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.items.map((item) => (
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
                          {item.discountMinor > 0n ? money(item.discountMinor) : '—'}
                        </td>
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

          {q.installments.length > 0 && (
            <Card>
              <CardHeader title="جدول السداد" />
              <CardBody className="p-0">
                <ul className="divide-y divide-line">
                  {q.installments.map((inst) => (
                    <li key={inst.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <div>
                        <p className="text-sm text-ink">{inst.label}</p>
                        <p className="num text-[11px] text-ink-faint">
                          {Number(inst.percentage)}% ·{' '}
                          {inst.dueDate ? formatDate(inst.dueDate, 'ar', user.timezone) : `بعد ${inst.dueOffsetDays} يوم`}
                        </p>
                      </div>
                      <span className="num text-sm text-ink">{money(inst.amountMinor)}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {(q.versions.length > 0 || q.parent) && (
            <Card>
              <CardHeader title="النسخ" subtitle="النسخ السابقة محفوظة كما هي ولا تُستبدل" />
              <CardBody className="p-0">
                <ul className="divide-y divide-line">
                  {q.parent && (
                    <li>
                      <Link
                        href={`/quotations/${q.parent.id}`}
                        className="flex items-center justify-between px-4 py-2.5 hover:bg-navy-800/40"
                      >
                        <span className="num text-sm text-ink">
                          {q.parent.number} (الأصل — الإصدار {q.parent.version})
                        </span>
                      </Link>
                    </li>
                  )}
                  {q.versions.map((v) => (
                    <li key={v.id}>
                      <Link
                        href={`/quotations/${v.id}`}
                        className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-navy-800/40"
                      >
                        <span className="num text-sm text-ink">
                          {v.number} — الإصدار {v.version}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="num text-xs text-ink-muted">{money(v.totalMinor)}</span>
                          <Badge tone={tone('quotationStatus', v.status)}>
                            {label('quotationStatus', v.status)}
                          </Badge>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {(q.termsAr || q.executionTerms) && (
            <Card>
              <CardHeader title="الشروط" />
              <CardBody className="space-y-3">
                {q.executionTerms && (
                  <div>
                    <p className="text-[11px] text-ink-faint">شروط التنفيذ</p>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-ink-muted">{q.executionTerms}</p>
                  </div>
                )}
                {q.termsAr && (
                  <div>
                    <p className="text-[11px] text-ink-faint">الشروط والأحكام</p>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-ink-muted">{q.termsAr}</p>
                  </div>
                )}
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="الإجماليات" />
            <CardBody className="space-y-2">
              <Row label="المجموع الفرعي" value={money(q.subtotalMinor)} />
              <Row label="إجمالي الخصم" value={`− ${money(q.discountMinor)}`} />
              <Row label="إجمالي الضريبة" value={money(q.taxMinor)} />
              <div className="mt-2 flex items-center justify-between rounded-md bg-bp-gradient px-3 py-2.5 text-white">
                <span className="text-xs font-medium">الإجمالي النهائي</span>
                <span className="num text-base font-bold">{money(q.totalMinor)}</span>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="التفاصيل" />
            <CardBody>
              <dl className="divide-y divide-line/60">
                <KeyValue label="تاريخ الإصدار">{formatDate(q.issueDate, 'ar', user.timezone)}</KeyValue>
                <KeyValue label="صالح حتى">{formatDate(q.expiryDate, 'ar', user.timezone)}</KeyValue>
                <KeyValue label="أعدّه">{q.preparedBy.name}</KeyValue>
                <KeyValue label="اعتمده">
                  {q.approvedBy ? `${q.approvedBy.name} · ${formatDate(q.approvedAt, 'ar', user.timezone)}` : '—'}
                </KeyValue>
                <KeyValue label="تاريخ الإرسال">{formatDate(q.sentAt, 'ar', user.timezone)}</KeyValue>
                <KeyValue label="تاريخ القبول">{formatDate(q.acceptedAt, 'ar', user.timezone)}</KeyValue>
                {q.rejectedAt && (
                  <KeyValue label="سبب الرفض">{q.rejectionReason ?? 'غير محدد'}</KeyValue>
                )}
                <KeyValue label="جهة الاتصال">{q.contact?.name ?? '—'}</KeyValue>
                <KeyValue label="شروط الدفع">{q.paymentTerms ?? '—'}</KeyValue>
                {q.deal && (
                  <KeyValue label="الصفقة">
                    <Link href={`/deals/${q.deal.id}`} className="text-brand hover:underline">
                      {q.deal.title}
                    </Link>
                  </KeyValue>
                )}
              </dl>
            </CardBody>
          </Card>

          {(q.contracts.length > 0 || q.projects.length > 0) && (
            <Card>
              <CardHeader title="ما نتج عن هذا العرض" />
              <CardBody className="space-y-2">
                {q.contracts.map((c) => (
                  <Link key={c.id} href={`/contracts/${c.id}`} className="block text-xs text-brand hover:underline">
                    عقد {c.number}
                  </Link>
                ))}
                {q.projects.map((p) => (
                  <Link key={p.id} href={`/projects/${p.id}`} className="block text-xs text-brand hover:underline">
                    مشروع {p.name}
                  </Link>
                ))}
              </CardBody>
            </Card>
          )}
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

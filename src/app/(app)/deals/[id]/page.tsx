import Link from 'next/link';
import type { Metadata } from 'next';
import { requirePermission, can } from '@/server/auth/guard';
import { getDeal } from '@/server/services/deals';
import { PageHeader } from '@/components/page-header';
import { Badge, Card, CardBody, CardHeader, KeyValue, Button } from '@/components/ui/primitives';
import { formatDate, formatMoney, formatPercent, formatDuration } from '@/lib/format';
import { label, tone } from '@/i18n/labels';
import { weightedForecast } from '@/server/services/money';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const deal = await getDeal(id);
    return { title: deal.title };
  } catch {
    return { title: 'صفقة' };
  }
}

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('deals', 'view');
  const deal = await getDeal(id);
  const showMoney = deal.valueMinor !== null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={deal.title}
        description={deal.client?.brandName || deal.client?.legalName || deal.lead?.fullName || undefined}
        breadcrumbs={[{ label: 'المبيعات' }, { label: 'الصفقات', href: '/deals' }, { label: deal.title }]}
        badge={
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={tone('dealStatus', deal.status)} dot>
              {label('dealStatus', deal.status)}
            </Badge>
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px]"
              style={{ background: `${deal.stage.color}22`, color: deal.stage.color }}
            >
              {deal.stage.nameAr}
            </span>
          </div>
        }
        actions={
          can(user, 'quotations', 'create') && (
            <Link href={`/quotations/new?dealId=${deal.id}`}>
              <Button size="sm">إنشاء عرض سعر</Button>
            </Link>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="سجل حركة المراحل" subtitle="من نقل الصفقة ومتى وكم بقيت في كل مرحلة" />
            <CardBody className="p-0">
              {deal.stageHistory.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-ink-faint">لا يوجد سجل بعد</p>
              ) : (
                <ul className="divide-y divide-line">
                  {deal.stageHistory.map((h) => (
                    <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm text-ink">
                          {h.fromStage ? `${h.fromStage.nameAr} ← ` : ''}
                          {h.toStage.nameAr}
                        </p>
                        <p className="text-[11px] text-ink-faint">
                          {h.movedBy.name} · {formatDate(h.movedAt, 'ar', user.timezone, true)}
                        </p>
                        {h.note && <p className="mt-0.5 text-[11px] text-ink-muted">{h.note}</p>}
                      </div>
                      {h.durationSeconds !== null && (
                        <span className="num text-[11px] text-ink-faint">
                          بقيت {formatDuration(Math.round(h.durationSeconds / 60))}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {deal.quotations.length > 0 && (
            <Card>
              <CardHeader title="عروض الأسعار" />
              <CardBody className="p-0">
                <ul className="divide-y divide-line">
                  {deal.quotations.map((q) => (
                    <li key={q.id}>
                      <Link
                        href={`/quotations/${q.id}`}
                        className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-navy-800/40"
                      >
                        <span className="num text-sm text-ink">{q.number}</span>
                        <div className="flex items-center gap-2">
                          {q.totalMinor !== null && (
                            <span className="num text-xs text-ink-muted">
                              {formatMoney(q.totalMinor, q.currency)}
                            </span>
                          )}
                          <Badge tone={tone('quotationStatus', q.status)}>
                            {label('quotationStatus', q.status)}
                          </Badge>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {deal.projects.length > 0 && (
            <Card>
              <CardHeader title="المشاريع المرتبطة" />
              <CardBody className="p-0">
                <ul className="divide-y divide-line">
                  {deal.projects.map((p) => (
                    <li key={p.id}>
                      <Link href={`/projects/${p.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-navy-800/40">
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
        </div>

        <Card>
          <CardHeader title="تفاصيل الصفقة" />
          <CardBody>
            <dl className="divide-y divide-line/60">
              {showMoney && (
                <>
                  <KeyValue label="القيمة">
                    <span className="num">{formatMoney(deal.valueMinor!, deal.currency)}</span>
                  </KeyValue>
                  <KeyValue label="التوقع المرجّح">
                    <span className="num">
                      {formatMoney(
                        weightedForecast(deal.valueMinor!, deal.probability.toString()),
                        deal.currency,
                      )}
                    </span>
                  </KeyValue>
                </>
              )}
              <KeyValue label="احتمالية الإغلاق">
                {formatPercent(Number(deal.probability), 'ar', 0)}
              </KeyValue>
              <KeyValue label="المسؤول">{deal.owner.name}</KeyValue>
              <KeyValue label="الخدمة">{deal.service?.nameAr ?? '—'}</KeyValue>
              <KeyValue label="الإغلاق المتوقع">{formatDate(deal.expectedCloseDate, 'ar', user.timezone)}</KeyValue>
              <KeyValue label="الإغلاق الفعلي">{formatDate(deal.actualCloseDate, 'ar', user.timezone)}</KeyValue>
              <KeyValue label="المنافس">{deal.competitor ?? '—'}</KeyValue>
              {deal.lossReason && <KeyValue label="سبب الخسارة">{deal.lossReason.nameAr}</KeyValue>}
              {deal.lead && (
                <KeyValue label="العميل المحتمل">
                  <Link href={`/leads/${deal.lead.id}`} className="text-brand hover:underline">
                    {deal.lead.fullName}
                  </Link>
                </KeyValue>
              )}
              {deal.client && (
                <KeyValue label="العميل">
                  <Link href={`/clients/${deal.client.id}`} className="text-brand hover:underline">
                    {deal.client.brandName || deal.client.legalName}
                  </Link>
                </KeyValue>
              )}
            </dl>
            {deal.objections && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="text-[11px] text-ink-faint">الاعتراضات</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-ink-muted">{deal.objections}</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

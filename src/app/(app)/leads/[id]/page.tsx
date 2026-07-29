import Link from 'next/link';
import type { Metadata } from 'next';
import { Pencil, Phone, MessageCircle, Mail } from 'lucide-react';
import { requirePermission, can } from '@/server/auth/guard';
import { findOr404 } from '@/server/auth/page-guard';
import { getLead, leadFormOptions } from '@/server/services/leads';
import { PageHeader } from '@/components/page-header';
import { Badge, Button, Card, CardBody, CardHeader, KeyValue } from '@/components/ui/primitives';
import { Timeline } from '@/components/timeline';
import { formatDate, formatMoney, formatRelative } from '@/lib/format';
import { label, tone } from '@/i18n/labels';
import { plain } from '@/lib/utils';
import { LeadActions } from './lead-actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const lead = await getLead(id);
    return { title: lead.fullName };
  } catch {
    return { title: 'عميل محتمل' };
  }
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('leads', 'view');
  const [lead, options] = await Promise.all([findOr404(() => getLead(id)), leadFormOptions()]);
  const showMoney = lead.estimatedValueMinor !== null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={lead.fullName}
        description={[lead.companyName, lead.city, lead.businessType].filter(Boolean).join(' · ')}
        breadcrumbs={[
          { label: 'المبيعات' },
          { label: 'العملاء المحتملون', href: '/leads' },
          { label: lead.fullName },
        ]}
        badge={
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={tone('leadStatus', lead.status)} dot>
              {label('leadStatus', lead.status)}
            </Badge>
            {lead.stage && (
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px]"
                style={{ background: `${lead.stage.color}22`, color: lead.stage.color }}
              >
                {lead.stage.nameAr}
              </span>
            )}
            <Badge tone={tone('priority', lead.priority)}>{label('priority', lead.priority)}</Badge>
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {lead.phone && (
              <a href={`tel:${lead.phone}`}>
                <Button variant="secondary" size="sm">
                  <Phone className="h-3.5 w-3.5" />
                  اتصال
                </Button>
              </a>
            )}
            {lead.whatsapp && (
              <a
                href={`https://wa.me/${lead.whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="secondary" size="sm">
                  <MessageCircle className="h-3.5 w-3.5" />
                  واتساب
                </Button>
              </a>
            )}
            {can(user, 'leads', 'edit') && (
              <Link href={`/leads/${id}/edit`}>
                <Button variant="secondary" size="sm">
                  <Pencil className="h-3.5 w-3.5" />
                  تعديل
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <LeadActions
        leadId={id}
        currentStageId={lead.stageId}
        stages={plain(options.stages) as never}
        lossReasons={plain(options.lossReasons) as never}
        users={plain(options.users) as never}
        converted={Boolean(lead.convertedClientId)}
        perms={{
          canEdit: can(user, 'leads', 'edit'),
          canConvert: can(user, 'clients', 'create'),
        }}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="السجل الزمني" subtitle="كل تواصل وتغيير حالة وإسناد مسجّل تلقائيًا" />
            <CardBody className="p-0">
              <Timeline items={plain(lead.activities) as never} timezone={user.timezone} />
            </CardBody>
          </Card>

          {lead.followUps.length > 0 && (
            <Card>
              <CardHeader title="المتابعات" />
              <CardBody className="p-0">
                <ul className="divide-y divide-line">
                  {lead.followUps.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink">{f.title}</p>
                        <p className="text-[11px] text-ink-faint">
                          {formatDate(f.dueAt, 'ar', user.timezone, true)} · {f.assignedTo.name}
                        </p>
                      </div>
                      <Badge tone={tone('followUpStatus', f.status)}>
                        {label('followUpStatus', f.status)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="البيانات" />
            <CardBody>
              <dl className="divide-y divide-line/60">
                <KeyValue label="الهاتف">
                  <span dir="ltr" className="num">
                    {lead.phone ?? '—'}
                  </span>
                </KeyValue>
                <KeyValue label="واتساب">
                  <span dir="ltr" className="num">
                    {lead.whatsapp ?? '—'}
                  </span>
                </KeyValue>
                <KeyValue label="البريد الإلكتروني">
                  {lead.email ? (
                    <a href={`mailto:${lead.email}`} className="text-brand hover:underline" dir="ltr">
                      {lead.email}
                    </a>
                  ) : (
                    '—'
                  )}
                </KeyValue>
                <KeyValue label="المصدر">{lead.source?.nameAr ?? '—'}</KeyValue>
                <KeyValue label="الحملة">{lead.campaign ?? '—'}</KeyValue>
                <KeyValue label="الخدمة المهتم بها">{lead.interestedService?.nameAr ?? '—'}</KeyValue>
                {showMoney && (
                  <KeyValue label="الميزانية التقديرية">
                    <span className="num">
                      {formatMoney(lead.estimatedValueMinor ?? 0, lead.currency)}
                    </span>
                  </KeyValue>
                )}
                <KeyValue label="المسؤول">{lead.assignedTo?.name ?? 'غير مسند'}</KeyValue>
                <KeyValue label="درجة التقييم">
                  <span className="num">{lead.score}/100</span>
                </KeyValue>
                <KeyValue label="أول تواصل">
                  {lead.firstContactAt ? formatDate(lead.firstContactAt, 'ar', user.timezone, true) : 'لم يتم'}
                </KeyValue>
                <KeyValue label="آخر تواصل">
                  {lead.lastContactAt ? formatRelative(lead.lastContactAt) : '—'}
                </KeyValue>
                <KeyValue label="المتابعة القادمة">
                  {lead.nextFollowUpAt ? (
                    <span
                      className={
                        new Date(lead.nextFollowUpAt) < new Date() ? 'text-danger' : 'text-ink'
                      }
                    >
                      {formatDate(lead.nextFollowUpAt, 'ar', user.timezone)}
                    </span>
                  ) : (
                    <span className="text-warn">غير محددة</span>
                  )}
                </KeyValue>
                <KeyValue label="الإغلاق المتوقع">
                  {lead.expectedCloseDate ? formatDate(lead.expectedCloseDate, 'ar', user.timezone) : '—'}
                </KeyValue>
                {lead.lossReason && (
                  <KeyValue label="سبب الخسارة">{lead.lossReason.nameAr}</KeyValue>
                )}
                {lead.convertedClient && (
                  <KeyValue label="تم التحويل إلى عميل">
                    <Link href={`/clients/${lead.convertedClient.id}`} className="text-brand hover:underline">
                      {lead.convertedClient.legalName}
                    </Link>
                  </KeyValue>
                )}
              </dl>
            </CardBody>
          </Card>

          {lead.notes && (
            <Card>
              <CardHeader title="ملاحظات" />
              <CardBody>
                <p className="whitespace-pre-wrap text-xs text-ink-muted">{lead.notes}</p>
              </CardBody>
            </Card>
          )}

          {lead.deals.length > 0 && (
            <Card>
              <CardHeader title="الصفقات المرتبطة" />
              <CardBody className="p-0">
                <ul className="divide-y divide-line">
                  {lead.deals.map((d) => (
                    <li key={d.id}>
                      <Link href={`/deals/${d.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-navy-800/40">
                        <span className="truncate text-sm text-ink">{d.title}</span>
                        {d.valueMinor !== null && (
                          <span className="num shrink-0 text-xs text-ink-muted">
                            {formatMoney(d.valueMinor, d.currency)}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {lead.quotations.length > 0 && (
            <Card>
              <CardHeader title="عروض الأسعار" />
              <CardBody className="p-0">
                <ul className="divide-y divide-line">
                  {lead.quotations.map((q) => (
                    <li key={q.id}>
                      <Link href={`/quotations/${q.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-navy-800/40">
                        <span className="num truncate text-sm text-ink">{q.number}</span>
                        <Badge tone={tone('quotationStatus', q.status)}>
                          {label('quotationStatus', q.status)}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

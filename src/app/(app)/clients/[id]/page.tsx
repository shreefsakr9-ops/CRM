import Link from 'next/link';
import type { Metadata } from 'next';
import { requirePermission, can } from '@/server/auth/guard';
import { getClient, clientFormOptions } from '@/server/services/clients';
import { PageHeader } from '@/components/page-header';
import { Badge, Card, CardBody, CardHeader, KeyValue, Progress } from '@/components/ui/primitives';
import { Timeline } from '@/components/timeline';
import { formatDate, formatMoney } from '@/lib/format';
import { label, tone } from '@/i18n/labels';
import { plain } from '@/lib/utils';
import { ClientDetailActions } from './client-detail-actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const client = await getClient(id);
    return { title: client.brandName || client.legalName };
  } catch {
    return { title: 'عميل' };
  }
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('clients', 'view');
  const [client, options] = await Promise.all([getClient(id), clientFormOptions()]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={client.brandName || client.legalName}
        description={[client.legalName, client.industry, client.city].filter(Boolean).join(' · ')}
        breadcrumbs={[
          { label: 'العملاء', href: '/clients' },
          { label: client.brandName || client.legalName },
        ]}
        badge={
          <Badge tone={tone('clientStatus', client.status)} dot>
            {label('clientStatus', client.status)}
          </Badge>
        }
        actions={
          <ClientDetailActions
            client={plain(client) as never}
            options={plain(options) as never}
            perms={{
              canEdit: can(user, 'clients', 'edit'),
              canManageContacts: can(user, 'contacts', 'create'),
              canCreateQuotation: can(user, 'quotations', 'create'),
              canCreateProject: can(user, 'projects', 'create'),
            }}
          />
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="جهات الاتصال" subtitle="حدّد صاحب القرار والمسؤول المالي ومسؤول الاعتماد" />
            <CardBody className="p-0">
              {client.contacts.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-ink-faint">لا توجد جهات اتصال بعد</p>
              ) : (
                <ul className="divide-y divide-line">
                  {client.contacts.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate text-sm text-ink">
                          {c.name}
                          {c.isPrimary && <Badge tone="brand">أساسية</Badge>}
                        </p>
                        <p className="truncate text-[11px] text-ink-faint">
                          {[c.position, c.phone, c.email].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <Badge tone={tone('contactType', c.type)}>{label('contactType', c.type)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="المشاريع" />
            <CardBody className="p-0">
              {client.projects.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-ink-faint">لا توجد مشاريع</p>
              ) : (
                <ul className="divide-y divide-line">
                  {client.projects.map((p) => (
                    <li key={p.id}>
                      <Link href={`/projects/${p.id}`} className="block px-4 py-2.5 hover:bg-navy-800/40">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="truncate text-sm text-ink">{p.name}</span>
                          <Badge tone={tone('projectStatus', p.status)}>
                            {label('projectStatus', p.status)}
                          </Badge>
                        </div>
                        <Progress value={p.progressPercent} className="mt-1.5" showLabel />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {client.showMoney && client.invoices.length > 0 && (
            <Card>
              <CardHeader title="الفواتير" />
              <CardBody className="p-0">
                <ul className="divide-y divide-line">
                  {client.invoices.map((inv) => (
                    <li key={inv.id}>
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 hover:bg-navy-800/40"
                      >
                        <div>
                          <span className="num text-sm text-ink">{inv.number}</span>
                          <p className="text-[11px] text-ink-faint">
                            استحقاق {formatDate(inv.dueDate, 'ar', user.timezone)}
                          </p>
                        </div>
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

          <Card>
            <CardHeader title="السجل الزمني" />
            <CardBody className="p-0">
              <Timeline items={plain(client.activities) as never} timezone={user.timezone} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="بيانات العميل" />
            <CardBody>
              <dl className="divide-y divide-line/60">
                <KeyValue label="الاسم القانوني">{client.legalName}</KeyValue>
                <KeyValue label="النوع">{client.type === 'COMPANY' ? 'شركة' : 'فرد'}</KeyValue>
                <KeyValue label="المجال">{client.industry ?? '—'}</KeyValue>
                <KeyValue label="العنوان">{client.address ?? '—'}</KeyValue>
                <KeyValue label="الرقم الضريبي">
                  <span className="num" dir="ltr">
                    {client.taxNumber ?? '—'}
                  </span>
                </KeyValue>
                <KeyValue label="مدير الحساب">{client.accountManager?.name ?? '—'}</KeyValue>
                <KeyValue label="مسؤول المبيعات">{client.salesOwner?.name ?? '—'}</KeyValue>
                <KeyValue label="العملة">{client.currency}</KeyValue>
                <KeyValue label="تاريخ الانضمام">
                  {formatDate(client.onboardedAt, 'ar', user.timezone)}
                </KeyValue>
                <KeyValue label="تاريخ التجديد">
                  {formatDate(client.renewalDate, 'ar', user.timezone)}
                </KeyValue>
                {client.totalPaidMinor !== null && (
                  <KeyValue label="إجمالي المحصّل">
                    <span className="num">{formatMoney(client.totalPaidMinor, client.currency)}</span>
                  </KeyValue>
                )}
                <KeyValue label="تقييم الرضا">
                  {client.satisfaction ? `${client.satisfaction}/5` : '—'}
                </KeyValue>
              </dl>
            </CardBody>
          </Card>

          {client.contracts.length > 0 && (
            <Card>
              <CardHeader title="العقود" />
              <CardBody className="p-0">
                <ul className="divide-y divide-line">
                  {client.contracts.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/contracts/${c.id}`}
                        className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-navy-800/40"
                      >
                        <span className="num text-sm text-ink">{c.number}</span>
                        <Badge tone={tone('contractStatus', c.status)}>
                          {label('contractStatus', c.status)}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {client.quotations.length > 0 && (
            <Card>
              <CardHeader title="عروض الأسعار" />
              <CardBody className="p-0">
                <ul className="divide-y divide-line">
                  {client.quotations.map((q) => (
                    <li key={q.id}>
                      <Link
                        href={`/quotations/${q.id}`}
                        className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-navy-800/40"
                      >
                        <span className="num text-sm text-ink">{q.number}</span>
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

          {client.internalNotes && (
            <Card>
              <CardHeader title="ملاحظات داخلية" />
              <CardBody>
                <p className="whitespace-pre-wrap text-xs text-ink-muted">{client.internalNotes}</p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

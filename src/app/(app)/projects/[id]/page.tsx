import Link from 'next/link';
import type { Metadata } from 'next';
import { Pencil, Plus } from 'lucide-react';
import { requireUser, can } from '@/server/auth/guard';
import { findOr404 } from '@/server/auth/page-guard';
import { getProject } from '@/server/services/projects';
import { PageHeader } from '@/components/page-header';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  KeyValue,
  Progress,
} from '@/components/ui/primitives';
import { formatDate, formatMoney, formatPercent, daysBetween } from '@/lib/format';
import { label, tone } from '@/i18n/labels';
import { plain } from '@/lib/utils';
import { ProjectTasksBoard } from './project-tasks-board';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const p = await getProject(id);
    return { title: p.name };
  } catch {
    return { title: 'مشروع' };
  }
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // لا تحقق مسبق من صلاحية «view» هنا: getProject() تتولى ذلك، بما يشمل
  // حالة الإشارة (@) التي تمنح قراءة هذا السجل بعينه حتى بلا صلاحية
  // projects أصلًا.
  const user = await requireUser();
  const project = await findOr404(() => getProject(id));
  const daysLeft = project.endDate ? daysBetween(project.endDate) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={project.name}
        description={`${project.code} · ${project.client.brandName || project.client.legalName}`}
        breadcrumbs={[
          { label: 'العمليات' },
          { label: 'المشاريع', href: '/projects' },
          { label: project.name },
        ]}
        badge={
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={tone('projectStatus', project.status)} dot>
              {label('projectStatus', project.status)}
            </Badge>
            <Badge tone={tone('priority', project.priority)}>{label('priority', project.priority)}</Badge>
            {daysLeft !== null && daysLeft < 0 && !['COMPLETED', 'CANCELLED'].includes(project.status) && (
              <Badge tone="danger">متأخر {Math.abs(daysLeft)} يوم</Badge>
            )}
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {can(user, 'tasks', 'create') && (
              <Link href={`/tasks/new?projectId=${project.id}&clientId=${project.clientId}`}>
                <Button size="sm">
                  <Plus className="h-3.5 w-3.5" />
                  مهمة
                </Button>
              </Link>
            )}
            {can(user, 'projects', 'edit') && (
              <Link href={`/projects/${id}/edit`}>
                <Button size="sm" variant="secondary">
                  <Pencil className="h-3.5 w-3.5" />
                  تعديل
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] text-ink-faint">نسبة الإنجاز</p>
          <p className="num mt-1 text-xl font-bold text-ink">{project.progressPercent}%</p>
          <Progress value={project.progressPercent} className="mt-2" />
          <p className="mt-1 text-[10px] text-ink-faint">
            {project.progressMode === 'TASKS'
              ? 'محسوبة من المهام المكتملة'
              : project.progressMode === 'DELIVERABLES'
                ? 'محسوبة من المخرجات المعتمدة'
                : 'مُدخلة يدويًا'}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] text-ink-faint">المهام</p>
          <p className="num mt-1 text-xl font-bold text-ink">{project.tasks.length}</p>
          <p className="mt-1 text-[10px] text-ink-faint">
            {project.tasks.filter((t) => ['COMPLETED', 'APPROVED'].includes(t.status)).length} مكتملة
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] text-ink-faint">المخرجات</p>
          <p className="num mt-1 text-xl font-bold text-ink">{project.deliverables.length}</p>
          <p className="mt-1 text-[10px] text-ink-faint">
            {project.deliverables.filter((d) => ['APPROVED', 'DELIVERED'].includes(d.status)).length} معتمد
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] text-ink-faint">التسليم</p>
          <p className="num mt-1 text-xl font-bold text-ink">
            {project.endDate ? formatDate(project.endDate, 'ar', user.timezone) : '—'}
          </p>
          {daysLeft !== null && (
            <p className={`mt-1 text-[10px] ${daysLeft < 0 ? 'text-danger' : 'text-ink-faint'}`}>
              {daysLeft >= 0 ? `باقي ${daysLeft} يوم` : `متأخر ${Math.abs(daysLeft)} يوم`}
            </p>
          )}
        </Card>
      </div>

      {project.finance && (
        <Card>
          <CardHeader
            title="الوضع المالي للمشروع"
            subtitle={
              project.showProfit
                ? `الربح = الإيراد المحصَّل − التكاليف المباشرة${project.finance.includedIndirect ? ' − التكاليف غير المباشرة' : ' (التكاليف غير المباشرة غير محتسبة)'}`
                : 'التكاليف والأرباح غير متاحة لصلاحيتك'
            }
          />
          <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Metric label="الميزانية" value={formatMoney(project.finance.budgetMinor, project.currency)} />
            <Metric label="مفوتر" value={formatMoney(project.finance.invoicedMinor, project.currency)} />
            <Metric label="محصَّل" value={formatMoney(project.finance.collectedMinor, project.currency)} />
            {project.showProfit && (
              <>
                <Metric
                  label="تكاليف مباشرة"
                  value={formatMoney(project.finance.directCostsMinor, project.currency)}
                />
                <Metric
                  label="الربح"
                  value={`${formatMoney(project.finance.profitMinor ?? 0, project.currency)} (${formatPercent(project.finance.marginPercent)})`}
                  tone={(project.finance.profitMinor ?? 0) >= 0 ? 'ok' : 'danger'}
                />
              </>
            )}
          </CardBody>
        </Card>
      )}

      <ProjectTasksBoard
        projectId={id}
        tasks={plain(project.tasks) as never}
        canEdit={can(user, 'tasks', 'edit')}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="المخرجات" subtitle="حالة كل مخرج وعدد التعديلات عليه" />
          <CardBody className="p-0">
            {project.deliverables.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-ink-faint">لا توجد مخرجات مسجلة</p>
            ) : (
              <ul className="divide-y divide-line">
                {project.deliverables.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">{d.name}</p>
                      <p className="text-[11px] text-ink-faint">
                        {d.dueDate ? formatDate(d.dueDate, 'ar', user.timezone) : 'بدون موعد'}
                        {d.revisionCount > 0 && ` · ${d.revisionCount} تعديل`}
                      </p>
                    </div>
                    <Badge tone={tone('deliverableStatus', d.status)}>
                      {label('deliverableStatus', d.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="تفاصيل المشروع" />
          <CardBody>
            <dl className="divide-y divide-line/60">
              <KeyValue label="العميل">
                <Link href={`/clients/${project.client.id}`} className="text-brand hover:underline">
                  {project.client.brandName || project.client.legalName}
                </Link>
              </KeyValue>
              <KeyValue label="مسؤول المشروع">{project.owner.name}</KeyValue>
              <KeyValue label="مدير الحساب">{project.accountManager?.name ?? '—'}</KeyValue>
              <KeyValue label="تاريخ البداية">{formatDate(project.startDate, 'ar', user.timezone)}</KeyValue>
              <KeyValue label="الخدمات">
                {project.services.map((s) => s.service.nameAr).join('، ') || '—'}
              </KeyValue>
              {project.contract && (
                <KeyValue label="العقد">
                  <Link href={`/contracts/${project.contract.id}`} className="text-brand hover:underline">
                    {project.contract.number}
                  </Link>
                </KeyValue>
              )}
              {project.quotation && (
                <KeyValue label="عرض السعر">
                  <Link href={`/quotations/${project.quotation.id}`} className="text-brand hover:underline">
                    {project.quotation.number}
                  </Link>
                </KeyValue>
              )}
            </dl>

            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-2 text-[11px] text-ink-faint">فريق العمل</p>
              <ul className="space-y-1.5">
                {project.members.map((m) => (
                  <li key={m.user.id} className="flex items-center gap-2">
                    <Avatar name={m.user.name} src={m.user.avatarUrl} size={22} />
                    <span className="text-xs text-ink-muted">{m.user.name}</span>
                    {m.roleLabel && <span className="text-[10px] text-ink-faint">· {m.roleLabel}</span>}
                  </li>
                ))}
              </ul>
            </div>

            {project.internalNotes && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="text-[11px] text-ink-faint">ملاحظات داخلية</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-ink-muted">{project.internalNotes}</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Metric({
  label: l,
  value,
  tone: t,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'danger';
}) {
  return (
    <div>
      <p className="text-[11px] text-ink-faint">{l}</p>
      <p
        className={`num mt-0.5 text-sm font-semibold ${
          t === 'ok' ? 'text-ok' : t === 'danger' ? 'text-danger' : 'text-ink'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

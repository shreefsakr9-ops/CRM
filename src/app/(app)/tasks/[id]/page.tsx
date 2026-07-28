import Link from 'next/link';
import type { Metadata } from 'next';
import { Pencil } from 'lucide-react';
import { requirePermission, can } from '@/server/auth/guard';
import { getTask, taskFormOptions } from '@/server/services/tasks';
import { PageHeader } from '@/components/page-header';
import { Badge, Button, Card, CardBody, CardHeader, KeyValue } from '@/components/ui/primitives';
import { formatDate, formatDuration } from '@/lib/format';
import { label, tone } from '@/i18n/labels';
import { plain } from '@/lib/utils';
import { TaskWorkspace } from './task-workspace';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const t = await getTask(id);
    return { title: t.title };
  } catch {
    return { title: 'مهمة' };
  }
}

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('tasks', 'view');
  const [task, options] = await Promise.all([getTask(id), taskFormOptions()]);

  const blocking = task.dependencies.filter(
    (d) => !['COMPLETED', 'APPROVED', 'CANCELLED'].includes(d.dependsOn.status),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={task.title}
        description={[task.project?.name, task.client?.brandName || task.client?.legalName]
          .filter(Boolean)
          .join(' · ')}
        breadcrumbs={[
          { label: 'العمليات' },
          { label: 'المهام', href: '/tasks' },
          { label: task.title },
        ]}
        badge={
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={tone('taskStatus', task.status)} dot>
              {label('taskStatus', task.status)}
            </Badge>
            <Badge tone={tone('priority', task.priority)}>{label('priority', task.priority)}</Badge>
            {task.requiresApproval && <Badge tone="info">تتطلب اعتمادًا</Badge>}
            {task.delayReason !== 'NONE' && (
              <Badge tone={tone('delayReason', task.delayReason)}>
                {label('delayReason', task.delayReason)}
              </Badge>
            )}
          </div>
        }
        actions={
          can(user, 'tasks', 'edit') && (
            <Link href={`/tasks/${id}/edit`}>
              <Button size="sm" variant="secondary">
                <Pencil className="h-3.5 w-3.5" />
                تعديل
              </Button>
            </Link>
          )
        }
      />

      {blocking.length > 0 && (
        <div className="rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-xs text-danger">
          هذه المهمة معطّلة حتى تكتمل: {blocking.map((b) => b.dependsOn.title).join('، ')}
        </div>
      )}

      <TaskWorkspace
        task={plain(task) as never}
        users={options.users}
        currentUserId={user.id}
        perms={{
          canEdit: can(user, 'tasks', 'edit'),
          canApprove: can(user, 'approvals', 'approve'),
          canUploadFiles: can(user, 'files', 'create'),
        }}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="سجل التعديلات والاعتمادات" subtitle="مصدر كل تعديل ووقت تنفيذه محفوظ" />
          <CardBody className="p-0">
            {task.revisions.length === 0 && task.approvals.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-ink-faint">لا توجد تعديلات أو اعتمادات</p>
            ) : (
              <ul className="divide-y divide-line">
                {task.revisions.map((r) => (
                  <li key={r.id} className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge tone={tone('revisionSource', r.source)}>
                          {label('revisionSource', r.source)}
                        </Badge>
                        <Badge tone={tone('revisionStatus', r.status)}>
                          {label('revisionStatus', r.status)}
                        </Badge>
                      </div>
                      <span className="text-[11px] text-ink-faint">
                        {formatDate(r.createdAt, 'ar', user.timezone, true)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">{r.description}</p>
                    <p className="mt-0.5 text-[11px] text-ink-faint">
                      طلبه {r.requestedBy.name}
                      {r.assignedTo && ` · مسند إلى ${r.assignedTo.name}`}
                    </p>
                  </li>
                ))}
                {task.approvals.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <div>
                      <p className="text-xs text-ink">
                        اعتماد {a.step === 'INTERNAL' ? 'داخلي' : a.step === 'CLIENT' ? 'من العميل' : 'نهائي'} —{' '}
                        {a.approver.name}
                      </p>
                      {a.comment && <p className="text-[11px] text-ink-muted">{a.comment}</p>}
                    </div>
                    <Badge tone={tone('approvalStatus', a.status)}>
                      {label('approvalStatus', a.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="التفاصيل" />
          <CardBody>
            <dl className="divide-y divide-line/60">
              <KeyValue label="أنشأها">{task.creator.name}</KeyValue>
              <KeyValue label="المراجع">{task.reviewer?.name ?? '—'}</KeyValue>
              <KeyValue label="القسم">{task.department?.nameAr ?? '—'}</KeyValue>
              <KeyValue label="تاريخ البداية">{formatDate(task.startDate, 'ar', user.timezone)}</KeyValue>
              <KeyValue label="تاريخ الاستحقاق">{formatDate(task.dueDate, 'ar', user.timezone)}</KeyValue>
              <KeyValue label="الوقت المقدَّر">
                {task.estimateMinutes ? formatDuration(task.estimateMinutes) : '—'}
              </KeyValue>
              <KeyValue label="الوقت الفعلي">{formatDuration(task.actualMinutes)}</KeyValue>
              <KeyValue label="وقت انتظار العميل">{formatDuration(task.clientWaitMinutes)}</KeyValue>
              <KeyValue label="وقت المراجعة الداخلية">{formatDuration(task.reviewMinutes)}</KeyValue>
              {task.completedAt && (
                <KeyValue label="تاريخ الإغلاق">
                  {formatDate(task.completedAt, 'ar', user.timezone, true)}
                </KeyValue>
              )}
              {task.project && (
                <KeyValue label="المشروع">
                  <Link href={`/projects/${task.project.id}`} className="text-brand hover:underline">
                    {task.project.name}
                  </Link>
                </KeyValue>
              )}
            </dl>

            {task.subtasks.length > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="mb-1.5 text-[11px] text-ink-faint">المهام الفرعية</p>
                <ul className="space-y-1">
                  {task.subtasks.map((s) => (
                    <li key={s.id}>
                      <Link href={`/tasks/${s.id}`} className="text-xs text-brand hover:underline">
                        {s.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

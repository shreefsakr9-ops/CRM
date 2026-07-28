'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LayoutList, Kanban, Lock, CheckCircle2 } from 'lucide-react';
import { Avatar, Badge, Button, Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/format';
import { label, tone } from '@/i18n/labels';
import { cn } from '@/lib/utils';
import { changeTaskStatusAction } from '@/app/(app)/tasks/actions';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  requiresApproval: boolean;
  assignees: { user: { id: string; name: string; avatarUrl: string | null } }[];
  checklist: { id: string; isDone: boolean; isRequired: boolean }[];
  department: { nameAr: string } | null;
  dependencies: { dependsOn: { id: string; title: string; status: string } }[];
}

const COLUMNS = [
  'TODO',
  'IN_PROGRESS',
  'WAITING_INTERNAL_REVIEW',
  'REVISIONS_REQUIRED',
  'WAITING_CLIENT',
  'COMPLETED',
] as const;

export function ProjectTasksBoard({
  projectId,
  tasks,
  canEdit,
}: {
  projectId: string;
  tasks: Task[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = React.useState<'kanban' | 'list'>('kanban');
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<string | null>(null);

  const move = async (taskId: string, status: string) => {
    const res = await changeTaskStatusAction(taskId, status);
    if (!res.ok) return toast.error(res.error);
    toast.success('تم تحديث حالة المهمة');
    router.refresh();
  };

  const blocked = (t: Task) =>
    t.dependencies.some((d) => !['COMPLETED', 'APPROVED', 'CANCELLED'].includes(d.dependsOn.status));

  const requiredLeft = (t: Task) => t.checklist.filter((c) => c.isRequired && !c.isDone).length;

  return (
    <Card>
      <CardHeader
        title="مهام المشروع"
        subtitle="المهام المعطّلة باعتمادية أو بقائمة تحقق غير مكتملة لا يمكن إغلاقها"
        action={
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={view === 'kanban' ? 'secondary' : 'ghost'}
              onClick={() => setView('kanban')}
              type="button"
            >
              <Kanban className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant={view === 'list' ? 'secondary' : 'ghost'}
              onClick={() => setView('list')}
              type="button"
            >
              <LayoutList className="h-3.5 w-3.5" />
            </Button>
          </div>
        }
      />
      <CardBody className={view === 'list' ? 'p-0' : undefined}>
        {tasks.length === 0 ? (
          <p className="py-8 text-center text-xs text-ink-faint">لا توجد مهام في هذا المشروع بعد</p>
        ) : view === 'kanban' ? (
          <div className="bp-table-scroll flex gap-3">
            {COLUMNS.map((status) => {
              const items = tasks.filter((t) =>
                status === 'COMPLETED'
                  ? ['COMPLETED', 'APPROVED'].includes(t.status)
                  : t.status === status,
              );
              return (
                <section
                  key={status}
                  onDragOver={(e) => {
                    if (!canEdit) return;
                    e.preventDefault();
                    setOver(status);
                  }}
                  onDragLeave={() => setOver(null)}
                  onDrop={() => {
                    const id = dragging;
                    setDragging(null);
                    setOver(null);
                    if (id) void move(id, status);
                  }}
                  className={cn(
                    'w-[240px] shrink-0 rounded-lg border p-2 transition-colors',
                    over === status ? 'border-brand bg-brand/5' : 'border-line bg-surface-sunken/40',
                  )}
                >
                  <div className="mb-2 flex items-center justify-between px-1">
                    <h3 className="text-[11px] font-semibold text-ink-muted">
                      {label('taskStatus', status)}
                    </h3>
                    <span className="num text-[10px] text-ink-faint">{items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((t) => (
                      <article
                        key={t.id}
                        draggable={canEdit}
                        onDragStart={() => setDragging(t.id)}
                        onDragEnd={() => setDragging(null)}
                        className={cn(
                          'rounded-md border border-line bg-surface p-2.5',
                          canEdit && 'cursor-grab active:cursor-grabbing hover:border-brand/50',
                          dragging === t.id && 'opacity-40',
                        )}
                      >
                        <Link href={`/tasks/${t.id}`} className="block text-xs text-ink hover:text-brand">
                          {t.title}
                        </Link>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {blocked(t) && (
                            <span className="flex items-center gap-0.5 text-[10px] text-danger">
                              <Lock className="h-3 w-3" />
                              معطّلة
                            </span>
                          )}
                          {requiredLeft(t) > 0 && (
                            <span className="num flex items-center gap-0.5 text-[10px] text-warn">
                              <CheckCircle2 className="h-3 w-3" />
                              {requiredLeft(t)} إلزامي
                            </span>
                          )}
                          {t.requiresApproval && <Badge tone="info">يحتاج اعتماد</Badge>}
                        </div>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="text-[10px] text-ink-faint">
                            {t.dueDate ? formatDate(t.dueDate) : '—'}
                          </span>
                          <div className="flex -space-x-1.5 space-x-reverse">
                            {t.assignees.slice(0, 3).map((a) => (
                              <Avatar
                                key={a.user.id}
                                name={a.user.name}
                                src={a.user.avatarUrl}
                                size={18}
                                className="ring-2 ring-surface"
                              />
                            ))}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {tasks.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tasks/${t.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 hover:bg-navy-800/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{t.title}</p>
                    <p className="text-[11px] text-ink-faint">
                      {t.department?.nameAr ?? '—'} · {t.dueDate ? formatDate(t.dueDate) : 'بدون موعد'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {blocked(t) && <Badge tone="danger">معطّلة</Badge>}
                    <Badge tone={tone('taskStatus', t.status)}>{label('taskStatus', t.status)}</Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

import Link from 'next/link';
import type { Metadata } from 'next';
import { Plus } from 'lucide-react';
import { requirePermission, can } from '@/server/auth/guard';
import { listTasks, taskFormOptions } from '@/server/services/tasks';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/primitives';
import { TasksClient } from './tasks-client';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'المهام' };
export const dynamic = 'force-dynamic';

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requirePermission('tasks', 'view');
  const [{ rows, total, page, pageSize }, options] = await Promise.all([
    listTasks({
      q: sp.q,
      status: sp.status,
      priority: sp.priority,
      projectId: sp.projectId,
      assigneeId: sp.assigneeId,
      departmentId: sp.departmentId,
      filter: sp.filter as never,
      from: sp.from,
      to: sp.to,
      page: sp.page ? Number(sp.page) : 1,
    }),
    taskFormOptions(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="المهام"
        description="كل المهام ضمن نطاقك مع حالتها ومواعيدها والمسؤولين عنها"
        breadcrumbs={[{ label: 'العمليات' }, { label: 'المهام' }]}
        actions={
          can(user, 'tasks', 'create') && (
            <Link href="/tasks/new">
              <Button>
                <Plus className="h-4 w-4" />
                مهمة جديدة
              </Button>
            </Link>
          )
        }
      />
      <TasksClient
        rows={plain(rows) as never}
        total={total}
        page={page}
        pageSize={pageSize}
        options={plain(options) as never}
        perms={{
          canDelete: can(user, 'tasks', 'delete'),
          canExport: can(user, 'tasks', 'export'),
          canEdit: can(user, 'tasks', 'edit'),
        }}
      />
    </div>
  );
}

import type { Metadata } from 'next';
import { requirePermission, can } from '@/server/auth/guard';
import { listTasks, taskFormOptions } from '@/server/services/tasks';
import { PageHeader } from '@/components/page-header';
import { TasksClient } from '../tasks/tasks-client';
import { FiltersBar } from '@/components/filters-bar';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'مهامي' };
export const dynamic = 'force-dynamic';

export default async function MyTasksPage({
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
      assigneeId: user.id,
      filter: (sp.filter as never) ?? undefined,
      page: sp.page ? Number(sp.page) : 1,
    }),
    taskFormOptions(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="مهامي"
        description="كل المهام المسندة إليك مرتبة حسب تاريخ الاستحقاق"
        breadcrumbs={[{ label: 'الرئيسية' }, { label: 'مهامي' }]}
      />

      <FiltersBar
        searchPlaceholder="ابحث في مهامي…"
        filters={[]}
        quickFilters={[
          { key: 'filter', value: 'today', label: 'مستحقة اليوم' },
          { key: 'filter', value: 'overdue', label: 'متأخرة' },
          { key: 'filter', value: 'week', label: 'هذا الأسبوع' },
        ]}
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
        hideFilters
      />
    </div>
  );
}

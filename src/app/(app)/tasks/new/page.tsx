import type { Metadata } from 'next';
import { requirePermission } from '@/server/auth/guard';
import { taskFormOptions } from '@/server/services/tasks';
import { PageHeader } from '@/components/page-header';
import { TaskForm } from '../task-form';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'مهمة جديدة' };
export const dynamic = 'force-dynamic';

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; clientId?: string }>;
}) {
  const sp = await searchParams;
  await requirePermission('tasks', 'create');
  const options = await taskFormOptions();

  return (
    <div className="space-y-5">
      <PageHeader
        title="مهمة جديدة"
        breadcrumbs={[{ label: 'العمليات' }, { label: 'المهام', href: '/tasks' }, { label: 'جديدة' }]}
      />
      <TaskForm initial={null} options={plain(options) as never} defaults={sp} />
    </div>
  );
}

import type { Metadata } from 'next';
import { requirePermission } from '@/server/auth/guard';
import { getTask, taskFormOptions } from '@/server/services/tasks';
import { PageHeader } from '@/components/page-header';
import { TaskForm } from '../../task-form';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'تعديل مهمة' };
export const dynamic = 'force-dynamic';

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission('tasks', 'edit');
  const [task, options] = await Promise.all([getTask(id), taskFormOptions()]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={`تعديل: ${task.title}`}
        breadcrumbs={[
          { label: 'العمليات' },
          { label: 'المهام', href: '/tasks' },
          { label: task.title, href: `/tasks/${id}` },
          { label: 'تعديل' },
        ]}
      />
      <TaskForm initial={plain(task) as never} options={plain(options) as never} defaults={{}} />
    </div>
  );
}

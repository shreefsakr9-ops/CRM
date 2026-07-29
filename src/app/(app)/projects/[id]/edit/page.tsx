import type { Metadata } from 'next';
import { requirePermission } from '@/server/auth/guard';
import { findOr404 } from '@/server/auth/page-guard';
import { getProject, projectFormOptions } from '@/server/services/projects';
import { PageHeader } from '@/components/page-header';
import { ProjectForm } from '../../project-form';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'تعديل مشروع' };
export const dynamic = 'force-dynamic';

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission('projects', 'edit');
  const [project, options] = await Promise.all([findOr404(() => getProject(id)), projectFormOptions()]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={`تعديل: ${project.name}`}
        breadcrumbs={[
          { label: 'العمليات' },
          { label: 'المشاريع', href: '/projects' },
          { label: project.name, href: `/projects/${id}` },
          { label: 'تعديل' },
        ]}
      />
      <ProjectForm initial={plain(project) as never} options={plain(options) as never} defaults={{}} />
    </div>
  );
}

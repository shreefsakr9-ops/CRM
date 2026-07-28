import type { Metadata } from 'next';
import { requirePermission } from '@/server/auth/guard';
import { projectFormOptions } from '@/server/services/projects';
import { PageHeader } from '@/components/page-header';
import { ProjectForm } from '../project-form';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'مشروع جديد' };
export const dynamic = 'force-dynamic';

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; quotationId?: string; contractId?: string; dealId?: string }>;
}) {
  const sp = await searchParams;
  await requirePermission('projects', 'create');
  const options = await projectFormOptions();

  return (
    <div className="space-y-5">
      <PageHeader
        title="مشروع جديد"
        description="اختيار قالب يولّد المهام والاعتماديات وتواريخ الاستحقاق تلقائيًا"
        breadcrumbs={[
          { label: 'العمليات' },
          { label: 'المشاريع', href: '/projects' },
          { label: 'جديد' },
        ]}
      />
      <ProjectForm initial={null} options={plain(options) as never} defaults={sp} />
    </div>
  );
}

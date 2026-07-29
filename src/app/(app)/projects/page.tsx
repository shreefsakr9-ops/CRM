import Link from 'next/link';
import type { Metadata } from 'next';
import { Plus } from 'lucide-react';
import { requirePermission, can } from '@/server/auth/guard';
import { listProjects, projectFormOptions } from '@/server/services/projects';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/primitives';
import { ProjectsClient } from './projects-client';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'المشاريع' };
export const dynamic = 'force-dynamic';

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requirePermission('projects', 'view');
  const [{ rows, total, page, pageSize }, options] = await Promise.all([
    listProjects({
      q: sp.q,
      status: sp.status,
      clientId: sp.clientId,
      ownerId: sp.ownerId,
      page: sp.page ? Number(sp.page) : 1,
    }),
    projectFormOptions(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="المشاريع"
        description="المشاريع الجارية مع نسبة الإنجاز والفريق وتاريخ التسليم"
        breadcrumbs={[{ label: 'العمليات' }, { label: 'المشاريع' }]}
        actions={
          can(user, 'projects', 'create') && (
            <Link href="/projects/new">
              <Button>
                <Plus className="h-4 w-4" />
                مشروع جديد
              </Button>
            </Link>
          )
        }
      />
      <ProjectsClient
        rows={plain(rows) as never}
        total={total}
        page={page}
        pageSize={pageSize}
        options={plain(options) as never}
        perms={{
          canDelete: can(user, 'projects', 'delete'),
          canExport: can(user, 'projects', 'export'),
          canViewMoney: can(user, 'projects', 'view_financial'),
        }}
      />
    </div>
  );
}

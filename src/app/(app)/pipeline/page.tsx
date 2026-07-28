import type { Metadata } from 'next';
import { requirePermission, can } from '@/server/auth/guard';
import { pipelineBoard, dealFormOptions } from '@/server/services/deals';
import { PageHeader } from '@/components/page-header';
import { PipelineBoard } from './pipeline-board';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'مسار المبيعات' };
export const dynamic = 'force-dynamic';

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ ownerId?: string }>;
}) {
  const { ownerId } = await searchParams;
  const user = await requirePermission('deals', 'view');
  const [board, options] = await Promise.all([pipelineBoard(ownerId), dealFormOptions()]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="مسار المبيعات"
        description="اسحب الصفقة بين المراحل — سيُسجَّل من نقلها ومتى ومدة بقائها في المرحلة السابقة"
        breadcrumbs={[{ label: 'المبيعات' }, { label: 'مسار المبيعات' }]}
      />
      <PipelineBoard
        board={plain(board) as never}
        lossReasons={options.lossReasons}
        owners={options.users}
        canEdit={can(user, 'deals', 'edit')}
      />
    </div>
  );
}

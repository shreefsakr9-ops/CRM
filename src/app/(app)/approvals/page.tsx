import type { Metadata } from 'next';
import { requirePermission, can } from '@/server/auth/guard';
import { listApprovalQueue } from '@/server/services/tasks';
import { PageHeader } from '@/components/page-header';
import { ApprovalsClient } from './approvals-client';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'الاعتمادات والتعديلات' };
export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const user = await requirePermission('approvals', 'view');
  const { approvals, revisions } = await listApprovalQueue();

  return (
    <div className="space-y-5">
      <PageHeader
        title="الاعتمادات والتعديلات"
        description="كل ما ينتظر قرارك أو تنفيذك — مرتبًا حسب الأقدم"
        breadcrumbs={[{ label: 'العمليات' }, { label: 'الاعتمادات' }]}
      />
      <ApprovalsClient
        approvals={plain(approvals) as never}
        revisions={plain(revisions) as never}
        canApprove={can(user, 'approvals', 'approve')}
      />
    </div>
  );
}

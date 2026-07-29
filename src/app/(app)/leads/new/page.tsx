import type { Metadata } from 'next';
import { requirePermission, can } from '@/server/auth/guard';
import { leadFormOptions } from '@/server/services/leads';
import { PageHeader } from '@/components/page-header';
import { LeadForm } from '../lead-form';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'عميل محتمل جديد' };
export const dynamic = 'force-dynamic';

export default async function NewLeadPage() {
  const user = await requirePermission('leads', 'create');
  const options = await leadFormOptions();

  return (
    <div className="space-y-5">
      <PageHeader
        title="عميل محتمل جديد"
        description="سيتم كشف التكرار تلقائيًا بالهاتف والبريد قبل الحفظ"
        breadcrumbs={[
          { label: 'المبيعات' },
          { label: 'العملاء المحتملون', href: '/leads' },
          { label: 'جديد' },
        ]}
      />
      <LeadForm initial={null} options={plain(options) as never} canAssign={can(user, 'leads', 'assign')} />
    </div>
  );
}

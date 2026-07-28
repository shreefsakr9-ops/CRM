import type { Metadata } from 'next';
import { requirePermission, can } from '@/server/auth/guard';
import { getLead, leadFormOptions } from '@/server/services/leads';
import { PageHeader } from '@/components/page-header';
import { LeadForm } from '../../lead-form';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'تعديل عميل محتمل' };
export const dynamic = 'force-dynamic';

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('leads', 'edit');
  const [lead, options] = await Promise.all([getLead(id), leadFormOptions()]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={`تعديل: ${lead.fullName}`}
        breadcrumbs={[
          { label: 'المبيعات' },
          { label: 'العملاء المحتملون', href: '/leads' },
          { label: lead.fullName, href: `/leads/${id}` },
          { label: 'تعديل' },
        ]}
      />
      <LeadForm
        initial={plain(lead) as never}
        options={plain(options) as never}
        canAssign={can(user, 'leads', 'assign')}
      />
    </div>
  );
}

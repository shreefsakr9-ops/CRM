import type { Metadata } from 'next';
import { requirePermission, can } from '@/server/auth/guard';
import { listServices, catalogOptions } from '@/server/services/catalog';
import { PageHeader } from '@/components/page-header';
import { ServicesClient } from './services-client';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'الخدمات والباقات' };
export const dynamic = 'force-dynamic';

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requirePermission('services', 'view');
  const [services, options] = await Promise.all([
    listServices({ q: sp.q, active: sp.active, billingType: sp.billingType }),
    catalogOptions(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="الخدمات والباقات"
        description="كتالوج خدمات Blue Point مع الأسعار الأساسية والمخرجات والأقسام المسؤولة"
        breadcrumbs={[{ label: 'العملاء' }, { label: 'الخدمات' }]}
      />
      <ServicesClient
        services={plain(services) as never}
        options={plain(options) as never}
        perms={{
          canCreate: can(user, 'services', 'create'),
          canEdit: can(user, 'services', 'edit'),
          canDelete: can(user, 'services', 'delete'),
          canViewMoney: can(user, 'services', 'view_financial') || can(user, 'quotations', 'view_financial'),
        }}
      />
    </div>
  );
}

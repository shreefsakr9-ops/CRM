import Link from 'next/link';
import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';
import { requirePermission, can } from '@/server/auth/guard';
import { getSettings } from '@/server/services/settings';
import { peekSequences } from '@/server/services/numbering';
import { mailStatus } from '@/server/services/mailer';
import { prisma } from '@/server/db';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/primitives';
import { SettingsClient } from './settings-client';
import { plain } from '@/lib/utils';

export const metadata: Metadata = { title: 'الإعدادات' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requirePermission('settings', 'view');
  const [settings, sequences, stages, sources, lossReasons, taxRates, departments, currencies, countries, roles] =
    await Promise.all([
      getSettings(true),
      peekSequences(),
      prisma.pipelineStage.findMany({ where: { pipeline: 'DEAL' }, orderBy: { sortOrder: 'asc' } }),
      prisma.leadSource.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.lossReason.findMany(),
      prisma.taxRate.findMany(),
      prisma.department.findMany({ where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } }),
      prisma.currency.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.country.findMany(),
      prisma.role.findMany({ orderBy: { sortOrder: 'asc' }, select: { key: true, nameAr: true } }),
    ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="إعدادات النظام"
        description="كل القيم هنا تؤثر على سلوك النظام فورًا — ولا توجد قيم ثابتة داخل الكود"
        breadcrumbs={[{ label: 'الإدارة' }, { label: 'الإعدادات' }]}
        actions={
          can(user, 'roles', 'manage') && (
            <Link href="/settings/roles">
              <Button variant="secondary">
                <ShieldCheck className="h-4 w-4" />
                مصفوفة الصلاحيات
              </Button>
            </Link>
          )
        }
      />
      <SettingsClient
        settings={plain(settings) as never}
        reference={
          plain({
            sequences,
            stages,
            sources,
            lossReasons,
            taxRates,
            departments,
            currencies,
            countries,
            roles,
          }) as never
        }
        mail={mailStatus()}
        canEdit={can(user, 'settings', 'edit')}
        canManage={can(user, 'settings', 'manage')}
      />
    </div>
  );
}

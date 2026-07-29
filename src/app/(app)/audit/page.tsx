import type { Metadata } from 'next';
import { requirePermission, can, scopeWhere } from '@/server/auth/guard';
import { prisma } from '@/server/db';
import { PageHeader } from '@/components/page-header';
import { AuditClient } from './audit-client';
import { plain } from '@/lib/utils';
import type { Prisma } from '@prisma/client';

export const metadata: Metadata = { title: 'سجل التدقيق' };
export const dynamic = 'force-dynamic';

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requirePermission('audit', 'view');
  const page = Math.max(1, sp.page ? Number(sp.page) : 1);
  const pageSize = 50;

  // نطاق TEAM يقيّد السجل على مستخدمي الفريق فقط.
  const scope = scopeWhere(user, 'audit', ['userId']);

  const where: Prisma.AuditLogWhereInput = {
    ...scope,
    ...(sp.module ? { module: sp.module } : {}),
    ...(sp.action ? { action: sp.action } : {}),
    ...(sp.userId ? { userId: sp.userId } : {}),
    ...(sp.q
      ? {
          OR: [
            { summary: { contains: sp.q, mode: 'insensitive' } },
            { entityId: { contains: sp.q } },
          ],
        }
      : {}),
  };

  const [rows, total, users] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="سجل التدقيق"
        description="سجل غير قابل للتعديل — كل إنشاء وتعديل وحذف وتصدير مسجَّل بالقيمة القديمة والجديدة"
        breadcrumbs={[{ label: 'الإدارة' }, { label: 'سجل التدقيق' }]}
      />
      <AuditClient
        rows={plain(rows) as never}
        total={total}
        page={page}
        pageSize={pageSize}
        users={users}
        canExport={can(user, 'audit', 'export')}
      />
    </div>
  );
}

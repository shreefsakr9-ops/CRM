import 'server-only';
import { prisma } from '@/server/db';
import { can, scopeWhere, requireUser } from '@/server/auth/guard';
import { normalizePhone } from '@/lib/utils';

export interface SearchGroup {
  module: string;
  label: string;
  items: { id: string; title: string; subtitle?: string; href: string }[];
}

const LIMIT = 6;

/**
 * البحث الشامل — يحترم نطاق كل مستخدم لكل Module،
 * ويبحث بالاسم والهاتف والإيميل والشركة والأرقام المرجعية.
 */
export async function globalSearch(query: string): Promise<SearchGroup[]> {
  const user = await requireUser();
  const q = query.trim();
  if (q.length < 2) return [];

  const contains = { contains: q, mode: 'insensitive' as const };
  const phone = normalizePhone(q);
  const groups: SearchGroup[] = [];

  if (can(user, 'leads', 'view')) {
    const rows = await prisma.lead.findMany({
      where: {
        deletedAt: null,
        ...scopeWhere(user, 'leads', ['assignedToId', 'createdById']),
        OR: [
          { fullName: contains },
          { companyName: contains },
          { email: contains },
          { phone: contains },
          ...(phone ? [{ phoneNormalized: { contains: phone } }] : []),
        ],
      },
      take: LIMIT,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, fullName: true, companyName: true, phone: true },
    });
    if (rows.length)
      groups.push({
        module: 'leads',
        label: 'العملاء المحتملون',
        items: rows.map((r) => ({
          id: r.id,
          title: r.fullName,
          subtitle: [r.companyName, r.phone].filter(Boolean).join(' · '),
          href: `/leads/${r.id}`,
        })),
      });
  }

  if (can(user, 'clients', 'view')) {
    const rows = await prisma.client.findMany({
      where: {
        deletedAt: null,
        ...scopeWhere(user, 'clients', ['accountManagerId', 'salesOwnerId', 'createdById']),
        OR: [{ legalName: contains }, { brandName: contains }, { taxNumber: contains }],
      },
      take: LIMIT,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, legalName: true, brandName: true, city: true },
    });
    if (rows.length)
      groups.push({
        module: 'clients',
        label: 'العملاء',
        items: rows.map((r) => ({
          id: r.id,
          title: r.brandName || r.legalName,
          subtitle: [r.legalName, r.city].filter(Boolean).join(' · '),
          href: `/clients/${r.id}`,
        })),
      });
  }

  if (can(user, 'deals', 'view')) {
    const rows = await prisma.deal.findMany({
      where: {
        deletedAt: null,
        ...scopeWhere(user, 'deals', ['ownerId', 'createdById']),
        title: contains,
      },
      take: LIMIT,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, status: true },
    });
    if (rows.length)
      groups.push({
        module: 'deals',
        label: 'الصفقات',
        items: rows.map((r) => ({ id: r.id, title: r.title, href: `/deals/${r.id}` })),
      });
  }

  if (can(user, 'quotations', 'view')) {
    const rows = await prisma.quotation.findMany({
      where: {
        deletedAt: null,
        ...scopeWhere(user, 'quotations', ['preparedById']),
        OR: [{ number: contains }, { client: { legalName: contains } }],
      },
      take: LIMIT,
      orderBy: { createdAt: 'desc' },
      select: { id: true, number: true, status: true, client: { select: { legalName: true } } },
    });
    if (rows.length)
      groups.push({
        module: 'quotations',
        label: 'عروض الأسعار',
        items: rows.map((r) => ({
          id: r.id,
          title: r.number,
          subtitle: r.client?.legalName,
          href: `/quotations/${r.id}`,
        })),
      });
  }

  if (can(user, 'projects', 'view')) {
    const rows = await prisma.project.findMany({
      where: {
        deletedAt: null,
        ...scopeWhere(user, 'projects', ['ownerId', 'accountManagerId', 'createdById'], [
          { members: { some: { userId: user.id } } },
        ]),
        OR: [{ name: contains }, { code: contains }],
      },
      take: LIMIT,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, code: true, client: { select: { legalName: true } } },
    });
    if (rows.length)
      groups.push({
        module: 'projects',
        label: 'المشاريع',
        items: rows.map((r) => ({
          id: r.id,
          title: r.name,
          subtitle: [r.code, r.client?.legalName].filter(Boolean).join(' · '),
          href: `/projects/${r.id}`,
        })),
      });
  }

  if (can(user, 'tasks', 'view')) {
    const rows = await prisma.task.findMany({
      where: {
        deletedAt: null,
        ...scopeWhere(user, 'tasks', ['creatorId', 'reviewerId'], [
          { assignees: { some: { userId: user.id } } },
        ]),
        title: contains,
      },
      take: LIMIT,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, status: true },
    });
    if (rows.length)
      groups.push({
        module: 'tasks',
        label: 'المهام',
        items: rows.map((r) => ({ id: r.id, title: r.title, href: `/tasks/${r.id}` })),
      });
  }

  if (can(user, 'invoices', 'view')) {
    const rows = await prisma.invoice.findMany({
      where: {
        deletedAt: null,
        OR: [{ number: contains }, { client: { legalName: contains } }],
      },
      take: LIMIT,
      orderBy: { createdAt: 'desc' },
      select: { id: true, number: true, client: { select: { legalName: true } } },
    });
    if (rows.length)
      groups.push({
        module: 'invoices',
        label: 'الفواتير',
        items: rows.map((r) => ({
          id: r.id,
          title: r.number,
          subtitle: r.client?.legalName,
          href: `/invoices/${r.id}`,
        })),
      });
  }

  if (can(user, 'contracts', 'view')) {
    const rows = await prisma.contract.findMany({
      where: {
        deletedAt: null,
        ...scopeWhere(user, 'contracts', ['ownerId']),
        OR: [{ number: contains }, { title: contains }],
      },
      take: LIMIT,
      orderBy: { createdAt: 'desc' },
      select: { id: true, number: true, title: true },
    });
    if (rows.length)
      groups.push({
        module: 'contracts',
        label: 'العقود',
        items: rows.map((r) => ({
          id: r.id,
          title: r.number,
          subtitle: r.title,
          href: `/contracts/${r.id}`,
        })),
      });
  }

  return groups;
}

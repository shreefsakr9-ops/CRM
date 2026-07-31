import 'server-only';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { requirePermission, NotFound } from '@/server/auth/guard';
import { audit } from './audit';
import type { DateRange } from './reports';

/**
 * أرصدة إعلانات العملاء — أمانة (liability) لدى الشركة لا دخل ولا مصروف:
 * أموال يرسلها العميل لتُصرف على إعلاناته هو، لا على أعمال الشركة. هذا الملف
 * مقصودًا معزول تمامًا عن reports.ts — لا AdWalletTransaction ولا أي دالة هنا
 * تُقرأ من financialReport()/salesReport() أو أي حساب لـ«المصروفات المباشرة»
 * أو «صافي الربح» أو «المحصَّل». الفصل معماري، مُثبَت بالاختبارات.
 */

export const adWalletTransactionSchema = z.object({
  clientId: z.string().min(1, 'العميل مطلوب'),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL']),
  amount: z.coerce.number().positive('المبلغ يجب أن يكون أكبر من صفر'),
  currency: z.string().default('EGP'),
  occurredAt: z.string().min(1, 'التاريخ مطلوب'),
  note: z.string().trim().optional().nullable(),
});

export type AdWalletTransactionInput = z.infer<typeof adWalletTransactionSchema>;

export interface AdWalletBalance {
  clientId: string;
  clientName: string;
  depositedInRangeMinor: number;
  withdrawnInRangeMinor: number;
  /** الرصيد المتبقي تراكمي دائمًا (كل الأوقات) — لا يتقيّد بفلتر التاريخ. */
  balanceMinor: number;
}

export async function listAdWalletBalances(range: DateRange): Promise<AdWalletBalance[]> {
  await requirePermission('ad_wallets', 'view');

  const [inRange, allTime, clients] = await Promise.all([
    prisma.adWalletTransaction.groupBy({
      by: ['clientId', 'type'],
      where: { deletedAt: null, occurredAt: { gte: range.from, lte: range.to } },
      _sum: { amountMinor: true },
    }),
    prisma.adWalletTransaction.groupBy({
      by: ['clientId', 'type'],
      where: { deletedAt: null },
      _sum: { amountMinor: true },
    }),
    prisma.client.findMany({ select: { id: true, legalName: true, brandName: true } }),
  ]);

  const clientName = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return c?.brandName || c?.legalName || '—';
  };

  type Agg = { deposited: bigint; withdrawn: bigint };
  const buildMap = (rows: typeof inRange) => {
    const map = new Map<string, Agg>();
    for (const r of rows) {
      const cur = map.get(r.clientId) ?? { deposited: 0n, withdrawn: 0n };
      if (r.type === 'DEPOSIT') cur.deposited += r._sum.amountMinor ?? 0n;
      else cur.withdrawn += r._sum.amountMinor ?? 0n;
      map.set(r.clientId, cur);
    }
    return map;
  };

  const rangeMap = buildMap(inRange);
  const allTimeMap = buildMap(allTime);
  const clientIds = new Set([...rangeMap.keys(), ...allTimeMap.keys()]);

  return Array.from(clientIds)
    .map((clientId) => {
      const r = rangeMap.get(clientId) ?? { deposited: 0n, withdrawn: 0n };
      const a = allTimeMap.get(clientId) ?? { deposited: 0n, withdrawn: 0n };
      return {
        clientId,
        clientName: clientName(clientId),
        depositedInRangeMinor: Number(r.deposited),
        withdrawnInRangeMinor: Number(r.withdrawn),
        balanceMinor: Number(a.deposited - a.withdrawn),
      };
    })
    .sort((x, y) => y.balanceMinor - x.balanceMinor);
}

/** قائمة العملاء لملء اختيار العميل في نافذة إضافة/خصم رصيد. */
export async function adWalletClientOptions() {
  await requirePermission('ad_wallets', 'view');
  const clients = await prisma.client.findMany({
    where: { deletedAt: null },
    select: { id: true, legalName: true, brandName: true },
    orderBy: { legalName: 'asc' },
  });
  return clients.map((c) => ({ id: c.id, name: c.brandName || c.legalName }));
}

export async function createAdWalletTransaction(input: unknown) {
  const user = await requirePermission('ad_wallets', 'create');
  const data = adWalletTransactionSchema.parse(input);

  const client = await prisma.client.findUnique({ where: { id: data.clientId } });
  if (!client || client.deletedAt) throw NotFound('العميل غير موجود');

  const amountMinor = BigInt(Math.round(data.amount * 100));

  const tx = await prisma.adWalletTransaction.create({
    data: {
      clientId: data.clientId,
      type: data.type,
      amountMinor,
      currency: data.currency,
      occurredAt: new Date(data.occurredAt),
      note: data.note || null,
      createdById: user.id,
    },
  });

  const clientLabel = client.brandName || client.legalName;
  await audit({
    userId: user.id,
    action: 'CREATE',
    module: 'ad_wallets',
    entityType: 'AD_WALLET_TRANSACTION',
    entityId: tx.id,
    summary:
      data.type === 'DEPOSIT'
        ? `إضافة رصيد إعلانات ${data.amount} ${data.currency} للعميل ${clientLabel}`
        : `خصم رصيد إعلانات ${data.amount} ${data.currency} من العميل ${clientLabel}`,
  });

  return tx;
}

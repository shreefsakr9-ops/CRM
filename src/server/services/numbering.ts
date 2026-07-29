import 'server-only';
import { prisma, type Tx } from '@/server/db';

export type SequenceKey = 'QUOTATION' | 'INVOICE' | 'CONTRACT' | 'PROJECT';

const DEFAULT_PREFIX: Record<SequenceKey, string> = {
  QUOTATION: 'BP-Q',
  INVOICE: 'BP-INV',
  CONTRACT: 'BP-C',
  PROJECT: 'BP-P',
};

/**
 * يولّد رقمًا متسلسلًا آمنًا ضد التزامن.
 * التحديث الذري `lastNumber = lastNumber + 1` داخل transaction يمنع التكرار،
 * ويعاد ضبط العداد تلقائيًا مع بداية كل سنة.
 */
export async function nextNumber(
  key: SequenceKey,
  tx: Tx,
  now = new Date(),
): Promise<string> {
  const year = now.getUTCFullYear();
  const existing = await tx.numberSequence.findUnique({ where: { key } });

  if (!existing) {
    const created = await tx.numberSequence.create({
      data: { key, prefix: DEFAULT_PREFIX[key], year, lastNumber: 1, padding: 4 },
    });
    return format(created.prefix, year, 1, created.padding);
  }

  if (existing.year !== year) {
    const reset = await tx.numberSequence.update({
      where: { key },
      data: { year, lastNumber: 1 },
    });
    return format(reset.prefix, year, 1, reset.padding);
  }

  const updated = await tx.numberSequence.update({
    where: { key },
    data: { lastNumber: { increment: 1 } },
  });
  return format(updated.prefix, year, updated.lastNumber, updated.padding);
}

function format(prefix: string, year: number, n: number, padding: number) {
  return `${prefix}-${year}-${String(n).padStart(padding, '0')}`;
}

export async function peekSequences() {
  return prisma.numberSequence.findMany({ orderBy: { key: 'asc' } });
}

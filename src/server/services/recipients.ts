import 'server-only';
import { prisma } from '@/server/db';
import { BadRequest } from '@/server/auth/guard';

/**
 * اختيار مستلمي مراسلات العميل.
 *
 * قاعدة أمنية أساسية: المستلم المختار **يجب أن ينتمي لعميل المستند نفسه**.
 * بدون هذا التحقق يستطيع من يعرف معرّف جهة اتصال أن يرسل فاتورة عميل إلى جهة
 * اتصال عميل آخر — تسريب بيانات مالية عبر ميزة تبدو بريئة.
 */

export interface ContactOption {
  id: string;
  name: string;
  email: string;
  type: string;
  isPrimary: boolean;
}

/** كل جهات اتصال العميل التي لها بريد صالح، بترتيب حتمي. */
export async function contactOptions(clientId: string | null): Promise<ContactOption[]> {
  if (!clientId) return [];
  const rows = await prisma.contact.findMany({
    where: { clientId, deletedAt: null, email: { not: null } },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, email: true, type: true, isPrimary: true },
  });
  return rows
    .filter((r) => r.email?.includes('@'))
    .map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email!,
      type: r.type,
      isPrimary: r.isPrimary,
    }));
}

/**
 * يتحقق أن المعرّفات المختارة تخص هذا العميل ويعيد عناوينها.
 * أي معرّف لا ينتمي للعميل يوقف العملية بخطأ صريح بدل تجاهله بصمت.
 */
export async function resolveChosenContacts(
  clientId: string | null,
  contactIds: string[],
): Promise<ContactOption[]> {
  if (contactIds.length === 0) return [];
  if (!clientId) throw BadRequest('لا يمكن اختيار جهات اتصال لمستند بلا عميل');

  const options = await contactOptions(clientId);
  const byId = new Map(options.map((o) => [o.id, o]));

  const chosen: ContactOption[] = [];
  for (const id of contactIds) {
    const option = byId.get(id);
    if (!option) throw BadRequest('جهة اتصال مختارة لا تخص هذا العميل أو ليس لها بريد');
    chosen.push(option);
  }
  return chosen;
}

/** يزيل التكرار ويستبعد المستلم الأساسي من قائمة النسخ. */
export function dedupeCc(primary: string, cc: string[]): string[] {
  const seen = new Set([primary.toLowerCase()]);
  const out: string[] = [];
  for (const address of cc) {
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(address);
  }
  return out;
}

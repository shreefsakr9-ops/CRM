import { PrismaClient, Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    /**
     * الأسرار محذوفة افتراضيًا من كل استعلام.
     *
     * السبب: `include` في Prisma يعيد كل الأعمدة، ونتائج الاستعلامات تُمرَّر إلى
     * مكوّنات العميل فتُسلسَل داخل صفحة HTML. اعتماد المراجعة اليدوية لمنع ذلك
     * فشل فعلًا مرة (تسرّب hash كلمة المرور في صفحة المستخدمين).
     *
     * من يحتاج هذه الحقول — طبقة المصادقة وحدها — يطلبها صراحةً عبر
     * `omit: { passwordHash: false }` في الاستعلام نفسه، فيصير الوصول إليها
     * قرارًا ظاهرًا في الكود بدل أن يكون سلوكًا افتراضيًا صامتًا.
     */
    omit: {
      user: { passwordHash: true, twoFactorSecret: true },
      session: { tokenHash: true },
      passwordResetToken: { tokenHash: true },
      twoFactorRecoveryCode: { codeHash: true },
    },
    log:
      process.env.NODE_ENV === 'development'
        ? [{ level: 'warn', emit: 'stdout' }, { level: 'error', emit: 'stdout' }]
        : [{ level: 'error', emit: 'stdout' }],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export type Tx = Prisma.TransactionClient;

/**
 * ينفّذ عملية داخل transaction مع تمرير هوية المستخدم ونطاقه إلى PostgreSQL
 * حتى تعمل سياسات RLS كخط دفاع أخير خلف تحقق الصلاحيات في الـ Service Layer.
 *
 * ملاحظة: `SET LOCAL` لا يقبل parameter binding، لذلك نستخدم set_config() المعامَلية.
 */
export async function withRlsContext<T>(
  ctx: { userId: string; scopeAll: boolean; teamIds: string[] },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${ctx.userId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.scope_all', ${ctx.scopeAll ? 'on' : 'off'}, true)`;
    await tx.$executeRaw`SELECT set_config('app.team_ids', ${ctx.teamIds.join(',')}, true)`;
    return fn(tx);
  });
}

export { Prisma };

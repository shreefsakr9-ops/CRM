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

export { Prisma };

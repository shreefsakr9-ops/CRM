/**
 * سكريبت لمرة واحدة لإعادة تعيين كلمة مرور مستخدم (مثلًا عند فقدان الوصول للحساب)
 * مباشرة في قاعدة البيانات، دون المرور بواجهة النظام.
 *
 * الاستخدام:
 *   ADMIN_EMAIL="admin@bluepoint.local" NEW_ADMIN_PASSWORD="..." \
 *     npx tsx --conditions=react-server scripts/reset-admin-password.ts
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword, validatePasswordStrength } from '../src/server/auth/password';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const newPassword = process.env.NEW_ADMIN_PASSWORD;

  if (!email) throw new Error('متغير البيئة ADMIN_EMAIL مطلوب');
  if (!newPassword) throw new Error('متغير البيئة NEW_ADMIN_PASSWORD مطلوب');

  const strengthError = validatePasswordStrength(newPassword);
  if (strengthError) throw new Error(`كلمة المرور لا تحقق الحد الأدنى للقوة: ${strengthError}`);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`لا يوجد مستخدم بالبريد: ${email}`);

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustResetPassword: false,
      passwordChangedAt: new Date(),
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  console.log(`✔ تم تحديث كلمة المرور بنجاح للمستخدم: ${email}`);
}

main()
  .catch((err) => {
    console.error(`✖ فشل: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

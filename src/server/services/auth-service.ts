import 'server-only';
import { prisma } from '@/server/db';
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  randomToken,
  sha256,
} from '@/server/auth/password';
import {
  createSession,
  revokeAllSessions,
  getRequestMeta,
  setTwoFactorChallenge,
  readTwoFactorChallenge,
  clearTwoFactorChallenge,
} from '@/server/auth/session';
import { consumeTwoFactorChallenge } from './two-factor';
import { audit } from './audit';
import { sendMail, renderEmail, appUrl } from './mailer';
import { AppError, BadRequest } from '@/server/auth/guard';

const MAX_ATTEMPTS_PER_EMAIL = 6;
const MAX_ATTEMPTS_PER_IP = 20;
const WINDOW_MINUTES = 15;
const LOCK_MINUTES = 15;

async function recordAttempt(email: string, success: boolean, reason?: string) {
  const meta = await getRequestMeta();
  await prisma.loginAttempt.create({
    data: { email, success, reason, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 400) },
  });
}

async function isRateLimited(email: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const meta = await getRequestMeta();
  const [byEmail, byIp] = await Promise.all([
    prisma.loginAttempt.count({ where: { email, success: false, createdAt: { gte: since } } }),
    meta.ip
      ? prisma.loginAttempt.count({ where: { ip: meta.ip, success: false, createdAt: { gte: since } } })
      : Promise.resolve(0),
  ]);
  return byEmail >= MAX_ATTEMPTS_PER_EMAIL || byIp >= MAX_ATTEMPTS_PER_IP;
}

export type LoginResult =
  | { ok: true; mustResetPassword: boolean }
  /** كلمة المرور صحيحة لكن الحساب يتطلب رمز المصادقة الثنائية. */
  | { ok: true; twoFactorRequired: true }
  | { ok: false; error: string };

export async function login(emailRaw: string, password: string): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();

  if (await isRateLimited(email)) {
    await recordAttempt(email, false, 'RATE_LIMITED');
    return { ok: false, error: 'محاولات كثيرة — حاول بعد ١٥ دقيقة' };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // نفس الرسالة ونفس التكلفة الزمنية تقريبًا حتى لا نكشف وجود الحساب.
  if (!user || user.deletedAt) {
    await verifyPassword(password, 'scrypt$32768$8$1$AAAA$AAAA');
    await recordAttempt(email, false, 'NO_USER');
    return { ok: false, error: 'بيانات الدخول غير صحيحة' };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordAttempt(email, false, 'LOCKED');
    return { ok: false, error: 'الحساب مقفل مؤقتًا — حاول لاحقًا' };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed,
        lockedUntil: failed >= MAX_ATTEMPTS_PER_EMAIL ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    await recordAttempt(email, false, 'BAD_PASSWORD');
    await audit({
      userId: user.id,
      action: 'LOGIN_FAILED',
      module: 'users',
      entityType: 'USER',
      entityId: user.id,
      summary: 'محاولة دخول فاشلة',
    });
    return { ok: false, error: 'بيانات الدخول غير صحيحة' };
  }

  if (!user.isActive) {
    await recordAttempt(email, false, 'INACTIVE');
    return { ok: false, error: 'الحساب معطّل — تواصل مع الإدارة' };
  }

  // كلمة المرور صحيحة. عدّاد المحاولات يُصفَّر الآن، لكن لا جلسة قبل العامل الثاني.
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  });

  if (user.twoFactorEnabled && user.twoFactorSecret) {
    await setTwoFactorChallenge(user.id);
    // لا نسجّل المحاولة كناجحة بعد — الدخول لم يكتمل.
    await recordAttempt(email, false, 'AWAITING_2FA');
    return { ok: true, twoFactorRequired: true };
  }

  await completeLogin(user.id, email);
  return { ok: true, mustResetPassword: user.mustResetPassword };
}

async function completeLogin(userId: string, email: string) {
  const meta = await getRequestMeta();
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  await createSession(userId, meta.ip, meta.userAgent);
  await recordAttempt(email, true);
  await audit({
    userId,
    action: 'LOGIN',
    module: 'users',
    entityType: 'USER',
    entityId: userId,
    summary: 'تسجيل دخول ناجح',
  });
}

/**
 * الخطوة الثانية: لا تُقبل إلا بوجود تحدٍ موقّع صالح، أي أن كلمة المرور
 * تحققت خلال آخر خمس دقائق. المحاولات الفاشلة تُحسب ضمن نفس حد المعدل.
 */
export async function completeTwoFactorLogin(code: string): Promise<LoginResult> {
  const userId = await readTwoFactorChallenge();
  if (!userId) return { ok: false, error: 'انتهت مهلة التحقق — سجّل الدخول من جديد' };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive || user.deletedAt) {
    await clearTwoFactorChallenge();
    return { ok: false, error: 'بيانات الدخول غير صحيحة' };
  }

  if (await isRateLimited(user.email)) {
    return { ok: false, error: 'محاولات كثيرة — حاول بعد ١٥ دقيقة' };
  }

  const result = await consumeTwoFactorChallenge(userId, code);
  if (!result.ok) {
    await recordAttempt(user.email, false, 'BAD_2FA');
    await audit({
      userId,
      action: 'LOGIN_FAILED',
      module: 'users',
      entityType: 'USER',
      entityId: userId,
      summary: 'رمز مصادقة ثنائية غير صحيح',
    });
    return { ok: false, error: result.error };
  }

  await clearTwoFactorChallenge();
  await completeLogin(userId, user.email);
  return { ok: true, mustResetPassword: user.mustResetPassword };
}

/** يعيد دائمًا نفس الرد حتى لا نكشف البريد المسجَّل. */
export async function requestPasswordReset(emailRaw: string): Promise<{ token?: string }> {
  const email = emailRaw.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || user.deletedAt) return {};

  const token = randomToken(32);
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 60 * 60_000), // ساعة واحدة
    },
  });

  const resetUrl = appUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  const result = await sendMail({
    to: user.email,
    subject: 'إعادة تعيين كلمة المرور — Blue Point OS',
    html: await renderEmail({
      heading: 'طلب إعادة تعيين كلمة المرور',
      intro: `مرحبًا ${user.name}، وصلنا طلب لإعادة تعيين كلمة مرور حسابك. اضغط الزر أدناه لاختيار كلمة مرور جديدة.`,
      action: { label: 'تعيين كلمة مرور جديدة', url: resetUrl },
      footnote:
        'هذا الرابط صالح لمدة ساعة واحدة فقط ويُستخدم مرة واحدة. إذا لم تطلب أنت إعادة التعيين فتجاهل هذه الرسالة — لن يتغير شيء في حسابك، ويُفضَّل إبلاغ مدير النظام.',
    }),
  });

  await audit({
    userId: user.id,
    action: 'PASSWORD_RESET',
    module: 'users',
    entityType: 'USER',
    entityId: user.id,
    summary: `طلب إعادة تعيين كلمة المرور (البريد: ${result.status})`,
  });

  // الرمز يُعاد للمستدعي فقط في بيئة التطوير عند غياب SMTP، ولا يُعرض للمستخدم أبدًا.
  return { token };
}

export async function resetPassword(token: string, newPassword: string) {
  const strengthError = validatePasswordStrength(newPassword);
  if (strengthError) throw BadRequest(strengthError);

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError('رابط إعادة التعيين غير صالح أو منتهي', 400, 'INVALID_TOKEN');
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        mustResetPassword: false,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  // إبطال كل الجلسات القائمة بعد تغيير كلمة المرور.
  await revokeAllSessions(record.userId);
  await audit({
    userId: record.userId,
    action: 'PASSWORD_RESET',
    module: 'users',
    entityType: 'USER',
    entityId: record.userId,
    summary: 'إعادة تعيين كلمة المرور وإبطال الجلسات',
  });
}

export async function changeOwnPassword(userId: string, current: string, next: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw BadRequest('المستخدم غير موجود');
  if (!(await verifyPassword(current, user.passwordHash))) {
    throw BadRequest('كلمة المرور الحالية غير صحيحة');
  }
  const strengthError = validatePasswordStrength(next);
  if (strengthError) throw BadRequest(strengthError);

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(next),
      mustResetPassword: false,
      passwordChangedAt: new Date(),
    },
  });
  await audit({
    userId,
    action: 'PASSWORD_RESET',
    module: 'users',
    entityType: 'USER',
    entityId: userId,
    summary: 'تغيير كلمة المرور بواسطة المستخدم',
  });
}

import 'server-only';
import QRCode from 'qrcode';
import { prisma } from '@/server/db';
import { requireUser, BadRequest, AppError } from '@/server/auth/guard';
import { verifyPassword, sha256 } from '@/server/auth/password';
import { revokeAllSessions } from '@/server/auth/session';
import {
  generateTotpSecret,
  verifyTotp,
  otpauthUrl,
  generateRecoveryCodes,
  normalizeRecoveryCode,
} from '@/server/auth/totp';
import { audit } from './audit';
import { getSettings } from './settings';
import { notify } from './notifications';

/**
 * المصادقة الثنائية.
 *
 * قواعد ثابتة:
 * - السر لا يُفعَّل إلا بعد أن يثبت المستخدم أنه قرأه فعلًا (رمز صحيح).
 * - رموز الاسترجاع تُعرض مرة واحدة وتُخزَّن مجزّأة، ولا يمكن استعادتها لاحقًا.
 * - الإيقاف يتطلب كلمة المرور — وإلا لصار سرقة الجلسة كافية لإزالة الحماية.
 * - كل تغيير يُسجَّل في سجل التدقيق ويُشعر صاحب الحساب.
 */

export interface TwoFactorSetup {
  secret: string;
  otpauth: string;
  /** رمز QR كـSVG مضمَّن — يُولَّد على السيرفر فلا يخرج السر إلى خدمة خارجية. */
  qrSvg: string;
}

/** يبدأ التفعيل: يولّد سرًا مؤقتًا دون تفعيله. */
export async function beginTwoFactorSetup(): Promise<TwoFactorSetup> {
  const user = await requireUser();
  const record = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { twoFactorEnabled: true },
  });
  if (record.twoFactorEnabled) throw BadRequest('المصادقة الثنائية مفعّلة بالفعل');

  const secret = generateTotpSecret();
  const settings = await getSettings();
  // السر يُخزَّن الآن لكن `twoFactorEnabled` يبقى false — لا أثر له حتى يُؤكَّد.
  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorSecret: secret, twoFactorLastStep: null },
  });

  const otpauth = otpauthUrl({
    secret,
    account: user.email,
    issuer: settings.company.nameEn || 'Blue Point OS',
  });

  return {
    secret,
    otpauth,
    qrSvg: await QRCode.toString(otpauth, {
      type: 'svg',
      margin: 1,
      // تصحيح خطأ متوسط: يقرأ الرمز رغم انخفاض جودة الشاشة أو الطباعة.
      errorCorrectionLevel: 'M',
      color: { dark: '#0B1A2F', light: '#FFFFFF' },
    }),
  };
}

/** يؤكّد التفعيل برمز صحيح ويعيد رموز الاسترجاع مرة واحدة فقط. */
export async function confirmTwoFactor(code: string): Promise<{ recoveryCodes: string[] }> {
  const user = await requireUser();
  const record = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { twoFactorEnabled: true, twoFactorSecret: true },
  });
  if (record.twoFactorEnabled) throw BadRequest('المصادقة الثنائية مفعّلة بالفعل');
  if (!record.twoFactorSecret) throw BadRequest('ابدأ التفعيل أولًا');

  const step = verifyTotp(record.twoFactorSecret, code);
  if (step === null) throw BadRequest('الرمز غير صحيح — تأكد من ضبط ساعة جهازك');

  const codes = generateRecoveryCodes();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true, twoFactorLastStep: step },
    }),
    prisma.twoFactorRecoveryCode.deleteMany({ where: { userId: user.id } }),
    prisma.twoFactorRecoveryCode.createMany({
      data: codes.map((c) => ({ userId: user.id, codeHash: sha256(normalizeRecoveryCode(c)) })),
    }),
  ]);

  await audit({
    userId: user.id,
    action: 'UPDATE',
    module: 'users',
    entityType: 'USER',
    entityId: user.id,
    summary: 'تفعيل المصادقة الثنائية',
  });
  await notifySecurity(user.id, 'تم تفعيل المصادقة الثنائية على حسابك');

  return { recoveryCodes: codes };
}

/** الإيقاف يتطلب كلمة المرور الحالية. */
export async function disableTwoFactor(password: string) {
  const user = await requireUser();
  const record = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true, twoFactorEnabled: true },
  });
  if (!record.twoFactorEnabled) throw BadRequest('المصادقة الثنائية غير مفعّلة');
  if (!(await verifyPassword(password, record.passwordHash))) {
    throw BadRequest('كلمة المرور غير صحيحة');
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorLastStep: null },
    }),
    prisma.twoFactorRecoveryCode.deleteMany({ where: { userId: user.id } }),
  ]);

  await audit({
    userId: user.id,
    action: 'UPDATE',
    module: 'users',
    entityType: 'USER',
    entityId: user.id,
    summary: 'إيقاف المصادقة الثنائية',
  });
  await notifySecurity(user.id, 'تم إيقاف المصادقة الثنائية على حسابك');
}

/** يولّد رموز استرجاع جديدة ويُبطل القديمة — يتطلب كلمة المرور. */
export async function regenerateRecoveryCodes(password: string): Promise<string[]> {
  const user = await requireUser();
  const record = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true, twoFactorEnabled: true },
  });
  if (!record.twoFactorEnabled) throw BadRequest('المصادقة الثنائية غير مفعّلة');
  if (!(await verifyPassword(password, record.passwordHash))) {
    throw BadRequest('كلمة المرور غير صحيحة');
  }

  const codes = generateRecoveryCodes();
  await prisma.$transaction([
    prisma.twoFactorRecoveryCode.deleteMany({ where: { userId: user.id } }),
    prisma.twoFactorRecoveryCode.createMany({
      data: codes.map((c) => ({ userId: user.id, codeHash: sha256(normalizeRecoveryCode(c)) })),
    }),
  ]);

  await audit({
    userId: user.id,
    action: 'UPDATE',
    module: 'users',
    entityType: 'USER',
    entityId: user.id,
    summary: 'إعادة توليد رموز استرجاع المصادقة الثنائية',
  });
  await notifySecurity(user.id, 'أُعيد توليد رموز الاسترجاع — الرموز القديمة لم تعد صالحة');
  return codes;
}

/**
 * هل هذا الدور مُلزَم بالمصادقة الثنائية؟
 *
 * الإلزام يُفرض عند دخول التطبيق لا عند تسجيل الدخول: المستخدم يدخل فعلًا لكنه
 * لا يصل إلى أي بيانات قبل التفعيل — وإلا لما استطاع تفعيلها أصلًا.
 */
export async function isTwoFactorRequiredForRole(roleKey: string): Promise<boolean> {
  const settings = await getSettings();
  return settings.security.requireTwoFactorRoles.includes(roleKey);
}

/** يحدد ما إذا كان يجب توجيه المستخدم لصفحة التفعيل الإجباري. */
export async function mustEnrollTwoFactor(user: {
  id: string;
  roleKey: string;
}): Promise<boolean> {
  if (!(await isTwoFactorRequiredForRole(user.roleKey))) return false;
  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { twoFactorEnabled: true },
  });
  return record?.twoFactorEnabled === false;
}

export async function twoFactorStatus() {
  const user = await requireUser();
  const [record, remaining] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { twoFactorEnabled: true },
    }),
    prisma.twoFactorRecoveryCode.count({ where: { userId: user.id, usedAt: null } }),
  ]);
  // لا نعيد السر إطلاقًا بعد التفعيل.
  return { enabled: record.twoFactorEnabled, remainingRecoveryCodes: remaining };
}

/**
 * التحقق أثناء تسجيل الدخول — يقبل رمز التطبيق أو رمز استرجاع.
 * يُستدعى من طبقة المصادقة بعد التأكد من كلمة المرور.
 */
export async function consumeTwoFactorChallenge(
  userId: string,
  code: string,
): Promise<{ ok: true; usedRecoveryCode: boolean } | { ok: false; error: string }> {
  const record = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecret: true, twoFactorEnabled: true, twoFactorLastStep: true },
  });
  if (!record?.twoFactorEnabled || !record.twoFactorSecret) {
    return { ok: false, error: 'المصادقة الثنائية غير مفعّلة' };
  }

  const step = verifyTotp(record.twoFactorSecret, code);
  if (step !== null) {
    // الرمز صالح ٣٠ ثانية؛ من التقطه لا يستطيع إعادة استخدامه بعد أول نجاح.
    if (record.twoFactorLastStep !== null && step <= record.twoFactorLastStep) {
      return { ok: false, error: 'هذا الرمز استُخدم بالفعل — انتظر الرمز التالي' };
    }
    await prisma.user.update({ where: { id: userId }, data: { twoFactorLastStep: step } });
    return { ok: true, usedRecoveryCode: false };
  }

  // رمز الاسترجاع يُستهلك مرة واحدة.
  const hash = sha256(normalizeRecoveryCode(code));
  const recovery = await prisma.twoFactorRecoveryCode.findFirst({
    where: { userId, codeHash: hash, usedAt: null },
  });
  if (recovery) {
    await prisma.twoFactorRecoveryCode.update({
      where: { id: recovery.id },
      data: { usedAt: new Date() },
    });
    await audit({
      userId,
      action: 'LOGIN',
      module: 'users',
      entityType: 'USER',
      entityId: userId,
      summary: 'دخول باستخدام رمز استرجاع للمصادقة الثنائية',
    });
    await notifySecurity(userId, 'استُخدم رمز استرجاع لتسجيل الدخول إلى حسابك');
    return { ok: true, usedRecoveryCode: true };
  }

  return { ok: false, error: 'الرمز غير صحيح' };
}

/**
 * إعادة تعيين المصادقة الثنائية لمستخدم فقد جهازه ورموزه.
 * إجراء إداري صريح: يُسجَّل ويُبطل جلسات المستخدم ويُشعره.
 */
export async function resetUserTwoFactor(targetUserId: string) {
  const admin = await requireUser();
  if (!admin.permissions['users.manage'] && admin.roleKey !== 'SUPER_ADMIN') {
    throw new AppError('ليس لديك صلاحية إعادة تعيين المصادقة الثنائية', 403, 'FORBIDDEN');
  }
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { name: true, twoFactorEnabled: true },
  });
  if (!target) throw BadRequest('المستخدم غير موجود');
  if (!target.twoFactorEnabled) throw BadRequest('المصادقة الثنائية غير مفعّلة لهذا المستخدم');

  await prisma.$transaction([
    prisma.user.update({
      where: { id: targetUserId },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorLastStep: null },
    }),
    prisma.twoFactorRecoveryCode.deleteMany({ where: { userId: targetUserId } }),
  ]);
  await revokeAllSessions(targetUserId);

  await audit({
    userId: admin.id,
    action: 'UPDATE',
    module: 'users',
    entityType: 'USER',
    entityId: targetUserId,
    summary: `إعادة تعيين المصادقة الثنائية للمستخدم ${target.name} بواسطة الإدارة`,
  });
  await notifySecurity(targetUserId, 'أعادت الإدارة تعيين المصادقة الثنائية لحسابك — فعّلها من جديد');
}

async function notifySecurity(userId: string, title: string) {
  await notify({
    userId,
    type: 'SECURITY',
    title,
    dedupeKey: `SECURITY:2FA:${userId}:${Date.now()}`,
  }).catch(() => undefined);
}

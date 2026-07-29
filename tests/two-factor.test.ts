import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { mockSession, actAs, createTestUser, prisma, resetBusinessData } from './helpers';

mockSession();

const twoFactor = await import('@/server/services/two-factor');
const { totpCode, generateTotpSecret, normalizeRecoveryCode } = await import('@/server/auth/totp');
const { sha256 } = await import('@/server/auth/password');
const { AppError } = await import('@/server/auth/guard');
const settings = await import('@/server/services/settings');

const USER = 'tfa.user@bluepoint.local';
const ADMIN = 'tfa.admin@bluepoint.local';
const OTHER = 'tfa.other@bluepoint.local';
const PASSWORD = 'TestPass#2026';

let userId = '';

/** يفعّل المصادقة الثنائية فعليًا ويعيد السر ورموز الاسترجاع. */
async function enableFor(email: string) {
  await actAs(email);
  const setup = await twoFactor.beginTwoFactorSetup();
  const { recoveryCodes } = await twoFactor.confirmTwoFactor(totpCode(setup.secret));
  return { secret: setup.secret, recoveryCodes };
}

beforeAll(async () => {
  await resetBusinessData();
  const user = await createTestUser({ email: USER, name: 'مستخدم', roleKey: 'ACCOUNT_MANAGER' });
  await createTestUser({ email: ADMIN, name: 'مدير النظام', roleKey: 'SUPER_ADMIN' });
  await createTestUser({ email: OTHER, name: 'مستخدم آخر', roleKey: 'ACCOUNT_MANAGER' });
  userId = user.id;
});

beforeEach(async () => {
  // نعيد الحساب إلى حالة بلا مصادقة ثنائية قبل كل اختبار.
  await prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } });
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorLastStep: null },
  });
  await actAs(USER);
});

describe('التفعيل', () => {
  it('بدء التفعيل لا يفعّلها قبل تأكيد الرمز', async () => {
    const setup = await twoFactor.beginTwoFactorSetup();
    expect(setup.secret.length).toBeGreaterThan(20);
    expect(setup.otpauth).toContain('otpauth://totp/');
    expect(setup.qrSvg).toContain('<svg');

    const record = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    // السر مخزَّن لكن الحماية لم تُفعَّل بعد — لو فُعِّلت الآن لأُقفل المستخدم خارج حسابه.
    expect(record.twoFactorSecret).toBe(setup.secret);
    expect(record.twoFactorEnabled).toBe(false);
    expect(await twoFactor.twoFactorStatus()).toMatchObject({ enabled: false });
  });

  it('رمز خاطئ لا يفعّل المصادقة', async () => {
    await twoFactor.beginTwoFactorSetup();
    await expect(twoFactor.confirmTwoFactor('000000')).rejects.toBeInstanceOf(AppError);
    const record = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(record.twoFactorEnabled).toBe(false);
  });

  it('رمز صحيح يفعّلها ويعيد عشرة رموز استرجاع', async () => {
    const { recoveryCodes } = await enableFor(USER);
    expect(recoveryCodes).toHaveLength(10);
    expect(await twoFactor.twoFactorStatus()).toEqual({
      enabled: true,
      remainingRecoveryCodes: 10,
    });
  });

  it('رموز الاسترجاع تُخزَّن مجزّأة لا كنص صريح', async () => {
    const { recoveryCodes } = await enableFor(USER);
    const stored = await prisma.twoFactorRecoveryCode.findMany({ where: { userId } });
    const hashes = stored.map((r) => r.codeHash);

    for (const code of recoveryCodes) {
      expect(hashes).not.toContain(code);
      expect(hashes).toContain(sha256(normalizeRecoveryCode(code)));
    }
  });

  it('لا يمكن بدء التفعيل وهي مفعّلة أصلًا', async () => {
    await enableFor(USER);
    await expect(twoFactor.beginTwoFactorSetup()).rejects.toBeInstanceOf(AppError);
  });
});

describe('التحقق عند الدخول', () => {
  it('يقبل رمز التطبيق الصحيح', async () => {
    const { secret } = await enableFor(USER);
    // رمز التفعيل نفسه استُهلك، فنستخدم رمز الخطوة التالية كما يفعل المستخدم فعليًا.
    const next = totpCode(secret, new Date(Date.now() + 30_000));
    const result = await twoFactor.consumeTwoFactorChallenge(userId, next);
    expect(result).toEqual({ ok: true, usedRecoveryCode: false });
  });

  it('لا يمكن إعادة استخدام رمز التفعيل نفسه لتسجيل الدخول', async () => {
    const { secret } = await enableFor(USER);
    // من التقط الرمز أثناء التفعيل لا يستطيع الدخول به خلال الثواني الثلاثين.
    const result = await twoFactor.consumeTwoFactorChallenge(userId, totpCode(secret));
    expect(result.ok).toBe(false);
  });

  it('يرفض إعادة استخدام نفس الرمز مرتين', async () => {
    const { secret } = await enableFor(USER);
    const next = totpCode(secret, new Date(Date.now() + 30_000));

    expect((await twoFactor.consumeTwoFactorChallenge(userId, next)).ok).toBe(true);
    expect((await twoFactor.consumeTwoFactorChallenge(userId, next)).ok).toBe(false);
  });

  it('يرفض رمزًا أقدم من آخر رمز مقبول', async () => {
    const { secret } = await enableFor(USER);
    // خطوة واحدة للأمام هي أقصى ما تقبله النافذة (±٣٠ ثانية).
    const ahead = totpCode(secret, new Date(Date.now() + 30_000));
    expect((await twoFactor.consumeTwoFactorChallenge(userId, ahead)).ok).toBe(true);

    // رمز اللحظة الحالية صالح زمنيًا لكنه أقدم من آخر خطوة مقبولة — يُرفض.
    const older = totpCode(secret);
    expect((await twoFactor.consumeTwoFactorChallenge(userId, older)).ok).toBe(false);
  });

  it('رمز خارج نافذة التحمّل (± خطوة) مرفوض', async () => {
    const { secret } = await enableFor(USER);
    const farAhead = totpCode(secret, new Date(Date.now() + 120_000));
    expect((await twoFactor.consumeTwoFactorChallenge(userId, farAhead)).ok).toBe(false);
  });

  it('يرفض رمزًا مولَّدًا من سر آخر', async () => {
    await enableFor(USER);
    const result = await twoFactor.consumeTwoFactorChallenge(userId, totpCode(generateTotpSecret()));
    expect(result.ok).toBe(false);
  });

  it('يقبل رمز الاسترجاع ويستهلكه مرة واحدة فقط', async () => {
    const { recoveryCodes } = await enableFor(USER);
    const code = recoveryCodes[0]!;

    const first = await twoFactor.consumeTwoFactorChallenge(userId, code);
    expect(first).toEqual({ ok: true, usedRecoveryCode: true });

    const second = await twoFactor.consumeTwoFactorChallenge(userId, code);
    expect(second.ok).toBe(false);

    await actAs(USER);
    expect((await twoFactor.twoFactorStatus()).remainingRecoveryCodes).toBe(9);
  });

  it('يقبل رمز الاسترجاع بأي تنسيق كتبه المستخدم', async () => {
    const { recoveryCodes } = await enableFor(USER);
    const messy = `  ${recoveryCodes[1]!.toUpperCase().replace(/-/g, ' ')}  `;
    expect((await twoFactor.consumeTwoFactorChallenge(userId, messy)).ok).toBe(true);
  });

  it('يرفض التحقق لمستخدم لم يفعّلها', async () => {
    const result = await twoFactor.consumeTwoFactorChallenge(userId, '123456');
    expect(result.ok).toBe(false);
  });
});

describe('الإيقاف وإعادة التوليد', () => {
  it('الإيقاف بكلمة مرور خاطئة يفشل ويُبقي الحماية', async () => {
    await enableFor(USER);
    await expect(twoFactor.disableTwoFactor('WrongPass#2026')).rejects.toBeInstanceOf(AppError);
    expect((await twoFactor.twoFactorStatus()).enabled).toBe(true);
  });

  it('الإيقاف بكلمة المرور الصحيحة يمسح السر ورموز الاسترجاع', async () => {
    await enableFor(USER);
    await twoFactor.disableTwoFactor(PASSWORD);

    const record = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(record.twoFactorEnabled).toBe(false);
    expect(record.twoFactorSecret).toBeNull();
    expect(await prisma.twoFactorRecoveryCode.count({ where: { userId } })).toBe(0);
  });

  it('إعادة التوليد تُبطل الرموز القديمة', async () => {
    const { recoveryCodes } = await enableFor(USER);
    const fresh = await twoFactor.regenerateRecoveryCodes(PASSWORD);

    expect(fresh).toHaveLength(10);
    expect(fresh).not.toContain(recoveryCodes[0]);
    // الرمز القديم لم يعد يعمل.
    expect((await twoFactor.consumeTwoFactorChallenge(userId, recoveryCodes[0]!)).ok).toBe(false);
    expect((await twoFactor.consumeTwoFactorChallenge(userId, fresh[0]!)).ok).toBe(true);
  });

  it('إعادة التوليد تتطلب كلمة المرور', async () => {
    await enableFor(USER);
    await expect(twoFactor.regenerateRecoveryCodes('WrongPass#2026')).rejects.toBeInstanceOf(
      AppError,
    );
  });
});

describe('إعادة التعيين الإدارية', () => {
  it('المستخدم العادي لا يستطيع إعادة تعيين مصادقة غيره', async () => {
    await enableFor(USER);
    await actAs(OTHER);
    await expect(twoFactor.resetUserTwoFactor(userId)).rejects.toBeInstanceOf(AppError);
    await actAs(USER);
    expect((await twoFactor.twoFactorStatus()).enabled).toBe(true);
  });

  it('المسؤول يعيد التعيين ويُبطل جلسات المستخدم', async () => {
    await enableFor(USER);
    await prisma.session.create({
      data: {
        userId,
        tokenHash: `test-${Date.now()}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    await actAs(ADMIN);
    await twoFactor.resetUserTwoFactor(userId);

    const record = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(record.twoFactorEnabled).toBe(false);
    expect(record.twoFactorSecret).toBeNull();

    const live = await prisma.session.count({ where: { userId, revokedAt: null } });
    expect(live).toBe(0);
  });

  it('يرفض إعادة التعيين لمن لم يفعّلها', async () => {
    await actAs(ADMIN);
    await expect(twoFactor.resetUserTwoFactor(userId)).rejects.toBeInstanceOf(AppError);
  });
});

describe('إلزام المصادقة الثنائية حسب الدور', () => {
  async function setRequiredRoles(roles: string[]) {
    await actAs(ADMIN);
    await settings.updateSettingSection(
      'security',
      { requireTwoFactorRoles: roles },
      (await actAs(ADMIN)).id,
    );
    settings.invalidateSettingsCache();
  }

  it('الدور غير المُلزَم لا يُطالَب بالتفعيل', async () => {
    await setRequiredRoles(['SUPER_ADMIN']);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: USER },
      select: { id: true, role: { select: { key: true } } },
    });
    expect(await twoFactor.mustEnrollTwoFactor({ id: user.id, roleKey: user.role.key })).toBe(false);
  });

  it('الدور المُلزَم يُطالَب بالتفعيل ما لم يفعّلها', async () => {
    await setRequiredRoles(['ACCOUNT_MANAGER']);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: USER },
      select: { id: true, role: { select: { key: true } } },
    });
    expect(await twoFactor.mustEnrollTwoFactor({ id: user.id, roleKey: user.role.key })).toBe(true);
  });

  it('بعد التفعيل لا يُطالَب مجددًا', async () => {
    await setRequiredRoles(['ACCOUNT_MANAGER']);
    await enableFor(USER);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: USER },
      select: { id: true, role: { select: { key: true } } },
    });
    expect(await twoFactor.mustEnrollTwoFactor({ id: user.id, roleKey: user.role.key })).toBe(false);
  });

  it('إعادة التعيين الإدارية تُعيد المطالبة بالتفعيل', async () => {
    await setRequiredRoles(['ACCOUNT_MANAGER']);
    await enableFor(USER);

    await actAs(ADMIN);
    await twoFactor.resetUserTwoFactor(userId);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: USER },
      select: { id: true, role: { select: { key: true } } },
    });
    // المستخدم لا يبقى بلا حماية بصمت — يُطالَب بالتفعيل عند دخوله القادم.
    expect(await twoFactor.mustEnrollTwoFactor({ id: user.id, roleKey: user.role.key })).toBe(true);
    await setRequiredRoles(['SUPER_ADMIN']);
  });
});

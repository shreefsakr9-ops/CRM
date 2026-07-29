import { describe, it, expect } from 'vitest';
import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  totpCode,
  verifyTotp,
  otpauthUrl,
  generateRecoveryCodes,
  normalizeRecoveryCode,
} from '@/server/auth/totp';

/**
 * التحقق الأساسي هنا هو مطابقة متجهات الاختبار المنشورة في RFC 6238.
 * تطبيق TOTP يبدو صحيحًا وهو خاطئ بسهولة، ولن يكتشف المستخدم الخطأ إلا بعد
 * أن يقفل نفسه خارج حسابه — لذلك لا نكتفي باختبار «يولّد ستة أرقام».
 */

// السر في الـRFC هو "12345678901234567890" نصًا، مُرمَّزًا base32.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('متجهات RFC 6238 المرجعية', () => {
  // القيم من الجدول الرسمي لخوارزمية SHA-1 (٦ أرقام تُشتق من الثمانية المنشورة).
  const vectors: [number, string][] = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ];

  for (const [seconds, expected] of vectors) {
    it(`t=${seconds} ينتج ${expected}`, () => {
      expect(totpCode(RFC_SECRET, new Date(seconds * 1000))).toBe(expected);
    });
  }
});

describe('ترميز base32', () => {
  it('يعيد القيمة الأصلية بعد الترميز وفك الترميز', () => {
    const original = Buffer.from('بلو بوينت — Blue Point');
    expect(base32Decode(base32Encode(original)).equals(original)).toBe(true);
  });

  it('يتحمّل المسافات والشرطات وحشو المساواة عند النسخ اليدوي', () => {
    const secret = generateTotpSecret();
    const messy = `${secret.slice(0, 4)} ${secret.slice(4, 8)}-${secret.slice(8)}==`;
    expect(base32Decode(messy).equals(base32Decode(secret))).toBe(true);
  });

  it('يرفض الحروف خارج أبجدية base32', () => {
    expect(() => base32Decode('ABC1')).toThrow();
  });
});

describe('السر المولَّد', () => {
  it('طوله ١٦٠ بت كما توصي RFC 4226', () => {
    expect(base32Decode(generateTotpSecret()).length).toBe(20);
  });

  it('لا يتكرر بين استدعاءين', () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret());
  });
});

describe('التحقق من الرمز', () => {
  const secret = generateTotpSecret();
  const now = new Date(1_700_000_000_000);

  it('يقبل رمز اللحظة الحالية ويعيد رقم الخطوة', () => {
    const step = verifyTotp(secret, totpCode(secret, now), now);
    expect(step).toBe(Math.floor(now.getTime() / 1000 / 30));
  });

  it('يقبل الخطوة السابقة والتالية لتحمّل انحراف الساعة', () => {
    const before = new Date(now.getTime() - 30_000);
    const after = new Date(now.getTime() + 30_000);
    expect(verifyTotp(secret, totpCode(secret, before), now)).not.toBeNull();
    expect(verifyTotp(secret, totpCode(secret, after), now)).not.toBeNull();
  });

  it('يرفض رمزًا أقدم من النافذة المسموحة', () => {
    const stale = new Date(now.getTime() - 120_000);
    expect(verifyTotp(secret, totpCode(secret, stale), now)).toBeNull();
  });

  it('يرفض سر مستخدم آخر', () => {
    expect(verifyTotp(generateTotpSecret(), totpCode(secret, now), now)).toBeNull();
  });

  it('يرفض المدخلات المشوَّهة بدل أن يرمي خطأ', () => {
    for (const bad of ['', '12345', '1234567', 'abcdef', '   ']) {
      expect(verifyTotp(secret, bad, now)).toBeNull();
    }
  });

  it('يتجاهل المسافات والشرطات في الرمز المُدخل', () => {
    const code = totpCode(secret, now);
    expect(verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, now)).not.toBeNull();
  });

  it('رقم الخطوة يتغيّر مع الوقت ليمنع إعادة استخدام نفس الرمز', () => {
    const later = new Date(now.getTime() + 60_000);
    const first = verifyTotp(secret, totpCode(secret, now), now);
    const second = verifyTotp(secret, totpCode(secret, later), later);
    expect(first).not.toBe(second);
  });
});

describe('رابط otpauth', () => {
  it('يحمل السر والمُصدر والمعاملات القياسية', () => {
    const url = otpauthUrl({ secret: 'ABCDEF', account: 'a@b.com', issuer: 'Blue Point OS' });
    expect(url.startsWith('otpauth://totp/')).toBe(true);
    expect(url).toContain('secret=ABCDEF');
    expect(url).toContain('algorithm=SHA1');
    expect(url).toContain('digits=6');
    expect(url).toContain('period=30');
  });

  it('يرمّز المسافات في اسم المُصدر فلا ينكسر الرابط', () => {
    const url = otpauthUrl({ secret: 'ABCDEF', account: 'a@b.com', issuer: 'Blue Point' });
    expect(url).not.toMatch(/totp\/[^?]*\s/);
  });
});

describe('رموز الاسترجاع', () => {
  it('يولّد عشرة رموز فريدة', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
  });

  it('يوحّد صيغة الرمز عند الإدخال', () => {
    const [code] = generateRecoveryCodes(1);
    expect(normalizeRecoveryCode(`  ${code!.toUpperCase()}  `)).toBe(code!.replace(/-/g, ''));
  });
});

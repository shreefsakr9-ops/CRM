import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP وفق RFC 6238 (والـHOTP في RFC 4226) مبنيًا على `node:crypto` مباشرة.
 *
 * لماذا بلا مكتبة: الخوارزمية ~40 سطرًا، وإضافة تبعية تتعامل مع أسرار المصادقة
 * تزيد سطح الثقة بلا مقابل. كل التطبيقات القياسية (Google Authenticator، Authy،
 * 1Password، Microsoft Authenticator) تستخدم SHA-1 / 6 أرقام / 30 ثانية.
 */

const DIGITS = 6;
const PERIOD = 30;
const ALGORITHM = 'sha1';
/** يقبل رمز الخطوة السابقة والتالية لتحمّل انحراف ساعة الجهاز (±30 ثانية). */
const WINDOW = 1;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  // نتجاهل المسافات وحشو '=' لأن المستخدمين ينسخون السر بصيغ مختلفة.
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('سر غير صالح');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** ١٦٠ بت — الطول الموصى به في RFC 4226 لخوارزمية SHA-1. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(secret: Buffer, counter: number): string {
  const buffer = Buffer.alloc(8);
  // العداد 64 بت؛ نكتبه على نصفين لأن Number لا يمثّل 64 بت بدقة.
  buffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac(ALGORITHM, secret).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

export function totpCode(secret: string, at: Date = new Date()): string {
  return hotp(base32Decode(secret), Math.floor(at.getTime() / 1000 / PERIOD));
}

/**
 * يتحقق من الرمز ضمن نافذة ±خطوة واحدة.
 * يعيد رقم الخطوة المستخدمة (وليس true فقط) حتى يمنع المستدعي إعادة استخدام
 * نفس الرمز — الرمز صالح ٣٠ ثانية ويمكن التقاطه وإعادة إرساله خلالها.
 */
export function verifyTotp(secret: string, code: string, at: Date = new Date()): number | null {
  const cleaned = code.replace(/\D/g, '');
  if (cleaned.length !== DIGITS) return null;

  const current = Math.floor(at.getTime() / 1000 / PERIOD);
  const key = base32Decode(secret);
  const provided = Buffer.from(cleaned);

  let matched: number | null = null;
  // نفحص كل الخطوات دائمًا بلا خروج مبكر حتى لا يتسرب موضع التطابق زمنيًا.
  for (let offset = -WINDOW; offset <= WINDOW; offset++) {
    const step = current + offset;
    const expected = Buffer.from(hotp(key, step));
    if (expected.length === provided.length && timingSafeEqual(expected, provided)) {
      matched = step;
    }
  }
  return matched;
}

/** رابط otpauth القياسي الذي تقرأه تطبيقات المصادقة. */
export function otpauthUrl(params: { secret: string; account: string; issuer: string }): string {
  const label = encodeURIComponent(`${params.issuer}:${params.account}`);
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: ALGORITHM.toUpperCase(),
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/**
 * رموز الاسترجاع: تُعرض مرة واحدة عند التفعيل وتُخزَّن مجزّأة فقط،
 * تمامًا مثل كلمة المرور — من يقرأ قاعدة البيانات لا يستطيع الدخول بها.
 */
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(10)).slice(0, 16).toLowerCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
  });
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().toLowerCase().replace(/[\s-]/g, '');
}

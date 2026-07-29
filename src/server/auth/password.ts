import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// معاملات scrypt: N=2^15 يعطي ~100ms على vCPU عادي وهو المستوى الموصى به لـ interactive login.
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

/** يُنتج صيغة: scrypt$N$r$p$saltB64$hashB64 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize('NFKC'), salt, KEYLEN, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  try {
    const actual = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** قوة كلمة المرور — تُطبَّق على السيرفر وليس في الواجهة فقط. */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 10) return 'كلمة المرور يجب ألا تقل عن 10 أحرف';
  if (!/[a-z]/.test(password)) return 'يجب أن تحتوي على حرف صغير';
  if (!/[A-Z]/.test(password)) return 'يجب أن تحتوي على حرف كبير';
  if (!/[0-9]/.test(password)) return 'يجب أن تحتوي على رقم';
  if (/^(password|123456|qwerty|admin)/i.test(password)) return 'كلمة المرور ضعيفة ومتوقعة';
  return null;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * يحوّل القيم غير القابلة للتسلسل (BigInt / Decimal / Date) إلى قيم بسيطة
 * حتى تعبر حدود Server → Client Components بأمان.
 */
export function plain<T>(value: T): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Prisma.Decimal
    if (typeof obj.toFixed === 'function' && typeof obj.toNumber === 'function') {
      return (obj.toNumber as () => number)();
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = plain(v);
    return out;
  }
  return value;
}

/** تطبيع أرقام الهواتف المصرية/الخليجية لكشف التكرار. */
export function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, '');
  digits = digits.replace(/^00/, '+');
  if (digits.startsWith('+')) digits = digits.slice(1);
  // إزالة الصفر المحلي بعد كود الدولة الشائع
  if (digits.startsWith('20') && digits.length > 10) digits = digits.replace(/^200+/, '20');
  if (digits.startsWith('966') && digits.length > 10) digits = digits.replace(/^9660+/, '966');
  if (/^0\d{9,10}$/.test(digits)) digits = `20${digits.slice(1)}`; // افتراض مصر كسوق أساسي
  return digits || null;
}

export function normalizeEmail(raw?: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return v || null;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('');
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

export function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

import 'server-only';
import type { EntityType } from '@prisma/client';
import { prisma, type Tx } from '@/server/db';
import { getRequestMeta } from '@/server/auth/session';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'RESTORE'
  | 'PURGE'
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'EXPORT'
  | 'IMPORT'
  | 'APPROVE'
  | 'REJECT'
  | 'ASSIGN'
  | 'STATUS_CHANGE'
  | 'PRICE_CHANGE'
  | 'PERMISSION_CHANGE'
  | 'FILE_ACCESS'
  | 'PASSWORD_RESET';

interface AuditInput {
  userId?: string | null;
  action: AuditAction;
  module: string;
  entityType: EntityType;
  entityId: string;
  summary?: string;
  oldValue?: unknown;
  newValue?: unknown;
  tx?: Tx;
}

const SENSITIVE_KEYS = /password|token|secret|hash|twoFactor/i;

/** يزيل أي قيم حساسة قبل الكتابة في السجل — لا نسجل كلمات مرور أو Tokens إطلاقًا. */
export function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(sanitize);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? '[REDACTED]' : sanitize(v);
    }
    return out;
  }
  return value;
}

/** يحسب الفرق بين حالتين لتسجيل القيمة القديمة والجديدة فقط للحقول المتغيرة. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const oldValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key];
    const sa = a instanceof Date ? a.toISOString() : a;
    const sb = b instanceof Date ? b.toISOString() : b;
    if (String(sa) !== String(sb)) {
      oldValue[key] = a;
      newValue[key] = b;
    }
  }
  return { oldValue, newValue, changed: Object.keys(newValue).length > 0 };
}

export async function audit(input: AuditInput): Promise<void> {
  let meta: { ip?: string; userAgent?: string } = {};
  try {
    meta = await getRequestMeta();
  } catch {
    // خارج سياق الطلب (مثل الـ Worker) — لا IP.
  }
  const client = input.tx ?? prisma;
  await client.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      module: input.module,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      oldValue: input.oldValue === undefined ? undefined : (sanitize(input.oldValue) as object),
      newValue: input.newValue === undefined ? undefined : (sanitize(input.newValue) as object),
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 400),
    },
  });
}

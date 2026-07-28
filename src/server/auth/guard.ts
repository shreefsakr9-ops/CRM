import 'server-only';
import { getCurrentUser, type CurrentUser } from './session';
import type { ActionKey, ModuleKey, PermissionKey, Scope } from './permissions';

export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Unauthorized = () => new AppError('غير مصرح — يجب تسجيل الدخول', 401, 'UNAUTHORIZED');
export const Forbidden = (msg = 'ليس لديك صلاحية لتنفيذ هذا الإجراء') =>
  new AppError(msg, 403, 'FORBIDDEN');
export const NotFound = (msg = 'السجل غير موجود') => new AppError(msg, 404, 'NOT_FOUND');
export const BadRequest = (msg: string) => new AppError(msg, 400, 'BAD_REQUEST');
export const Conflict = (msg: string) => new AppError(msg, 409, 'CONFLICT');

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw Unauthorized();
  return user;
}

export function can(user: CurrentUser, module: ModuleKey, action: ActionKey): boolean {
  return Boolean(user.permissions[`${module}.${action}` as PermissionKey]);
}

export function scopeOf(user: CurrentUser, module: ModuleKey, action: ActionKey = 'view'): Scope | undefined {
  return user.permissions[`${module}.${action}` as PermissionKey];
}

/**
 * البوابة الإلزامية — تُستدعى في بداية كل Service قبل أي وصول للبيانات.
 */
export async function requirePermission(
  module: ModuleKey,
  action: ActionKey,
): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, module, action)) {
    throw Forbidden(`ليس لديك صلاحية «${action}» على «${module}»`);
  }
  return user;
}

/**
 * يبني شرط Prisma لتقييد النتائج حسب نطاق المستخدم.
 * ownerFields: الحقول التي تُعتبر «ملكية» للسجل (مثل assignedToId, ownerId).
 * memberPath: شرط إضافي للعضوية (مثل عضوية المشروع أو إسناد التاسك).
 */
export function scopeWhere(
  user: CurrentUser,
  module: ModuleKey,
  ownerFields: string[],
  extraOwnConditions: Record<string, unknown>[] = [],
): Record<string, unknown> {
  const scope = scopeOf(user, module);
  if (scope === 'ALL') return {};
  const ids = scope === 'TEAM' ? user.teamIds : [user.id];
  const or: Record<string, unknown>[] = ownerFields.map((f) => ({ [f]: { in: ids } }));
  or.push(...extraOwnConditions);
  return { OR: or };
}

/** يحذف الحقول المالية من الكائن إذا لم يملك المستخدم صلاحية رؤيتها. */
export function redactFinancial<T extends Record<string, unknown>>(
  user: CurrentUser,
  module: ModuleKey,
  record: T,
  financialFields: (keyof T)[],
  costProfitFields: (keyof T)[] = [],
): Partial<T> {
  const out: Partial<T> = { ...record };
  if (!can(user, module, 'view_financial')) {
    for (const f of financialFields) delete out[f];
  }
  if (!can(user, module, 'view_cost_profit')) {
    for (const f of costProfitFields) delete out[f];
  }
  return out;
}

export function rlsContext(user: CurrentUser, module: ModuleKey) {
  return {
    userId: user.id,
    scopeAll: scopeOf(user, module) === 'ALL',
    teamIds: user.teamIds,
  };
}

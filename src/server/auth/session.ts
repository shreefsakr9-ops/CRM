import 'server-only';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { prisma } from '@/server/db';
import { randomToken, sha256 } from './password';
import { buildPermissionMap, type PermissionMap, type Scope } from './permissions';

export const SESSION_COOKIE = 'bp_session';

const IDLE_MINUTES = Number(process.env.SESSION_IDLE_MINUTES ?? 240);
const ABSOLUTE_HOURS = Number(process.env.SESSION_ABSOLUTE_HOURS ?? 168);

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  nameEn: string | null;
  avatarUrl: string | null;
  roleId: string;
  roleKey: string;
  departmentId: string | null;
  locale: string;
  timezone: string;
  mustResetPassword: boolean;
  permissions: PermissionMap;
  /** معرفات المستخدمين ضمن نطاق TEAM (يشمل المستخدم نفسه) */
  teamIds: string[];
  sessionId: string;
}

export async function createSession(userId: string, ip?: string, userAgent?: string) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + ABSOLUTE_HOURS * 3600_000);
  await prisma.session.create({
    data: { userId, tokenHash: sha256(token), ip, userAgent, expiresAt },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ABSOLUTE_HOURS * 3600,
  });
  return token;
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session
      .updateMany({ where: { tokenHash: sha256(token) }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }
  jar.delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** يجمع فريق المستخدم: نفسه + كل من يتبعه مباشرة أو بشكل غير مباشر. */
async function resolveTeamIds(userId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE team AS (
      SELECT id FROM users WHERE id = ${userId}
      UNION
      SELECT u.id FROM users u JOIN team t ON u."managerId" = t.id
    )
    SELECT id FROM team
  `;
  return rows.map((r) => r.id);
}

async function loadSession(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        include: {
          role: { include: { permissions: true } },
          overrides: true,
        },
      },
    },
  });

  if (!session || session.revokedAt) return null;
  const now = new Date();
  if (session.expiresAt <= now) return null;
  if (session.lastSeenAt.getTime() + IDLE_MINUTES * 60_000 < now.getTime()) return null;
  if (!session.user.isActive || session.user.deletedAt) return null;

  // Sliding idle window — تحديث كل دقيقة على الأكثر لتقليل الكتابة.
  if (now.getTime() - session.lastSeenAt.getTime() > 60_000) {
    await prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: now } })
      .catch(() => undefined);
  }

  const permissions = buildPermissionMap(
    session.user.role.permissions.map((p) => ({
      module: p.module,
      action: p.action,
      scope: p.scope as Scope,
    })),
    session.user.overrides.map((o) => ({
      module: o.module,
      action: o.action,
      scope: o.scope as Scope,
      allow: o.allow,
    })),
  );

  const teamIds = await resolveTeamIds(session.user.id);

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    nameEn: session.user.nameEn,
    avatarUrl: session.user.avatarUrl,
    roleId: session.user.roleId,
    roleKey: session.user.role.key,
    departmentId: session.user.departmentId,
    locale: session.user.locale,
    timezone: session.user.timezone,
    mustResetPassword: session.user.mustResetPassword,
    permissions,
    teamIds,
    sessionId: session.id,
  };
}

/** مُخزَّن لكل طلب (React cache) حتى لا نستعلم أكثر من مرة. */
export const getCurrentUser = cache(loadSession);

export async function getRequestMeta() {
  const h = await headers();
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? undefined,
    userAgent: h.get('user-agent') ?? undefined,
  };
}

import 'server-only';
import type { EntityType, NotificationType } from '@prisma/client';
import { prisma, type Tx } from '@/server/db';
import { requireUser } from '@/server/auth/guard';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  entityType?: EntityType;
  entityId?: string;
  link?: string;
  /** مفتاح منع التكرار — نفس المفتاح لا يُنشئ إشعارًا مرتين. */
  dedupeKey: string;
  tx?: Tx;
}

/** الإشعارات الأمنية لا يمكن للمستخدم إيقافها. */
const UNMUTABLE: NotificationType[] = ['SECURITY'];

export async function notify(input: NotifyInput): Promise<boolean> {
  const client = input.tx ?? prisma;

  if (!UNMUTABLE.includes(input.type)) {
    const pref = await client.notificationPreference.findUnique({
      where: { userId_type: { userId: input.userId, type: input.type } },
    });
    if (pref && !pref.inApp) return false;
  }

  try {
    await client.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
        link: input.link,
        dedupeKey: input.dedupeKey,
      },
    });
    return true;
  } catch (e) {
    // خرق قيد التفرد يعني أن الإشعار موجود بالفعل — هذا سلوك مقصود.
    if ((e as { code?: string }).code === 'P2002') return false;
    throw e;
  }
}

export async function notifyMany(inputs: NotifyInput[]) {
  let created = 0;
  for (const input of inputs) {
    if (await notify(input)) created++;
  }
  return created;
}

export async function listMyNotifications(params: { unreadOnly?: boolean; take?: number } = {}) {
  const user = await requireUser();
  return prisma.notification.findMany({
    where: { userId: user.id, ...(params.unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: 'desc' },
    take: params.take ?? 50,
  });
}

export async function markRead(ids: string[]) {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { id: { in: ids }, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllRead() {
  const user = await requireUser();
  const result = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

export async function getPreferences() {
  const user = await requireUser();
  return prisma.notificationPreference.findMany({ where: { userId: user.id } });
}

export async function setPreference(
  type: NotificationType,
  values: { inApp: boolean; email: boolean; digest: 'NONE' | 'DAILY' | 'WEEKLY' },
) {
  const user = await requireUser();
  if (UNMUTABLE.includes(type)) return;
  await prisma.notificationPreference.upsert({
    where: { userId_type: { userId: user.id, type } },
    create: { userId: user.id, type, ...values },
    update: values,
  });
}

import 'server-only';
import type { EntityType } from '@prisma/client';
import { prisma } from '@/server/db';

/**
 * هل تلقّى هذا المستخدم إشارة (@) في تعليق على هذا السجل بعينه؟
 *
 * إشارة صريحة من مستخدم يملك أصلًا صلاحية الوصول للسجل تكفي لمنح المُشار
 * إليه قراءة هذا السجل تحديدًا — حتى لو كان خارج نطاق دوره المعتاد (OWN/TEAM)
 * أو لم يكن يملك صلاحية «view» على الوحدة أصلًا. المنح هنا لسجل واحد بعينه فقط،
 * لا للوحدة كاملة.
 */
export async function isMentionedOn(
  userId: string,
  entityType: EntityType,
  entityId: string,
): Promise<boolean> {
  const count = await prisma.commentMention.count({
    where: { userId, comment: { entityType, entityId, deletedAt: null } },
  });
  return count > 0;
}

import type { NextRequest } from 'next/server';
import type { EntityType } from '@prisma/client';
import { uploadFile, signFileUrl } from '@/server/services/files';
import { requireUser, BadRequest } from '@/server/auth/guard';
import { apiError, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

const ALLOWED_ENTITIES: EntityType[] = [
  'LEAD',
  'CLIENT',
  'QUOTATION',
  'CONTRACT',
  'PROJECT',
  'TASK',
  'DELIVERABLE',
  'INVOICE',
  'PAYMENT',
  'EXPENSE',
];

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const form = await request.formData();
    const file = form.get('file');
    const entityType = String(form.get('entityType') ?? '') as EntityType;
    const entityId = String(form.get('entityId') ?? '');
    const label = form.get('label') ? String(form.get('label')) : undefined;

    if (!(file instanceof File)) throw BadRequest('لم يتم إرسال ملف');
    if (!ALLOWED_ENTITIES.includes(entityType)) throw BadRequest('نوع الكيان غير مدعوم');
    if (!entityId) throw BadRequest('معرّف الكيان مطلوب');

    const record = await uploadFile({ entityType, entityId, file, label });
    return ok({
      id: record.id,
      name: record.originalName,
      version: record.version,
      url: signFileUrl(record.id, user.id),
    });
  } catch (error) {
    return apiError(error);
  }
}

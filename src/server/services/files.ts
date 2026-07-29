import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { EntityType } from '@prisma/client';
import { prisma } from '@/server/db';
import { requirePermission, requireUser, NotFound, BadRequest, Forbidden } from '@/server/auth/guard';
import { audit } from './audit';
import { getSettings } from './settings';

const STORAGE_DIR = process.env.STORAGE_DIR || './storage';

function signingSecret(): string {
  const secret = process.env.FILE_SIGNING_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('FILE_SIGNING_SECRET غير مضبوط — لا يمكن توليد روابط ملفات آمنة');
  }
  return secret;
}

/** اسم تخزين عشوائي بالكامل — لا نثق باسم الملف القادم من المستخدم. */
function safeStorageKey(originalName: string) {
  const ext = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
  const now = new Date();
  const folder = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${folder}/${randomBytes(20).toString('hex')}${ext}`;
}

function absolutePath(storageKey: string) {
  // منع الخروج من مجلد التخزين مهما كان المدخل.
  const base = path.resolve(STORAGE_DIR);
  const target = path.resolve(base, storageKey);
  if (!target.startsWith(base + path.sep)) throw BadRequest('مسار ملف غير صالح');
  return target;
}

export async function uploadFile(params: {
  entityType: EntityType;
  entityId: string;
  file: File;
  label?: string;
}) {
  const user = await requirePermission('files', 'create');
  const settings = await getSettings();

  const size = params.file.size;
  const maxBytes = settings.files.maxSizeMb * 1024 * 1024;
  if (size <= 0) throw BadRequest('الملف فارغ');
  if (size > maxBytes) {
    throw BadRequest(`حجم الملف يتجاوز الحد المسموح (${settings.files.maxSizeMb} ميجابايت)`);
  }
  const mime = params.file.type || 'application/octet-stream';
  if (!settings.files.allowedTypes.includes(mime)) {
    throw BadRequest(`نوع الملف غير مسموح: ${mime}`);
  }

  const buffer = Buffer.from(await params.file.arrayBuffer());
  const checksum = createHash('sha256').update(buffer).digest('hex');
  const storageKey = safeStorageKey(params.file.name);
  const target = absolutePath(storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, buffer, { mode: 0o640 });

  // إصدار جديد لكل رفع — لا نستبدل الملفات القديمة أبدًا.
  const last = await prisma.fileObject.findFirst({
    where: { entityType: params.entityType, entityId: params.entityId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  const record = await prisma.fileObject.create({
    data: {
      storageKey,
      originalName: params.file.name.slice(0, 240),
      mimeType: mime,
      sizeBytes: size,
      checksum,
      entityType: params.entityType,
      entityId: params.entityId,
      version: (last?.version ?? 0) + 1,
      label: params.label,
      uploadedById: user.id,
      retentionUntil: new Date(Date.now() + settings.files.retentionDays * 86_400_000),
    },
  });

  await prisma.activity.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      type: 'FILE',
      subject: `رفع ملف: ${record.originalName} (إصدار ${record.version})`,
      userId: user.id,
    },
  });
  await audit({
    userId: user.id,
    action: 'CREATE',
    module: 'files',
    entityType: 'FILE',
    entityId: record.id,
    summary: `رفع ملف ${record.originalName}`,
    newValue: { entityType: params.entityType, entityId: params.entityId, size },
  });

  return record;
}

/** رابط موقّع قصير العمر — لا يوجد وصول عام لأي ملف. */
export function signFileUrl(fileId: string, userId: string, ttlSeconds = 300) {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${fileId}.${userId}.${expires}`;
  const sig = createHmac('sha256', signingSecret()).update(payload).digest('base64url');
  return `/api/files/${fileId}?exp=${expires}&sig=${sig}`;
}

export function verifyFileSignature(fileId: string, userId: string, expires: string, sig: string) {
  const exp = Number(expires);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac('sha256', signingSecret())
    .update(`${fileId}.${userId}.${exp}`)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function readFileForDownload(fileId: string, expires: string, sig: string) {
  const user = await requireUser();
  if (!verifyFileSignature(fileId, user.id, expires, sig)) {
    throw Forbidden('رابط الملف غير صالح أو منتهي الصلاحية');
  }

  const record = await prisma.fileObject.findFirst({ where: { id: fileId, deletedAt: null } });
  if (!record) throw NotFound('الملف غير موجود');

  // التحقق من صلاحية الوصول للكيان المرتبط وليس للملف فقط.
  await assertEntityAccess(record.entityType, record.entityId);

  const buffer = await readFile(absolutePath(record.storageKey));
  await prisma.fileDownload.create({ data: { fileId, userId: user.id } });
  await audit({
    userId: user.id,
    action: 'FILE_ACCESS',
    module: 'files',
    entityType: 'FILE',
    entityId: fileId,
    summary: `تحميل الملف ${record.originalName}`,
  });

  return { buffer, record };
}

/** يمنع الوصول لملف عبر رابط مباشر إذا لم يكن للمستخدم حق على الكيان المرتبط. */
async function assertEntityAccess(entityType: EntityType, entityId: string) {
  const { scopeWhere } = await import('@/server/auth/guard');
  const user = await requireUser();

  switch (entityType) {
    case 'TASK': {
      const found = await prisma.task.findFirst({
        where: {
          id: entityId,
          ...scopeWhere(user, 'tasks', ['creatorId', 'reviewerId'], [
            { assignees: { some: { userId: user.id } } },
          ]),
        },
        select: { id: true },
      });
      if (!found) throw NotFound('الملف غير موجود');
      return;
    }
    case 'PROJECT': {
      const found = await prisma.project.findFirst({
        where: {
          id: entityId,
          ...scopeWhere(user, 'projects', ['ownerId', 'accountManagerId', 'createdById'], [
            { members: { some: { userId: user.id } } },
          ]),
        },
        select: { id: true },
      });
      if (!found) throw NotFound('الملف غير موجود');
      return;
    }
    case 'CLIENT': {
      const found = await prisma.client.findFirst({
        where: {
          id: entityId,
          ...scopeWhere(user, 'clients', ['accountManagerId', 'salesOwnerId', 'createdById']),
        },
        select: { id: true },
      });
      if (!found) throw NotFound('الملف غير موجود');
      return;
    }
    case 'LEAD': {
      const found = await prisma.lead.findFirst({
        where: { id: entityId, ...scopeWhere(user, 'leads', ['assignedToId', 'createdById']) },
        select: { id: true },
      });
      if (!found) throw NotFound('الملف غير موجود');
      return;
    }
    case 'INVOICE':
    case 'PAYMENT':
    case 'EXPENSE': {
      await requirePermission(
        entityType === 'INVOICE' ? 'invoices' : entityType === 'PAYMENT' ? 'payments' : 'expenses',
        'view',
      );
      return;
    }
    default:
      await requirePermission('files', 'view');
  }
}

export async function listFiles(entityType: EntityType, entityId: string) {
  await requirePermission('files', 'view');
  await assertEntityAccess(entityType, entityId);
  return prisma.fileObject.findMany({
    where: { entityType, entityId, deletedAt: null },
    orderBy: { version: 'desc' },
    include: { uploadedBy: { select: { name: true } }, _count: { select: { downloads: true } } },
  });
}

export async function softDeleteFile(fileId: string) {
  const user = await requirePermission('files', 'delete');
  const record = await prisma.fileObject.findUnique({ where: { id: fileId } });
  if (!record) throw NotFound('الملف غير موجود');
  await prisma.fileObject.update({ where: { id: fileId }, data: { deletedAt: new Date() } });
  await audit({
    userId: user.id,
    action: 'DELETE',
    module: 'files',
    entityType: 'FILE',
    entityId: fileId,
    summary: `حذف الملف ${record.originalName}`,
  });
}

/** الحذف النهائي يمسح الملف من القرص أيضًا — لصلاحية purge فقط. */
export async function purgeFile(fileId: string) {
  const user = await requirePermission('files', 'delete');
  const { can } = await import('@/server/auth/guard');
  if (!can(user, 'files', 'delete') || !can(user, 'settings', 'manage')) {
    throw Forbidden('الحذف النهائي متاح لمن يملك صلاحية الإدارة الكاملة فقط');
  }
  const record = await prisma.fileObject.findUnique({ where: { id: fileId } });
  if (!record) throw NotFound('الملف غير موجود');
  await unlink(absolutePath(record.storageKey)).catch(() => undefined);
  await prisma.fileObject.delete({ where: { id: fileId } });
  await audit({
    userId: user.id,
    action: 'PURGE',
    module: 'files',
    entityType: 'FILE',
    entityId: fileId,
    summary: `حذف نهائي للملف ${record.originalName}`,
  });
}

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { requirePermission, AppError } from '@/server/auth/guard';
import {
  updateSettingSection,
  getSettings,
  type SystemSettings,
} from '@/server/services/settings';
import { audit } from '@/server/services/audit';

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? 'بيانات غير صالحة' };
    console.error('[settings action]', e);
    return { ok: false, error: 'حدث خطأ غير متوقع' };
  }
}

export async function saveSettingsSectionAction(
  section: keyof SystemSettings,
  values: Record<string, unknown>,
): Promise<Result> {
  return guard(async () => {
    const user = await requirePermission('settings', 'edit');
    const current = await getSettings(true);
    // الدمج مع القيم الحالية حتى لا يمسح حقل غير مُرسَل.
    const merged = { ...(current[section] as Record<string, unknown>), ...values };
    await updateSettingSection(section, merged as never, user.id);
    revalidatePath('/settings');
    return undefined;
  });
}

/* ── البيانات المرجعية القابلة للتخصيص ─────────────── */

const stageSchema = z.object({
  id: z.string().optional(),
  key: z.string().min(2),
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  probability: z.coerce.number().min(0).max(100),
  sortOrder: z.coerce.number().int().min(0),
  color: z.string().min(4),
  isWon: z.coerce.boolean().default(false),
  isLost: z.coerce.boolean().default(false),
  isActive: z.coerce.boolean().default(true),
});

export async function saveStageAction(raw: unknown): Promise<Result> {
  return guard(async () => {
    const user = await requirePermission('settings', 'manage');
    const data = stageSchema.parse(raw);
    if (data.id) {
      await prisma.pipelineStage.update({
        where: { id: data.id },
        data: {
          nameAr: data.nameAr,
          nameEn: data.nameEn,
          probability: data.probability,
          sortOrder: data.sortOrder,
          color: data.color,
          isActive: data.isActive,
        },
      });
    } else {
      await prisma.pipelineStage.create({
        data: {
          pipeline: 'DEAL',
          key: data.key.toUpperCase(),
          nameAr: data.nameAr,
          nameEn: data.nameEn,
          probability: data.probability,
          sortOrder: data.sortOrder,
          color: data.color,
          isWon: data.isWon,
          isLost: data.isLost,
        },
      });
    }
    await audit({
      userId: user.id,
      action: 'UPDATE',
      module: 'settings',
      entityType: 'SETTING',
      entityId: data.id ?? data.key,
      summary: `${data.id ? 'تعديل' : 'إضافة'} مرحلة مسار: ${data.nameAr}`,
    });
    revalidatePath('/settings');
    return undefined;
  });
}

const simpleListSchema = z.object({
  id: z.string().optional(),
  key: z.string().min(2),
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  isActive: z.coerce.boolean().default(true),
});

export async function saveLeadSourceAction(raw: unknown): Promise<Result> {
  return guard(async () => {
    const user = await requirePermission('settings', 'manage');
    const data = simpleListSchema.parse(raw);
    if (data.id) {
      await prisma.leadSource.update({
        where: { id: data.id },
        data: { nameAr: data.nameAr, nameEn: data.nameEn, isActive: data.isActive },
      });
    } else {
      await prisma.leadSource.create({
        data: { key: data.key.toUpperCase(), nameAr: data.nameAr, nameEn: data.nameEn },
      });
    }
    await audit({
      userId: user.id,
      action: 'UPDATE',
      module: 'settings',
      entityType: 'SETTING',
      entityId: data.id ?? data.key,
      summary: `تحديث مصدر عملاء: ${data.nameAr}`,
    });
    revalidatePath('/settings');
    return undefined;
  });
}

export async function saveLossReasonAction(raw: unknown): Promise<Result> {
  return guard(async () => {
    const user = await requirePermission('settings', 'manage');
    const data = simpleListSchema.parse(raw);
    if (data.id) {
      await prisma.lossReason.update({
        where: { id: data.id },
        data: { nameAr: data.nameAr, nameEn: data.nameEn, isActive: data.isActive },
      });
    } else {
      await prisma.lossReason.create({
        data: { key: data.key.toUpperCase(), nameAr: data.nameAr, nameEn: data.nameEn },
      });
    }
    await audit({
      userId: user.id,
      action: 'UPDATE',
      module: 'settings',
      entityType: 'SETTING',
      entityId: data.id ?? data.key,
      summary: `تحديث سبب خسارة: ${data.nameAr}`,
    });
    revalidatePath('/settings');
    return undefined;
  });
}

const taxSchema = z.object({
  id: z.string().optional(),
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  rate: z.coerce.number().min(0).max(100),
  countryCode: z.string().optional().nullable(),
  isDefault: z.coerce.boolean().default(false),
  isActive: z.coerce.boolean().default(true),
});

export async function saveTaxRateAction(raw: unknown): Promise<Result> {
  return guard(async () => {
    const user = await requirePermission('settings', 'manage');
    const data = taxSchema.parse(raw);
    const payload = {
      nameAr: data.nameAr,
      nameEn: data.nameEn,
      rate: String(data.rate),
      countryCode: data.countryCode || null,
      isDefault: data.isDefault,
      isActive: data.isActive,
    };
    const before = data.id ? await prisma.taxRate.findUnique({ where: { id: data.id } }) : null;

    if (data.id) await prisma.taxRate.update({ where: { id: data.id }, data: payload });
    else await prisma.taxRate.create({ data: payload });

    await audit({
      userId: user.id,
      action: before && Number(before.rate) !== data.rate ? 'PRICE_CHANGE' : 'UPDATE',
      module: 'settings',
      entityType: 'SETTING',
      entityId: data.id ?? data.nameEn,
      summary: `تحديث نسبة ضريبة: ${data.nameAr} (${data.rate}%)`,
      oldValue: before ? { rate: Number(before.rate) } : undefined,
      newValue: { rate: data.rate },
    });
    revalidatePath('/settings');
    return undefined;
  });
}

export async function saveDepartmentAction(raw: unknown): Promise<Result> {
  return guard(async () => {
    const user = await requirePermission('settings', 'manage');
    const data = simpleListSchema.parse(raw);
    if (data.id) {
      await prisma.department.update({
        where: { id: data.id },
        data: { nameAr: data.nameAr, nameEn: data.nameEn, isActive: data.isActive },
      });
    } else {
      await prisma.department.create({
        data: { key: data.key.toUpperCase(), nameAr: data.nameAr, nameEn: data.nameEn },
      });
    }
    await audit({
      userId: user.id,
      action: 'UPDATE',
      module: 'settings',
      entityType: 'SETTING',
      entityId: data.id ?? data.key,
      summary: `تحديث قسم: ${data.nameAr}`,
    });
    revalidatePath('/settings');
    return undefined;
  });
}

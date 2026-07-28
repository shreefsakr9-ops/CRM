'use server';

import { revalidatePath } from 'next/cache';
import {
  createLead,
  updateLead,
  changeLeadStage,
  logContact,
  completeFollowUp,
  softDeleteLead,
  restoreLead,
  convertLeadToClient,
  assignLeads,
  findDuplicates,
  importLeads,
  leadSchema,
  type ImportRow,
} from '@/server/services/leads';
import { AppError } from '@/server/auth/guard';
import { ZodError } from 'zod';

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? 'بيانات غير صالحة' };
    console.error('[leads action]', e);
    return { ok: false, error: 'حدث خطأ غير متوقع' };
  }
}

export async function checkDuplicatesAction(input: {
  phone?: string;
  whatsapp?: string;
  email?: string;
  excludeId?: string;
}) {
  return guard(() => findDuplicates(input));
}

export async function createLeadAction(raw: unknown, allowDuplicate = false): Promise<Result<{ id: string }>> {
  return guard(async () => {
    const lead = await createLead(leadSchema.parse(raw), { allowDuplicate });
    revalidatePath('/leads');
    return { id: lead.id };
  });
}

export async function updateLeadAction(id: string, raw: unknown): Promise<Result> {
  return guard(async () => {
    await updateLead(id, leadSchema.parse(raw));
    revalidatePath(`/leads/${id}`);
    revalidatePath('/leads');
    return undefined;
  });
}

export async function changeStageAction(id: string, raw: unknown): Promise<Result> {
  return guard(async () => {
    await changeLeadStage(id, raw);
    revalidatePath(`/leads/${id}`);
    revalidatePath('/pipeline');
    return undefined;
  });
}

export async function logContactAction(id: string, raw: unknown): Promise<Result> {
  return guard(async () => {
    await logContact(id, raw);
    revalidatePath(`/leads/${id}`);
    return undefined;
  });
}

export async function completeFollowUpAction(followUpId: string, outcome?: string): Promise<Result> {
  return guard(async () => {
    await completeFollowUp(followUpId, outcome);
    revalidatePath('/leads');
    return undefined;
  });
}

export async function deleteLeadAction(id: string): Promise<Result> {
  return guard(async () => {
    await softDeleteLead(id);
    revalidatePath('/leads');
    return undefined;
  });
}

export async function restoreLeadAction(id: string): Promise<Result> {
  return guard(async () => {
    await restoreLead(id);
    revalidatePath('/leads');
    return undefined;
  });
}

export async function convertLeadAction(
  id: string,
  overrides: { legalName?: string; accountManagerId?: string },
): Promise<Result<{ clientId: string }>> {
  return guard(async () => {
    const client = await convertLeadToClient(id, overrides);
    revalidatePath(`/leads/${id}`);
    revalidatePath('/clients');
    return { clientId: client.id };
  });
}

export async function assignLeadsAction(ids: string[], assigneeId: string): Promise<Result<number>> {
  return guard(async () => {
    const count = await assignLeads(ids, assigneeId);
    revalidatePath('/leads');
    return count;
  });
}

export async function importLeadsAction(
  rows: ImportRow[],
  assigneeId?: string,
): Promise<Result<{ created: number; duplicates: string[]; errors: { row: number; message: string }[] }>> {
  return guard(async () => {
    const result = await importLeads(rows, assigneeId);
    revalidatePath('/leads');
    return result;
  });
}

'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import {
  createClient,
  updateClient,
  softDeleteClient,
  restoreClient,
  upsertContact,
  deleteContact,
  clientSchema,
  contactSchema,
} from '@/server/services/clients';
import { AppError } from '@/server/auth/guard';

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? 'بيانات غير صالحة' };
    console.error('[clients action]', e);
    return { ok: false, error: 'حدث خطأ غير متوقع' };
  }
}

export async function createClientAction(raw: unknown): Promise<Result<{ id: string }>> {
  return guard(async () => {
    const client = await createClient(clientSchema.parse(raw));
    revalidatePath('/clients');
    return { id: client.id };
  });
}

export async function updateClientAction(id: string, raw: unknown): Promise<Result> {
  return guard(async () => {
    await updateClient(id, clientSchema.parse(raw));
    revalidatePath(`/clients/${id}`);
    revalidatePath('/clients');
    return undefined;
  });
}

export async function deleteClientAction(id: string): Promise<Result> {
  return guard(async () => {
    await softDeleteClient(id);
    revalidatePath('/clients');
    return undefined;
  });
}

export async function restoreClientAction(id: string): Promise<Result> {
  return guard(async () => {
    await restoreClient(id);
    revalidatePath('/clients');
    return undefined;
  });
}

export async function upsertContactAction(raw: unknown, contactId?: string): Promise<Result> {
  return guard(async () => {
    const data = contactSchema.parse(raw);
    await upsertContact(data, contactId);
    revalidatePath(`/clients/${data.clientId}`);
    return undefined;
  });
}

export async function deleteContactAction(id: string, clientId: string): Promise<Result> {
  return guard(async () => {
    await deleteContact(id);
    revalidatePath(`/clients/${clientId}`);
    return undefined;
  });
}

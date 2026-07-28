'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import {
  createProject,
  updateProject,
  softDeleteProject,
  addDeliverable,
  projectSchema,
} from '@/server/services/projects';
import { AppError } from '@/server/auth/guard';

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? 'بيانات غير صالحة' };
    console.error('[projects action]', e);
    return { ok: false, error: 'حدث خطأ غير متوقع' };
  }
}

export async function createProjectAction(raw: unknown): Promise<Result<{ id: string }>> {
  return guard(async () => {
    const project = await createProject(projectSchema.parse(raw));
    revalidatePath('/projects');
    return { id: project.id };
  });
}

export async function updateProjectAction(id: string, raw: unknown): Promise<Result> {
  return guard(async () => {
    await updateProject(id, projectSchema.parse(raw));
    revalidatePath(`/projects/${id}`);
    revalidatePath('/projects');
    return undefined;
  });
}

export async function deleteProjectAction(id: string): Promise<Result> {
  return guard(async () => {
    await softDeleteProject(id);
    revalidatePath('/projects');
    return undefined;
  });
}

export async function addDeliverableAction(
  projectId: string,
  input: { name: string; dueDate?: string },
): Promise<Result> {
  return guard(async () => {
    await addDeliverable(projectId, input);
    revalidatePath(`/projects/${projectId}`);
    return undefined;
  });
}

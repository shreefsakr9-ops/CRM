'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import type { TaskStatus } from '@prisma/client';
import {
  createTask,
  updateTask,
  changeTaskStatus,
  toggleChecklistItem,
  logTime,
  addComment,
  requestRevision,
  completeRevision,
  decideApproval,
  softDeleteTask,
  taskSchema,
} from '@/server/services/tasks';
import { AppError } from '@/server/auth/guard';

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? 'بيانات غير صالحة' };
    console.error('[tasks action]', e);
    return { ok: false, error: 'حدث خطأ غير متوقع' };
  }
}

export async function createTaskAction(raw: unknown): Promise<Result<{ id: string }>> {
  return guard(async () => {
    const task = await createTask(taskSchema.parse(raw));
    revalidatePath('/tasks');
    revalidatePath('/my-tasks');
    return { id: task.id };
  });
}

export async function updateTaskAction(id: string, raw: unknown): Promise<Result> {
  return guard(async () => {
    await updateTask(id, taskSchema.parse(raw));
    revalidatePath(`/tasks/${id}`);
    return undefined;
  });
}

export async function changeTaskStatusAction(
  id: string,
  status: string,
  extra: { delayReason?: string; blockedNote?: string } = {},
): Promise<Result> {
  return guard(async () => {
    await changeTaskStatus(id, status as TaskStatus, extra);
    revalidatePath(`/tasks/${id}`);
    revalidatePath('/tasks');
    revalidatePath('/my-tasks');
    return undefined;
  });
}

export async function toggleChecklistAction(itemId: string, isDone: boolean, taskId: string): Promise<Result> {
  return guard(async () => {
    await toggleChecklistItem(itemId, isDone);
    revalidatePath(`/tasks/${taskId}`);
    return undefined;
  });
}

export async function logTimeAction(
  taskId: string,
  minutes: number,
  spentOn: string,
  note?: string,
): Promise<Result> {
  return guard(async () => {
    await logTime(taskId, minutes, spentOn, note);
    revalidatePath(`/tasks/${taskId}`);
    return undefined;
  });
}

export async function addCommentAction(
  entityType: 'TASK' | 'PROJECT' | 'CLIENT' | 'LEAD' | 'QUOTATION',
  entityId: string,
  body: string,
  mentionIds: string[],
): Promise<Result> {
  return guard(async () => {
    await addComment(entityType, entityId, body, mentionIds);
    revalidatePath(`/tasks/${entityId}`);
    return undefined;
  });
}

export async function requestRevisionAction(raw: unknown): Promise<Result> {
  return guard(async () => {
    await requestRevision(raw);
    revalidatePath('/approvals');
    return undefined;
  });
}

export async function completeRevisionAction(id: string): Promise<Result> {
  return guard(async () => {
    await completeRevision(id);
    revalidatePath('/approvals');
    return undefined;
  });
}

export async function decideApprovalAction(
  id: string,
  approve: boolean,
  comment?: string,
): Promise<Result> {
  return guard(async () => {
    await decideApproval(id, approve, comment);
    revalidatePath('/approvals');
    revalidatePath('/tasks');
    return undefined;
  });
}

export async function deleteTaskAction(id: string): Promise<Result> {
  return guard(async () => {
    await softDeleteTask(id);
    revalidatePath('/tasks');
    return undefined;
  });
}

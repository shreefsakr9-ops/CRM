'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Save } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Checkbox, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { options as labelOptions } from '@/i18n/labels';
import { createTaskAction, updateTaskAction } from './actions';

interface Options {
  users: { id: string; name: string }[];
  projects: { id: string; name: string; code: string; clientId: string }[];
  clients: { id: string; legalName: string; brandName: string | null }[];
  departments: { id: string; nameAr: string }[];
}

export interface TaskFormValues {
  id?: string;
  title?: string;
  description?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  departmentId?: string | null;
  reviewerId?: string | null;
  priority?: string;
  status?: string;
  startDate?: string | null;
  dueDate?: string | null;
  estimateMinutes?: number | null;
  requiresApproval?: boolean;
  assignees?: { user: { id: string } }[];
  checklist?: { title: string; isRequired: boolean }[];
}

export function TaskForm({
  initial,
  options,
  defaults,
}: {
  initial: TaskFormValues | null;
  options: Options;
  defaults: { projectId?: string; clientId?: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  const [assigneeIds, setAssigneeIds] = React.useState<string[]>(
    initial?.assignees?.map((a) => a.user.id) ?? [],
  );
  const [checklist, setChecklist] = React.useState<{ title: string; isRequired: boolean }[]>(
    initial?.checklist ?? [],
  );
  const [projectId, setProjectId] = React.useState(initial?.projectId ?? defaults.projectId ?? '');
  const [clientId, setClientId] = React.useState(initial?.clientId ?? defaults.clientId ?? '');
  const [requiresApproval, setRequiresApproval] = React.useState(initial?.requiresApproval ?? false);

  const onPickProject = (id: string) => {
    setProjectId(id);
    const p = options.projects.find((x) => x.id === id);
    if (p?.clientId) setClientId(p.clientId);
  };

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setPending(true);
        const payload = {
          ...Object.fromEntries(fd.entries()),
          projectId: projectId || null,
          clientId: clientId || null,
          assigneeIds,
          checklist,
          requiresApproval,
          dependsOnIds: [],
        };
        const res = initial?.id
          ? await updateTaskAction(initial.id, payload)
          : await createTaskAction(payload);
        setPending(false);
        if (!res.ok) return toast.error(res.error);
        toast.success(initial?.id ? 'تم حفظ المهمة' : 'تم إنشاء المهمة');
        const id = initial?.id ?? (res.data as { id: string } | undefined)?.id;
        router.push(id ? `/tasks/${id}` : '/tasks');
        router.refresh();
      }}
      className="grid gap-4 lg:grid-cols-3"
    >
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader title="تفاصيل المهمة" />
          <CardBody className="space-y-4">
            <Field label="عنوان المهمة" required>
              <Input name="title" defaultValue={initial?.title} required minLength={2} />
            </Field>
            <Field label="الوصف">
              <Textarea name="description" rows={4} defaultValue={initial?.description ?? ''} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="المشروع">
                <Select value={projectId} onChange={(e) => onPickProject(e.target.value)}>
                  <option value="">— بدون —</option>
                  {options.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="العميل">
                <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">— بدون —</option>
                  {options.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.brandName || c.legalName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="القسم">
                <Select name="departmentId" defaultValue={initial?.departmentId ?? ''}>
                  <option value="">— بدون —</option>
                  {options.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nameAr}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="المراجع (المعتمِد)">
                <Select name="reviewerId" defaultValue={initial?.reviewerId ?? ''}>
                  <option value="">— بدون —</option>
                  {options.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="قائمة التحقق"
            subtitle="العناصر الإلزامية تمنع إغلاق المهمة قبل إكمالها"
            action={
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setChecklist((c) => [...c, { title: '', isRequired: false }])}
              >
                <Plus className="h-3.5 w-3.5" />
                عنصر
              </Button>
            }
          />
          <CardBody className="space-y-2">
            {checklist.length === 0 && (
              <p className="text-[11px] text-ink-faint">لا توجد عناصر تحقق.</p>
            )}
            {checklist.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={item.title}
                  onChange={(e) =>
                    setChecklist((prev) =>
                      prev.map((x, xi) => (xi === i ? { ...x, title: e.target.value } : x)),
                    )
                  }
                  placeholder="عنصر التحقق"
                  required
                />
                <Checkbox
                  label="إلزامي"
                  checked={item.isRequired}
                  onChange={(e) =>
                    setChecklist((prev) =>
                      prev.map((x, xi) => (xi === i ? { ...x, isRequired: e.target.checked } : x)),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setChecklist((prev) => prev.filter((_, xi) => xi !== i))}
                >
                  <X className="h-4 w-4 text-danger" />
                </Button>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="المسؤولون" />
          <CardBody className="grid gap-2 sm:grid-cols-2">
            {options.users.map((u) => (
              <Checkbox
                key={u.id}
                label={u.name}
                checked={assigneeIds.includes(u.id)}
                onChange={(e) =>
                  setAssigneeIds((prev) =>
                    e.target.checked ? [...prev, u.id] : prev.filter((x) => x !== u.id),
                  )
                }
              />
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="الجدولة" />
          <CardBody className="space-y-4">
            <Field label="الحالة">
              <Select
                name="status"
                defaultValue={initial?.status ?? 'TODO'}
                options={labelOptions('taskStatus')}
              />
            </Field>
            <Field label="الأولوية">
              <Select
                name="priority"
                defaultValue={initial?.priority ?? 'MEDIUM'}
                options={labelOptions('priority')}
              />
            </Field>
            <Field label="تاريخ البداية">
              <Input name="startDate" type="date" dir="ltr" defaultValue={initial?.startDate?.slice(0, 10) ?? ''} />
            </Field>
            <Field label="تاريخ الاستحقاق">
              <Input name="dueDate" type="date" dir="ltr" defaultValue={initial?.dueDate?.slice(0, 10) ?? ''} />
            </Field>
            <Field label="الوقت المقدَّر (دقائق)">
              <Input
                name="estimateMinutes"
                type="number"
                min={0}
                dir="ltr"
                defaultValue={initial?.estimateMinutes ?? ''}
              />
            </Field>
            <Checkbox
              label="تتطلب اعتمادًا قبل الإغلاق"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
            />
          </CardBody>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" loading={pending} className="flex-1 justify-center">
            <Save className="h-4 w-4" />
            {initial?.id ? 'حفظ' : 'إنشاء المهمة'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            إلغاء
          </Button>
        </div>
      </div>
    </form>
  );
}

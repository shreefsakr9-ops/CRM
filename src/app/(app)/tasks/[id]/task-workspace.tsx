'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Clock,
  MessageSquare,
  Paperclip,
  Send,
  Upload,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { Avatar, Badge, Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatDuration } from '@/lib/format';
import { label } from '@/i18n/labels';
import { cn } from '@/lib/utils';
import {
  changeTaskStatusAction,
  toggleChecklistAction,
  logTimeAction,
  addCommentAction,
  requestRevisionAction,
  decideApprovalAction,
} from '../actions';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  requiresApproval: boolean;
  reviewerId: string | null;
  actualMinutes: number;
  assignees: { user: { id: string; name: string; avatarUrl: string | null } }[];
  checklist: { id: string; title: string; isDone: boolean; isRequired: boolean }[];
  comments: {
    id: string;
    body: string;
    createdAt: string;
    author: { id: string; name: string; avatarUrl: string | null };
  }[];
  files: {
    id: string;
    originalName: string;
    version: number;
    sizeBytes: number;
    createdAt: string;
    uploadedBy: { name: string };
  }[];
  timeEntries: { id: string; minutes: number; spentOn: string; note: string | null; user: { name: string } }[];
  approvals: { id: string; status: string; step: string; approverId: string }[];
}

const NEXT_STATUSES = [
  'TODO',
  'IN_PROGRESS',
  'WAITING_INTERNAL_REVIEW',
  'REVISIONS_REQUIRED',
  'WAITING_CLIENT',
  'COMPLETED',
  'ON_HOLD',
  'CANCELLED',
];

export function TaskWorkspace({
  task,
  users,
  currentUserId,
  perms,
}: {
  task: Task;
  users: { id: string; name: string }[];
  currentUserId: string;
  perms: { canEdit: boolean; canApprove: boolean; canUploadFiles: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [drawer, setDrawer] = React.useState<'status' | 'time' | 'revision' | null>(null);
  const [pending, setPending] = React.useState(false);
  const [comment, setComment] = React.useState('');
  const [mentionIds, setMentionIds] = React.useState<string[]>([]);
  const [uploading, setUploading] = React.useState(false);

  const pendingApproval = task.approvals.find(
    (a) => a.status === 'PENDING' && (a.approverId === currentUserId || perms.canApprove),
  );

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => {
    setPending(true);
    const res = await fn();
    setPending(false);
    if (!res.ok) return toast.error(res.error ?? 'حدث خطأ');
    toast.success(msg);
    setDrawer(null);
    router.refresh();
  };

  const upload = async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('entityType', 'TASK');
    fd.append('entityId', task.id);
    const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
    setUploading(false);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      return toast.error(err.error ?? 'تعذّر رفع الملف');
    }
    toast.success('تم رفع الملف كإصدار جديد');
    router.refresh();
  };

  const requiredLeft = task.checklist.filter((c) => c.isRequired && !c.isDone).length;

  return (
    <>
      {/* شريط الإجراءات */}
      <div className="flex flex-wrap gap-2">
        {perms.canEdit && (
          <>
            <Button size="sm" onClick={() => setDrawer('status')} type="button">
              تغيير الحالة
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDrawer('time')} type="button">
              <Clock className="h-3.5 w-3.5" />
              تسجيل وقت
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDrawer('revision')} type="button">
              <AlertCircle className="h-3.5 w-3.5" />
              طلب تعديل
            </Button>
          </>
        )}
        {pendingApproval && (
          <>
            <Button
              size="sm"
              variant="success"
              loading={pending}
              type="button"
              onClick={() =>
                void run(() => decideApprovalAction(pendingApproval.id, true), 'تم اعتماد العمل')
              }
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              اعتماد
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={pending}
              type="button"
              onClick={() =>
                void run(
                  () => decideApprovalAction(pendingApproval.id, false, 'مطلوب تعديلات'),
                  'تم طلب التعديل',
                )
              }
            >
              <ThumbsDown className="h-3.5 w-3.5" />
              رفض
            </Button>
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {task.description && (
            <Card>
              <CardHeader title="الوصف" />
              <CardBody>
                <p className="whitespace-pre-wrap text-xs text-ink-muted">{task.description}</p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader
              title="قائمة التحقق"
              subtitle={
                requiredLeft > 0
                  ? `${requiredLeft} عنصر إلزامي متبقٍ — لا يمكن إغلاق المهمة قبل إكمالها`
                  : 'كل العناصر الإلزامية مكتملة'
              }
            />
            <CardBody className="p-0">
              {task.checklist.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-ink-faint">لا توجد عناصر تحقق</p>
              ) : (
                <ul className="divide-y divide-line">
                  {task.checklist.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={item.isDone}
                        disabled={!perms.canEdit}
                        onChange={async (e) => {
                          const res = await toggleChecklistAction(item.id, e.target.checked, task.id);
                          if (!res.ok) toast.error(res.error);
                          router.refresh();
                        }}
                        className="h-4 w-4 accent-[rgb(var(--bp-blue))]"
                      />
                      <span
                        className={cn(
                          'flex-1 text-sm',
                          item.isDone ? 'text-ink-faint line-through' : 'text-ink',
                        )}
                      >
                        {item.title}
                      </span>
                      {item.isRequired && <Badge tone="warn">إلزامي</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="التعليقات"
              subtitle="اذكر زميلًا ليصله إشعار فوري"
              action={<MessageSquare className="h-4 w-4 text-ink-faint" />}
            />
            <CardBody className="space-y-3">
              {task.comments.length === 0 && (
                <p className="text-center text-xs text-ink-faint">لا توجد تعليقات بعد</p>
              )}
              <ul className="space-y-3">
                {task.comments.map((c) => (
                  <li key={c.id} className="flex gap-2.5">
                    <Avatar name={c.author.name} src={c.author.avatarUrl} size={28} />
                    <div className="min-w-0 flex-1 rounded-md border border-line bg-surface-sunken/50 px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium text-ink">{c.author.name}</span>
                        <span className="text-[10px] text-ink-faint">
                          {formatDate(c.createdAt, 'ar', 'Africa/Cairo', true)}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-ink-muted">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="space-y-2 border-t border-line pt-3">
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  placeholder="اكتب تعليقًا…"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    className="h-9 w-auto"
                    value=""
                    onChange={(e) => {
                      if (e.target.value && !mentionIds.includes(e.target.value)) {
                        setMentionIds((p) => [...p, e.target.value]);
                      }
                    }}
                  >
                    <option value="">إشارة إلى…</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                  {mentionIds.map((id) => (
                    <Badge key={id} tone="brand">
                      @{users.find((u) => u.id === id)?.name}
                    </Badge>
                  ))}
                  <Button
                    size="sm"
                    className="ms-auto"
                    loading={pending}
                    type="button"
                    disabled={!comment.trim()}
                    onClick={async () => {
                      setPending(true);
                      const res = await addCommentAction('TASK', task.id, comment, mentionIds);
                      setPending(false);
                      if (!res.ok) return toast.error(res.error);
                      setComment('');
                      setMentionIds([]);
                      toast.success('تم إضافة التعليق');
                      router.refresh();
                    }}
                  >
                    <Send className="h-3.5 w-3.5" />
                    إرسال
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="المرفقات"
              subtitle="كل رفع ينشئ إصدارًا جديدًا ولا يستبدل السابق"
              action={<Paperclip className="h-4 w-4 text-ink-faint" />}
            />
            <CardBody className="space-y-3">
              {perms.canUploadFiles && (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-line px-3 py-4 text-xs text-ink-muted hover:border-brand/50 hover:text-ink">
                  {uploading ? (
                    <>جارٍ الرفع…</>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      اختر ملفًا للرفع
                    </>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
              {task.files.length === 0 ? (
                <p className="text-center text-xs text-ink-faint">لا توجد مرفقات</p>
              ) : (
                <ul className="space-y-1.5">
                  {task.files.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs text-ink">{f.originalName}</p>
                        <p className="num text-[10px] text-ink-faint">
                          إصدار {f.version} · {Math.round(f.sizeBytes / 1024)} ك.ب · {f.uploadedBy.name}
                        </p>
                      </div>
                      <Badge tone="muted">v{f.version}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="سجل الوقت" />
            <CardBody className="space-y-2">
              <p className="num text-sm text-ink">إجمالي: {formatDuration(task.actualMinutes)}</p>
              {task.timeEntries.length === 0 ? (
                <p className="text-xs text-ink-faint">لا توجد تسجيلات وقت</p>
              ) : (
                <ul className="space-y-1">
                  {task.timeEntries.map((e) => (
                    <li key={e.id} className="flex items-center justify-between text-[11px]">
                      <span className="text-ink-muted">
                        {e.user.name} · {formatDate(e.spentOn)}
                      </span>
                      <span className="num text-ink">{formatDuration(e.minutes)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="المسؤولون" />
            <CardBody>
              {task.assignees.length === 0 ? (
                <p className="text-xs text-ink-faint">غير مسندة لأحد</p>
              ) : (
                <ul className="space-y-2">
                  {task.assignees.map((a) => (
                    <li key={a.user.id} className="flex items-center gap-2">
                      <Avatar name={a.user.name} src={a.user.avatarUrl} size={24} />
                      <span className="text-xs text-ink-muted">{a.user.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* تغيير الحالة */}
      <Drawer
        open={drawer === 'status'}
        onClose={() => setDrawer(null)}
        title="تغيير حالة المهمة"
        description="بعض الانتقالات محكومة بقواعد: قائمة التحقق الإلزامية والاعتماديات."
        width="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void run(
              () =>
                changeTaskStatusAction(task.id, String(fd.get('status')), {
                  delayReason: String(fd.get('delayReason') || 'NONE'),
                  blockedNote: String(fd.get('blockedNote') || ''),
                }),
              'تم تحديث الحالة',
            );
          }}
          className="space-y-4"
        >
          <Field label="الحالة الجديدة" required>
            <Select name="status" defaultValue={task.status} required>
              {NEXT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {label('taskStatus', s)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="سبب التأخير" hint="يُستخدم في تقارير التأخير للتفريق بين التأخير الداخلي وانتظار العميل">
            <Select name="delayReason" defaultValue="NONE">
              <option value="NONE">لا يوجد</option>
              <option value="INTERNAL_DELAY">تأخير داخلي</option>
              <option value="CLIENT_WAITING">انتظار العميل</option>
              <option value="APPROVED_EXTENSION">تمديد معتمد</option>
              <option value="BLOCKED">معطّل باعتمادية</option>
              <option value="OVERDUE_NO_REASON">متأخر بدون سبب</option>
            </Select>
          </Field>
          <Field label="ملاحظة">
            <Textarea name="blockedNote" rows={2} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={pending}>
              تحديث
            </Button>
          </div>
        </form>
      </Drawer>

      {/* تسجيل وقت */}
      <Drawer open={drawer === 'time'} onClose={() => setDrawer(null)} title="تسجيل وقت" width="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void run(
              () =>
                logTimeAction(
                  task.id,
                  Number(fd.get('minutes')),
                  String(fd.get('spentOn')),
                  String(fd.get('note') || ''),
                ),
              'تم تسجيل الوقت',
            );
          }}
          className="space-y-4"
        >
          <Field label="عدد الدقائق" required>
            <Input name="minutes" type="number" min={1} dir="ltr" required />
          </Field>
          <Field label="التاريخ" required>
            <Input
              name="spentOn"
              type="date"
              dir="ltr"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Field label="ملاحظة">
            <Input name="note" />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={pending}>
              <CheckCircle2 className="h-4 w-4" />
              تسجيل
            </Button>
          </div>
        </form>
      </Drawer>

      {/* طلب تعديل */}
      <Drawer
        open={drawer === 'revision'}
        onClose={() => setDrawer(null)}
        title="طلب تعديل"
        description="حدّد مصدر التعديل — التفرقة بين الداخلي وطلب العميل تظهر في تقارير الجودة."
        width="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void run(
              () =>
                requestRevisionAction({
                  entityType: 'TASK',
                  entityId: task.id,
                  source: fd.get('source'),
                  description: fd.get('description'),
                  assignedToId: fd.get('assignedToId') || null,
                  dueDate: fd.get('dueDate') || null,
                }),
              'تم تسجيل طلب التعديل',
            );
          }}
          className="space-y-4"
        >
          <Field label="مصدر التعديل" required>
            <Select name="source" defaultValue="INTERNAL" required>
              <option value="INTERNAL">داخلي</option>
              <option value="CLIENT">من العميل</option>
            </Select>
          </Field>
          <Field label="وصف التعديل المطلوب" required>
            <Textarea name="description" rows={4} required minLength={3} />
          </Field>
          <Field label="مسند إلى">
            <Select name="assignedToId">
              <option value="">— المسؤولون الحاليون —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="موعد التنفيذ">
            <Input name="dueDate" type="date" dir="ltr" />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={pending}>
              إرسال الطلب
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ThumbsUp, ThumbsDown, CheckCircle2 } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Textarea } from '@/components/ui/primitives';
import { Drawer } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/format';
import { label, tone } from '@/i18n/labels';
import { decideApprovalAction, completeRevisionAction } from '../tasks/actions';

interface Approval {
  id: string;
  entityType: string;
  entityId: string;
  step: string;
  status: string;
  createdAt: string;
  title: string;
  approver: { name: string };
}

interface Revision {
  id: string;
  entityType: string;
  entityId: string;
  source: string;
  status: string;
  description: string;
  dueDate: string | null;
  createdAt: string;
  title: string;
  requestedBy: { name: string };
  assignedTo: { name: string } | null;
}

export function ApprovalsClient({
  approvals,
  revisions,
  canApprove,
}: {
  approvals: Approval[];
  revisions: Revision[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [rejecting, setRejecting] = React.useState<Approval | null>(null);
  const [pending, setPending] = React.useState(false);

  const linkFor = (entityType: string, entityId: string) =>
    entityType === 'TASK'
      ? `/tasks/${entityId}`
      : entityType === 'PROJECT'
        ? `/projects/${entityId}`
        : entityType === 'QUOTATION'
          ? `/quotations/${entityId}`
          : '#';

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="بانتظار الاعتماد" subtitle={`${approvals.length} عنصر`} />
        <CardBody className="p-0">
          {approvals.length === 0 ? (
            <EmptyState title="لا توجد اعتمادات معلقة" description="كل شيء تمت مراجعته." />
          ) : (
            <ul className="divide-y divide-line">
              {approvals.map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={linkFor(a.entityType, a.entityId)}
                        className="truncate text-sm text-ink hover:text-brand"
                      >
                        {a.title}
                      </Link>
                      <p className="mt-0.5 text-[11px] text-ink-faint">
                        {a.step === 'INTERNAL' ? 'اعتماد داخلي' : a.step === 'CLIENT' ? 'اعتماد العميل' : 'اعتماد نهائي'}{' '}
                        · {formatDate(a.createdAt, 'ar', 'Africa/Cairo', true)}
                      </p>
                    </div>
                    {canApprove && (
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="success"
                          type="button"
                          loading={pending}
                          onClick={async () => {
                            setPending(true);
                            const res = await decideApprovalAction(a.id, true);
                            setPending(false);
                            toast[res.ok ? 'success' : 'error'](res.ok ? 'تم الاعتماد' : res.error);
                            router.refresh();
                          }}
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="danger" type="button" onClick={() => setRejecting(a)}>
                          <ThumbsDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="طلبات التعديل المفتوحة" subtitle={`${revisions.length} طلب`} />
        <CardBody className="p-0">
          {revisions.length === 0 ? (
            <EmptyState title="لا توجد طلبات تعديل" description="لا يوجد عمل مطلوب تعديله حاليًا." />
          ) : (
            <ul className="divide-y divide-line">
              {revisions.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={linkFor(r.entityType, r.entityId)}
                        className="truncate text-sm text-ink hover:text-brand"
                      >
                        {r.title}
                      </Link>
                      <p className="mt-1 text-xs text-ink-muted">{r.description}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone={tone('revisionSource', r.source)}>
                          {label('revisionSource', r.source)}
                        </Badge>
                        <Badge tone={tone('revisionStatus', r.status)}>
                          {label('revisionStatus', r.status)}
                        </Badge>
                        <span className="text-[10px] text-ink-faint">
                          {r.requestedBy.name}
                          {r.assignedTo && ` ← ${r.assignedTo.name}`}
                          {r.dueDate && ` · استحقاق ${formatDate(r.dueDate)}`}
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      type="button"
                      loading={pending}
                      onClick={async () => {
                        setPending(true);
                        const res = await completeRevisionAction(r.id);
                        setPending(false);
                        toast[res.ok ? 'success' : 'error'](res.ok ? 'تم إغلاق الطلب' : res.error);
                        router.refresh();
                      }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      تم التنفيذ
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Drawer
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title="رفض واعتماد التعديل"
        description="سيصل الرفض مع ملاحظتك للمسؤولين عن المهمة."
        width="sm"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!rejecting) return;
            const fd = new FormData(e.currentTarget);
            setPending(true);
            const res = await decideApprovalAction(rejecting.id, false, String(fd.get('comment') ?? ''));
            setPending(false);
            if (!res.ok) return toast.error(res.error);
            toast.success('تم إرجاع العمل للتعديل');
            setRejecting(null);
            router.refresh();
          }}
          className="space-y-4"
        >
          <Field label="سبب الرفض / التعديلات المطلوبة" required>
            <Textarea name="comment" rows={4} required />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant="danger" loading={pending}>
              إرجاع للتعديل
            </Button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}

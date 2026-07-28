'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GripVertical, ArrowLeftRight } from 'lucide-react';
import { Avatar, Badge, Button, Field, Select, Textarea } from '@/components/ui/primitives';
import { Drawer } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/toast';
import { formatMoney, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { moveDealAction } from './actions';

interface DealCard {
  id: string;
  title: string;
  valueMinor: number | null;
  currency: string;
  expectedCloseDate: string | null;
  owner: { id: string; name: string; avatarUrl: string | null } | null;
  clientName: string | null;
}

interface Column {
  stage: {
    id: string;
    nameAr: string;
    color: string;
    probability: number;
    isWon: boolean;
    isLost: boolean;
  };
  totalMinor: number | null;
  weightedMinor: number | null;
  deals: DealCard[];
}

export function PipelineBoard({
  board,
  lossReasons,
  owners,
  canEdit,
}: {
  board: Column[];
  lossReasons: { id: string; nameAr: string }[];
  owners: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [overStage, setOverStage] = React.useState<string | null>(null);
  const [lossPrompt, setLossPrompt] = React.useState<{ dealId: string; stageId: string } | null>(null);
  const [movePrompt, setMovePrompt] = React.useState<DealCard | null>(null);
  const [pending, setPending] = React.useState(false);

  const move = async (dealId: string, stageId: string, extra: Record<string, unknown> = {}) => {
    setPending(true);
    const res = await moveDealAction(dealId, { stageId, ...extra });
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    toast.success('تم نقل الصفقة');
    setLossPrompt(null);
    setMovePrompt(null);
    router.refresh();
  };

  const onDrop = async (stageId: string) => {
    const dealId = dragging;
    setDragging(null);
    setOverStage(null);
    if (!dealId) return;
    const target = board.find((c) => c.stage.id === stageId);
    const source = board.find((c) => c.deals.some((d) => d.id === dealId));
    if (!target || source?.stage.id === stageId) return;

    if (target.stage.isLost) {
      setLossPrompt({ dealId, stageId });
      return;
    }
    await move(dealId, stageId);
  };

  return (
    <>
      <div className="bp-table-scroll flex gap-3 pb-2">
        {board.map((col) => (
          <section
            key={col.stage.id}
            onDragOver={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              setOverStage(col.stage.id);
            }}
            onDragLeave={() => setOverStage(null)}
            onDrop={() => void onDrop(col.stage.id)}
            className={cn(
              'flex w-[268px] shrink-0 flex-col rounded-lg border bg-surface-raised transition-colors',
              overStage === col.stage.id ? 'border-brand bg-brand/5' : 'border-line',
            )}
          >
            <header className="border-b border-line px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: col.stage.color }} />
                  <h2 className="truncate text-xs font-semibold text-ink">{col.stage.nameAr}</h2>
                </div>
                <span className="num shrink-0 rounded-full bg-navy-800 px-1.5 text-[10px] text-ink-muted">
                  {col.deals.length}
                </span>
              </div>
              {col.totalMinor !== null && (
                <p className="num mt-1 text-[11px] text-ink-faint">
                  {formatMoney(col.totalMinor, 'EGP', 'ar', { compact: true })}
                  {col.weightedMinor !== null && (
                    <span className="text-ink-faint">
                      {' '}
                      · مرجّح {formatMoney(col.weightedMinor, 'EGP', 'ar', { compact: true })}
                    </span>
                  )}
                </p>
              )}
            </header>

            <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: '65vh' }}>
              {col.deals.length === 0 && (
                <p className="px-2 py-6 text-center text-[11px] text-ink-faint">لا توجد صفقات</p>
              )}
              {col.deals.map((deal) => (
                <article
                  key={deal.id}
                  draggable={canEdit}
                  onDragStart={() => setDragging(deal.id)}
                  onDragEnd={() => setDragging(null)}
                  className={cn(
                    'group rounded-md border border-line bg-surface p-2.5 transition',
                    canEdit && 'cursor-grab active:cursor-grabbing hover:border-brand/50',
                    dragging === deal.id && 'opacity-40',
                  )}
                >
                  <div className="flex items-start gap-1.5">
                    {canEdit && (
                      <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint opacity-0 transition group-hover:opacity-100" />
                    )}
                    <div className="min-w-0 flex-1">
                      <Link href={`/deals/${deal.id}`} className="block truncate text-xs font-medium text-ink hover:text-brand">
                        {deal.title}
                      </Link>
                      {deal.clientName && (
                        <p className="truncate text-[10px] text-ink-faint">{deal.clientName}</p>
                      )}
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        {deal.valueMinor !== null ? (
                          <span className="num text-[11px] font-medium text-cyan">
                            {formatMoney(deal.valueMinor, deal.currency, 'ar', { compact: true })}
                          </span>
                        ) : (
                          <span />
                        )}
                        {deal.owner && <Avatar name={deal.owner.name} src={deal.owner.avatarUrl} size={18} />}
                      </div>
                      {deal.expectedCloseDate && (
                        <p className="mt-1 text-[10px] text-ink-faint">
                          إغلاق متوقع: {formatDate(deal.expectedCloseDate)}
                        </p>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setMovePrompt(deal)}
                          className="mt-1.5 flex items-center gap-1 text-[10px] text-ink-faint hover:text-brand md:hidden"
                        >
                          <ArrowLeftRight className="h-3 w-3" />
                          نقل لمرحلة
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* نقل من الموبايل (بديل السحب والإفلات) */}
      <Drawer
        open={movePrompt !== null}
        onClose={() => setMovePrompt(null)}
        title="نقل الصفقة"
        description={movePrompt?.title}
        width="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const stageId = String(fd.get('stageId'));
            const stage = board.find((c) => c.stage.id === stageId);
            if (stage?.stage.isLost) {
              setLossPrompt({ dealId: movePrompt!.id, stageId });
              setMovePrompt(null);
              return;
            }
            void move(movePrompt!.id, stageId, { note: fd.get('note') });
          }}
          className="space-y-4"
        >
          <Field label="المرحلة الجديدة" required>
            <Select name="stageId" required>
              {board.map((c) => (
                <option key={c.stage.id} value={c.stage.id}>
                  {c.stage.nameAr}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="ملاحظة">
            <Textarea name="note" rows={2} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={pending}>
              نقل
            </Button>
          </div>
        </form>
      </Drawer>

      {/* سبب الخسارة إلزامي */}
      <Drawer
        open={lossPrompt !== null}
        onClose={() => setLossPrompt(null)}
        title="سبب الخسارة"
        description="سبب الخسارة إلزامي — يُستخدم في تقارير أسباب الخسارة لتحسين الأداء."
        width="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void move(lossPrompt!.dealId, lossPrompt!.stageId, {
              lossReasonId: fd.get('lossReasonId'),
              note: fd.get('note'),
            });
          }}
          className="space-y-4"
        >
          <Field label="السبب" required>
            <Select name="lossReasonId" required>
              <option value="">— اختر —</option>
              {lossReasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nameAr}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="تفاصيل">
            <Textarea name="note" rows={3} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setLossPrompt(null)}>
              إلغاء
            </Button>
            <Button type="submit" variant="danger" loading={pending}>
              تسجيل الخسارة
            </Button>
          </div>
        </form>
      </Drawer>

      {!canEdit && (
        <p className="text-[11px] text-ink-faint">
          لديك صلاحية عرض فقط — لا يمكنك نقل الصفقات بين المراحل.
        </p>
      )}
    </>
  );
}

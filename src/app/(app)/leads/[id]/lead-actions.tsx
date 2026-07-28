'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PhoneCall, ArrowLeftRight, UserPlus2 } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { changeStageAction, logContactAction, convertLeadAction } from '../actions';

interface Stage {
  id: string;
  nameAr: string;
  isWon: boolean;
  isLost: boolean;
  key: string;
}

export function LeadActions({
  leadId,
  currentStageId,
  stages,
  lossReasons,
  users,
  converted,
  perms,
}: {
  leadId: string;
  currentStageId: string | null;
  stages: Stage[];
  lossReasons: { id: string; nameAr: string }[];
  users: { id: string; name: string }[];
  converted: boolean;
  perms: { canEdit: boolean; canConvert: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState<'contact' | 'stage' | 'convert' | null>(null);
  const [pending, setPending] = React.useState(false);
  const [stageId, setStageId] = React.useState(currentStageId ?? stages[0]?.id ?? '');

  const selectedStage = stages.find((s) => s.id === stageId);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setPending(true);
    const res = await fn();
    setPending(false);
    if (!res.ok) return toast.error(res.error ?? 'حدث خطأ');
    toast.success(success);
    setOpen(null);
    router.refresh();
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {perms.canEdit && (
          <>
            <Button size="sm" onClick={() => setOpen('contact')} type="button">
              <PhoneCall className="h-3.5 w-3.5" />
              تسجيل تواصل
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setOpen('stage')} type="button">
              <ArrowLeftRight className="h-3.5 w-3.5" />
              نقل لمرحلة أخرى
            </Button>
          </>
        )}
        {perms.canConvert && !converted && (
          <Button size="sm" variant="outline" onClick={() => setOpen('convert')} type="button">
            <UserPlus2 className="h-3.5 w-3.5" />
            تحويل إلى عميل
          </Button>
        )}
      </div>

      {/* تسجيل تواصل */}
      <Drawer
        open={open === 'contact'}
        onClose={() => setOpen(null)}
        title="تسجيل تواصل"
        description="سيُسجَّل في السجل الزمني ويحدّث تاريخ آخر تواصل، ويضبط أول تواصل إن لم يكن مسجلًا."
        width="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void run(
              () => logContactAction(leadId, Object.fromEntries(fd.entries())),
              'تم تسجيل التواصل',
            );
          }}
          className="space-y-4"
        >
          <Field label="نوع التواصل" required>
            <Select name="type" defaultValue="CALL">
              <option value="CALL">مكالمة</option>
              <option value="WHATSAPP">واتساب</option>
              <option value="EMAIL">بريد إلكتروني</option>
              <option value="MEETING">اجتماع</option>
              <option value="NOTE">ملاحظة</option>
            </Select>
          </Field>
          <Field label="العنوان" required>
            <Input name="subject" required placeholder="مكالمة تعريفية، عرض الباقات…" />
          </Field>
          <Field label="التفاصيل">
            <Textarea name="body" rows={4} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="المدة (دقيقة)">
              <Input name="durationMin" type="number" min={0} dir="ltr" />
            </Field>
            <Field label="النتيجة">
              <Input name="outcome" placeholder="مهتم / طلب عرض…" />
            </Field>
          </div>
          <Field label="المتابعة القادمة" hint="سيتم إنشاء متابعة مجدولة تلقائيًا">
            <Input name="nextFollowUpAt" type="date" dir="ltr" />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={pending}>
              حفظ
            </Button>
          </div>
        </form>
      </Drawer>

      {/* نقل مرحلة */}
      <Drawer
        open={open === 'stage'}
        onClose={() => setOpen(null)}
        title="نقل لمرحلة أخرى"
        description="سيتم تسجيل المستخدم والتاريخ ومدة البقاء في المرحلة السابقة."
        width="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void run(
              () => changeStageAction(leadId, Object.fromEntries(fd.entries())),
              'تم نقل العميل المحتمل',
            );
          }}
          className="space-y-4"
        >
          <Field label="المرحلة الجديدة" required>
            <Select name="stageId" value={stageId} onChange={(e) => setStageId(e.target.value)} required>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nameAr}
                </option>
              ))}
            </Select>
          </Field>

          {selectedStage?.isLost && (
            <>
              <Field label="سبب الخسارة" required hint="إلزامي عند النقل إلى «خسارة»">
                <Select name="lossReasonId" required>
                  <option value="">— اختر —</option>
                  {lossReasons.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nameAr}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="تفاصيل إضافية">
                <Textarea name="lostNotes" rows={3} />
              </Field>
            </>
          )}

          {selectedStage?.key === 'QUALIFIED' && (
            <Field label="قيمة الصفقة" required hint="إلزامية عند التأهيل — وستُنشأ صفقة مرتبطة تلقائيًا">
              <Input name="dealValue" type="number" min={0} step="0.01" dir="ltr" required />
            </Field>
          )}

          {!selectedStage?.isLost && !selectedStage?.isWon && (
            <Field label="الإجراء التالي (موعد متابعة)" hint="مطلوب لاستمرار الصفقة">
              <Input name="nextFollowUpAt" type="date" dir="ltr" />
            </Field>
          )}

          <Field label="ملاحظة على النقل">
            <Textarea name="note" rows={2} />
          </Field>

          <div className="flex justify-end">
            <Button type="submit" loading={pending}>
              نقل
            </Button>
          </div>
        </form>
      </Drawer>

      {/* تحويل إلى عميل */}
      <Drawer
        open={open === 'convert'}
        onClose={() => setOpen(null)}
        title="تحويل إلى عميل"
        description="سيتم إنشاء ملف عميل بنفس البيانات مع جهة اتصال أساسية، وربط الصفقات وعروض الأسعار به. لن تُعاد كتابة أي بيانات."
        width="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void run(
              () =>
                convertLeadAction(leadId, {
                  legalName: String(fd.get('legalName') ?? '') || undefined,
                  accountManagerId: String(fd.get('accountManagerId') ?? '') || undefined,
                }),
              'تم تحويل العميل المحتمل إلى عميل',
            );
          }}
          className="space-y-4"
        >
          <Field label="الاسم القانوني للعميل" hint="اتركه فارغًا لاستخدام اسم الشركة الموجود">
            <Input name="legalName" />
          </Field>
          <Field label="مدير الحساب">
            <Select name="accountManagerId">
              <option value="">— لاحقًا —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={pending}>
              تحويل
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}

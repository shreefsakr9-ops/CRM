'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Save, Plus, Pencil, MailCheck, PlugZap, Send } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Field,
  Input,
  KeyValue,
  Select,
  Textarea,
} from '@/components/ui/primitives';
import { Drawer } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import {
  saveSettingsSectionAction,
  saveStageAction,
  saveLeadSourceAction,
  saveLossReasonAction,
  saveTaxRateAction,
  saveDepartmentAction,
  verifyMailAction,
  sendTestEmailAction,
} from './actions';

interface Settings {
  company: Record<string, string>;
  locale: { defaultLocale: string; timezone: string; baseCurrency: string };
  quotation: {
    requireInternalApproval: boolean;
    allowSelfApproval: boolean;
    defaultValidityDays: number;
    defaultTermsAr: string;
    defaultTermsEn: string;
  };
  contract: { expiringSoonDays: number; defaultReminderDays: number[] };
  finance: { includeIndirectCosts: boolean; overdueGraceDays: number; defaultPaymentTermsDays: number };
  leads: { requireNextFollowUp: boolean; uncontactedAlertHours: number; staleLeadDays: number };
  projects: { atRiskDaysBeforeEnd: number; atRiskProgressThreshold: number; clientWaitAlertDays: number };
  files: { maxSizeMb: number; retentionDays: number; allowedTypes: string[] };
  backup: { enabled: boolean; retentionDays: number; notifyEmail: string };
  security: { requireTwoFactorRoles: string[] };
}

interface Reference {
  sequences: { key: string; prefix: string; year: number; lastNumber: number; padding: number }[];
  stages: {
    id: string;
    key: string;
    nameAr: string;
    nameEn: string;
    probability: number;
    sortOrder: number;
    color: string;
    isWon: boolean;
    isLost: boolean;
    isActive: boolean;
  }[];
  sources: { id: string; key: string; nameAr: string; nameEn: string; isActive: boolean }[];
  lossReasons: { id: string; key: string; nameAr: string; nameEn: string; isActive: boolean }[];
  taxRates: {
    id: string;
    nameAr: string;
    nameEn: string;
    rate: number;
    countryCode: string | null;
    isDefault: boolean;
    isActive: boolean;
  }[];
  departments: { id: string; key: string; nameAr: string; nameEn: string; isActive: boolean }[];
  currencies: { code: string; nameAr: string; isActive: boolean }[];
  countries: { code: string; nameAr: string }[];
  roles: { key: string; nameAr: string }[];
}

interface MailStatus {
  enabled: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  authenticated?: boolean;
  from?: string;
}

const TABS = [
  ['company', 'بيانات الشركة'],
  ['workflow', 'قواعد العمل'],
  ['reference', 'البيانات المرجعية'],
  ['numbering', 'الترقيم والملفات'],
  ['mail', 'البريد الإلكتروني'],
  ['security', 'الحماية'],
] as const;

export function SettingsClient({
  settings,
  reference,
  mail,
  canEdit,
  canManage,
}: {
  settings: Settings;
  reference: Reference;
  mail: MailStatus;
  canEdit: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = React.useState<(typeof TABS)[number][0]>('company');
  const [pending, setPending] = React.useState(false);
  const [editing, setEditing] = React.useState<
    { kind: 'stage' | 'source' | 'loss' | 'tax' | 'department'; row: Record<string, unknown> | null } | null
  >(null);

  const save = async (section: keyof Settings, values: Record<string, unknown>) => {
    setPending(true);
    const res = await saveSettingsSectionAction(section, values);
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    toast.success('تم حفظ الإعدادات');
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-md border border-line p-0.5">
        {TABS.map(([key, text]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'rounded px-3 py-1.5 text-xs transition-colors',
              tab === key ? 'bg-brand/15 text-brand' : 'text-ink-muted hover:text-ink',
            )}
          >
            {text}
          </button>
        ))}
      </div>

      {tab === 'company' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void save('company', Object.fromEntries(fd.entries()));
          }}
        >
          <Card>
            <CardHeader title="بيانات الشركة" subtitle="تظهر في عروض الأسعار والفواتير المصدَّرة" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="الاسم بالعربية">
                <Input name="nameAr" defaultValue={settings.company.nameAr} disabled={!canEdit} />
              </Field>
              <Field label="الاسم بالإنجليزية">
                <Input name="nameEn" defaultValue={settings.company.nameEn} dir="ltr" disabled={!canEdit} />
              </Field>
              <Field label="الرقم الضريبي">
                <Input name="taxNumber" defaultValue={settings.company.taxNumber} dir="ltr" disabled={!canEdit} />
              </Field>
              <Field label="السجل التجاري">
                <Input name="commercialReg" defaultValue={settings.company.commercialReg} dir="ltr" disabled={!canEdit} />
              </Field>
              <Field label="العنوان بالعربية">
                <Input name="addressAr" defaultValue={settings.company.addressAr} disabled={!canEdit} />
              </Field>
              <Field label="العنوان بالإنجليزية">
                <Input name="addressEn" defaultValue={settings.company.addressEn} dir="ltr" disabled={!canEdit} />
              </Field>
              <Field label="الهاتف">
                <Input name="phone" defaultValue={settings.company.phone} dir="ltr" disabled={!canEdit} />
              </Field>
              <Field label="البريد الإلكتروني">
                <Input name="email" defaultValue={settings.company.email} dir="ltr" disabled={!canEdit} />
              </Field>
              <Field label="الموقع الإلكتروني">
                <Input name="website" defaultValue={settings.company.website} dir="ltr" disabled={!canEdit} />
              </Field>
              <Field
                label="بيانات السداد"
                hint="تظهر أسفل كل فاتورة PDF — لا تضع هنا بيانات لا يجوز للعميل رؤيتها"
                className="sm:col-span-2"
              >
                <Textarea
                  name="bankDetails"
                  rows={3}
                  defaultValue={settings.company.bankDetails}
                  disabled={!canEdit}
                />
              </Field>
            </CardBody>
          </Card>
          {canEdit && (
            <div className="mt-3 flex justify-end">
              <Button type="submit" loading={pending}>
                <Save className="h-4 w-4" />
                حفظ
              </Button>
            </div>
          )}
        </form>
      )}

      {tab === 'workflow' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionForm
            title="عروض الأسعار"
            subtitle="التحكم في الاعتماد الداخلي وصلاحية العرض"
            canEdit={canEdit}
            pending={pending}
            onSubmit={(v) => save('quotation', v)}
          >
            <Checkbox
              name="requireInternalApproval"
              label="إلزام الاعتماد الداخلي قبل إرسال العرض للعميل"
              defaultChecked={settings.quotation.requireInternalApproval}
              disabled={!canEdit}
            />
            <Checkbox
              name="allowSelfApproval"
              label="السماح لمن أعدّ العرض باعتماده بنفسه"
              defaultChecked={settings.quotation.allowSelfApproval}
              disabled={!canEdit}
            />
            <Field label="مدة صلاحية العرض الافتراضية (أيام)">
              <Input
                name="defaultValidityDays"
                type="number"
                min={1}
                dir="ltr"
                defaultValue={settings.quotation.defaultValidityDays}
                disabled={!canEdit}
              />
            </Field>
            <Field label="الشروط الافتراضية (عربي)">
              <Textarea
                name="defaultTermsAr"
                rows={4}
                defaultValue={settings.quotation.defaultTermsAr}
                disabled={!canEdit}
              />
            </Field>
            <Field label="الشروط الافتراضية (إنجليزي)">
              <Textarea
                name="defaultTermsEn"
                rows={4}
                dir="ltr"
                defaultValue={settings.quotation.defaultTermsEn}
                disabled={!canEdit}
              />
            </Field>
          </SectionForm>

          <SectionForm
            title="العملاء المحتملون"
            canEdit={canEdit}
            pending={pending}
            onSubmit={(v) => save('leads', v)}
          >
            <Checkbox
              name="requireNextFollowUp"
              label="إلزام تحديد متابعة قادمة للعملاء النشطين"
              defaultChecked={settings.leads.requireNextFollowUp}
              disabled={!canEdit}
            />
            <Field label="التنبيه على العميل غير المتواصل معه بعد (ساعات)">
              <Input
                name="uncontactedAlertHours"
                type="number"
                min={1}
                dir="ltr"
                defaultValue={settings.leads.uncontactedAlertHours}
                disabled={!canEdit}
              />
            </Field>
            <Field label="اعتبار العميل راكدًا بعد (أيام)">
              <Input
                name="staleLeadDays"
                type="number"
                min={1}
                dir="ltr"
                defaultValue={settings.leads.staleLeadDays}
                disabled={!canEdit}
              />
            </Field>
          </SectionForm>

          <SectionForm
            title="المشاريع"
            subtitle="قواعد اعتبار المشروع معرضًا للخطر"
            canEdit={canEdit}
            pending={pending}
            onSubmit={(v) => save('projects', v)}
          >
            <Field label="التنبيه قبل موعد التسليم بـ (أيام)">
              <Input
                name="atRiskDaysBeforeEnd"
                type="number"
                min={1}
                dir="ltr"
                defaultValue={settings.projects.atRiskDaysBeforeEnd}
                disabled={!canEdit}
              />
            </Field>
            <Field label="حد التقدم المقبول عند اقتراب الموعد (%)">
              <Input
                name="atRiskProgressThreshold"
                type="number"
                min={0}
                max={100}
                dir="ltr"
                defaultValue={settings.projects.atRiskProgressThreshold}
                disabled={!canEdit}
              />
            </Field>
            <Field label="التنبيه على انتظار العميل بعد (أيام)">
              <Input
                name="clientWaitAlertDays"
                type="number"
                min={1}
                dir="ltr"
                defaultValue={settings.projects.clientWaitAlertDays}
                disabled={!canEdit}
              />
            </Field>
          </SectionForm>

          <SectionForm
            title="المالية"
            canEdit={canEdit}
            pending={pending}
            onSubmit={(v) => save('finance', v)}
          >
            <Checkbox
              name="includeIndirectCosts"
              label="احتساب التكاليف غير المباشرة في ربحية المشاريع"
              defaultChecked={settings.finance.includeIndirectCosts}
              disabled={!canEdit}
            />
            <Field label="مهلة السماح قبل اعتبار الفاتورة متأخرة (أيام)">
              <Input
                name="overdueGraceDays"
                type="number"
                min={0}
                dir="ltr"
                defaultValue={settings.finance.overdueGraceDays}
                disabled={!canEdit}
              />
            </Field>
            <Field label="مدة السداد الافتراضية (أيام)">
              <Input
                name="defaultPaymentTermsDays"
                type="number"
                min={0}
                dir="ltr"
                defaultValue={settings.finance.defaultPaymentTermsDays}
                disabled={!canEdit}
              />
            </Field>
          </SectionForm>

          <SectionForm
            title="العقود"
            canEdit={canEdit}
            pending={pending}
            onSubmit={(v) => save('contract', v)}
          >
            <Field label="اعتبار العقد قاربًا على الانتهاء قبل (أيام)">
              <Input
                name="expiringSoonDays"
                type="number"
                min={1}
                dir="ltr"
                defaultValue={settings.contract.expiringSoonDays}
                disabled={!canEdit}
              />
            </Field>
            <p className="text-[11px] text-ink-faint">
              تنبيهات التجديد الافتراضية: {settings.contract.defaultReminderDays.join('، ')} يوم — قابلة
              للتخصيص لكل عقد على حدة.
            </p>
          </SectionForm>

          <SectionForm
            title="النسخ الاحتياطي"
            canEdit={canEdit}
            pending={pending}
            onSubmit={(v) => save('backup', v)}
          >
            <Checkbox
              name="enabled"
              label="تفعيل النسخ الاحتياطي اليومي"
              defaultChecked={settings.backup.enabled}
              disabled={!canEdit}
            />
            <Field label="مدة الاحتفاظ بالنسخ (أيام)">
              <Input
                name="retentionDays"
                type="number"
                min={1}
                dir="ltr"
                defaultValue={settings.backup.retentionDays}
                disabled={!canEdit}
              />
            </Field>
            <Field label="بريد التنبيه عند فشل النسخ">
              <Input
                name="notifyEmail"
                type="email"
                dir="ltr"
                defaultValue={settings.backup.notifyEmail}
                disabled={!canEdit}
              />
            </Field>
          </SectionForm>
        </div>
      )}

      {tab === 'reference' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <RefCard
            title="مراحل مسار المبيعات"
            subtitle="الترتيب واحتمالية الإغلاق يؤثران في التوقع المرجّح"
            canManage={canManage}
            onAdd={() => setEditing({ kind: 'stage', row: null })}
            rows={reference.stages.map((s) => ({
              id: s.id,
              primary: s.nameAr,
              secondary: `${s.key} · احتمالية ${s.probability}%`,
              badge: s.isWon ? 'فوز' : s.isLost ? 'خسارة' : undefined,
              active: s.isActive,
              raw: s as unknown as Record<string, unknown>,
              kind: 'stage' as const,
            }))}
            onEdit={(row) => setEditing({ kind: 'stage', row })}
          />
          <RefCard
            title="مصادر العملاء"
            canManage={canManage}
            onAdd={() => setEditing({ kind: 'source', row: null })}
            rows={reference.sources.map((s) => ({
              id: s.id,
              primary: s.nameAr,
              secondary: s.key,
              active: s.isActive,
              raw: s as unknown as Record<string, unknown>,
              kind: 'source' as const,
            }))}
            onEdit={(row) => setEditing({ kind: 'source', row })}
          />
          <RefCard
            title="أسباب الخسارة"
            canManage={canManage}
            onAdd={() => setEditing({ kind: 'loss', row: null })}
            rows={reference.lossReasons.map((s) => ({
              id: s.id,
              primary: s.nameAr,
              secondary: s.key,
              active: s.isActive,
              raw: s as unknown as Record<string, unknown>,
              kind: 'loss' as const,
            }))}
            onEdit={(row) => setEditing({ kind: 'loss', row })}
          />
          <RefCard
            title="نسب الضرائب"
            subtitle="لا توجد نسبة ضريبة ثابتة داخل الكود — كلها من هنا"
            canManage={canManage}
            onAdd={() => setEditing({ kind: 'tax', row: null })}
            rows={reference.taxRates.map((t) => ({
              id: t.id,
              primary: `${t.nameAr} — ${t.rate}%`,
              secondary: t.countryCode ?? 'كل الدول',
              badge: t.isDefault ? 'افتراضية' : undefined,
              active: t.isActive,
              raw: t as unknown as Record<string, unknown>,
              kind: 'tax' as const,
            }))}
            onEdit={(row) => setEditing({ kind: 'tax', row })}
          />
          <RefCard
            title="الأقسام"
            canManage={canManage}
            onAdd={() => setEditing({ kind: 'department', row: null })}
            rows={reference.departments.map((d) => ({
              id: d.id,
              primary: d.nameAr,
              secondary: d.key,
              active: d.isActive,
              raw: d as unknown as Record<string, unknown>,
              kind: 'department' as const,
            }))}
            onEdit={(row) => setEditing({ kind: 'department', row })}
          />
          <Card>
            <CardHeader title="العملات والدول" subtitle="تُدار من قاعدة البيانات المرجعية" />
            <CardBody className="space-y-3">
              <div>
                <p className="mb-1.5 text-[11px] text-ink-faint">العملات المفعّلة</p>
                <div className="flex flex-wrap gap-1.5">
                  {reference.currencies.map((c) => (
                    <Badge key={c.code} tone={c.isActive ? 'brand' : 'muted'}>
                      {c.nameAr} ({c.code})
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] text-ink-faint">الدول</p>
                <div className="flex flex-wrap gap-1.5">
                  {reference.countries.map((c) => (
                    <Badge key={c.code} tone="neutral">
                      {c.nameAr}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'numbering' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="تسلسل الترقيم" subtitle="يُعاد ضبط العداد تلقائيًا مع بداية كل سنة" />
            <CardBody className="p-0">
              <ul className="divide-y divide-line">
                {reference.sequences.map((s) => (
                  <li key={s.key} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-sm text-ink">{s.key}</p>
                      <p className="num text-[11px] text-ink-faint">
                        {s.prefix}-{s.year}-{String(s.lastNumber + 1).padStart(s.padding, '0')} (التالي)
                      </p>
                    </div>
                    <Badge tone="neutral">
                      <span className="num">{s.lastNumber} مُصدر</span>
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <SectionForm
            title="الملفات والمرفقات"
            canEdit={canEdit}
            pending={pending}
            onSubmit={(v) => save('files', v)}
          >
            <Field label="الحد الأقصى لحجم الملف (ميجابايت)">
              <Input
                name="maxSizeMb"
                type="number"
                min={1}
                max={200}
                dir="ltr"
                defaultValue={settings.files.maxSizeMb}
                disabled={!canEdit}
              />
            </Field>
            <Field label="مدة الاحتفاظ بالملفات (أيام)">
              <Input
                name="retentionDays"
                type="number"
                min={30}
                dir="ltr"
                defaultValue={settings.files.retentionDays}
                disabled={!canEdit}
              />
            </Field>
            <div>
              <p className="bp-label">الأنواع المسموحة</p>
              <div className="flex flex-wrap gap-1">
                {settings.files.allowedTypes.map((t) => (
                  <Badge key={t} tone="muted">
                    {t.split('/')[1] ?? t}
                  </Badge>
                ))}
              </div>
            </div>
          </SectionForm>
        </div>
      )}

      {tab === 'mail' && <MailPanel mail={mail} canManage={canManage} />}

      {tab === 'security' && (
        <SecurityPanel
          value={settings.security.requireTwoFactorRoles}
          roles={reference.roles}
          canEdit={canEdit}
          pending={pending}
          onSave={(roles) => save('security', { requireTwoFactorRoles: roles })}
        />
      )}

      <ReferenceDrawer
        editing={editing}
        countries={reference.countries}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function SectionForm({
  title,
  subtitle,
  children,
  onSubmit,
  canEdit,
  pending,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onSubmit: (values: Record<string, unknown>) => void;
  canEdit: boolean;
  pending: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const values: Record<string, unknown> = Object.fromEntries(fd.entries());
        // خانات الاختيار غير المحددة لا تُرسل في FormData — نضبطها صراحة.
        form.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name]').forEach((el) => {
          values[el.name] = el.checked;
        });
        onSubmit(values);
      }}
    >
      <Card>
        <CardHeader title={title} subtitle={subtitle} />
        <CardBody className="space-y-4">{children}</CardBody>
      </Card>
      {canEdit && (
        <div className="mt-3 flex justify-end">
          <Button type="submit" size="sm" loading={pending}>
            <Save className="h-3.5 w-3.5" />
            حفظ
          </Button>
        </div>
      )}
    </form>
  );
}

/**
 * إعدادات SMTP تُقرأ من متغيرات البيئة فقط ولا تُحفظ في قاعدة البيانات،
 * لذلك هذه الشاشة للعرض والاختبار — لا للتعديل. تغيير الخادم يتم من ملف .env
 * ثم إعادة تشغيل التطبيق والـWorker.
 */
function MailPanel({ mail, canManage }: { mail: MailStatus; canManage: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = React.useState<'verify' | 'test' | null>(null);

  const run = async (kind: 'verify' | 'test') => {
    setBusy(kind);
    const res = await (kind === 'verify' ? verifyMailAction() : sendTestEmailAction());
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    toast.success(res.data?.detail ?? 'تم');
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="خادم البريد (SMTP)"
          subtitle="يُقرأ من متغيرات البيئة — لا تُخزَّن أي بيانات اعتماد داخل النظام"
          action={
            mail.enabled ? (
              <Badge tone="ok" dot>
                مضبوط
              </Badge>
            ) : (
              <Badge tone="warn" dot>
                غير مضبوط
              </Badge>
            )
          }
        />
        <CardBody>
          {mail.enabled ? (
            <>
              <dl className="grid gap-x-4 sm:grid-cols-2">
                <KeyValue label="الخادم">
                  <span dir="ltr" className="num">
                    {mail.host}:{mail.port}
                  </span>
                </KeyValue>
                <KeyValue label="التشفير">
                  {mail.secure ? 'TLS ضمني (المنفذ 465)' : 'STARTTLS مطلوب'}
                </KeyValue>
                <KeyValue label="المصادقة">
                  {mail.authenticated ? 'باسم مستخدم وكلمة مرور' : 'بدون مصادقة'}
                </KeyValue>
                <KeyValue label="المُرسِل">
                  <span dir="ltr">{mail.from}</span>
                </KeyValue>
              </dl>
              {canManage && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                  <Button
                    size="sm"
                    variant="secondary"
                    type="button"
                    loading={busy === 'verify'}
                    disabled={busy !== null}
                    onClick={() => void run('verify')}
                  >
                    <PlugZap className="h-3.5 w-3.5" />
                    اختبار الاتصال
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    loading={busy === 'test'}
                    disabled={busy !== null}
                    onClick={() => void run('test')}
                  >
                    <Send className="h-3.5 w-3.5" />
                    إرسال رسالة تجريبية لي
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3 text-sm leading-7 text-ink-muted">
              <p>
                النظام يعمل بالكامل بدون بريد: الإشعارات داخل النظام والمهام والتنبيهات كلها تعمل
                كالمعتاد. ما يتوقف فقط هو الإرسال الخارجي:
              </p>
              <ul className="list-inside list-disc space-y-1 text-[13px]">
                <li>رسالة إعادة تعيين كلمة المرور (يظل بإمكان مدير النظام إعادة التعيين يدويًا)</li>
                <li>البريد الفوري لمن فعّله في تفضيلات الإشعارات</li>
                <li>الملخص اليومي والأسبوعي</li>
              </ul>
              <p className="text-[13px]">
                للتفعيل: اضبط <code className="num text-ink">SMTP_HOST</code> وبقية متغيرات{' '}
                <code className="num text-ink">SMTP_*</code> في ملف <code className="num text-ink">.env</code>{' '}
                ثم أعد تشغيل التطبيق والـWorker.
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="الرسائل التي يرسلها النظام" subtitle="لا توجد رسائل تسويقية — داخلية فقط" />
        <CardBody className="p-0">
          <ul className="divide-y divide-line">
            {[
              ['إعادة تعيين كلمة المرور', 'رابط صالح لمدة ساعة ويُستخدم مرة واحدة', 'فوري'],
              ['إشعار فوري', 'لمن فعّل البريد في تفضيلات الإشعارات بدون ملخص دوري', 'فوري'],
              ['الملخص اليومي', 'تجميع إشعارات اليوم لمن اختار "يومي"', '٠٨:٠٠ بتوقيت القاهرة'],
              ['الملخص الأسبوعي', 'تجميع إشعارات الأسبوع لمن اختار "أسبوعي"', 'الأحد ٠٨:٠٠'],
            ].map(([title, desc, when]) => (
              <li key={title} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm text-ink">
                    <MailCheck className="h-3.5 w-3.5 text-ink-faint" />
                    {title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-faint">{desc}</p>
                </div>
                <Badge tone="muted">{when}</Badge>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

interface RefRow {
  id: string;
  primary: string;
  secondary: string;
  badge?: string;
  active: boolean;
  raw: Record<string, unknown>;
  kind: string;
}

function RefCard({
  title,
  subtitle,
  rows,
  canManage,
  onAdd,
  onEdit,
}: {
  title: string;
  subtitle?: string;
  rows: RefRow[];
  canManage: boolean;
  onAdd: () => void;
  onEdit: (row: Record<string, unknown>) => void;
}) {
  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle}
        action={
          canManage && (
            <Button size="sm" variant="secondary" type="button" onClick={onAdd}>
              <Plus className="h-3.5 w-3.5" />
              إضافة
            </Button>
          )
        }
      />
      <CardBody className="p-0">
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
              <div className="min-w-0">
                <p className={cn('truncate text-sm', r.active ? 'text-ink' : 'text-ink-faint line-through')}>
                  {r.primary}
                </p>
                <p className="truncate text-[11px] text-ink-faint">{r.secondary}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {r.badge && <Badge tone="brand">{r.badge}</Badge>}
                {canManage && (
                  <Button variant="ghost" size="sm" type="button" onClick={() => onEdit(r.raw)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function ReferenceDrawer({
  editing,
  countries,
  onClose,
  onSaved,
}: {
  editing: { kind: string; row: Record<string, unknown> | null } | null;
  countries: { code: string; nameAr: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  if (!editing) return null;

  const row = editing.row;
  const titles: Record<string, string> = {
    stage: 'مرحلة مسار المبيعات',
    source: 'مصدر عملاء',
    loss: 'سبب خسارة',
    tax: 'نسبة ضريبة',
    department: 'قسم',
  };

  const submit = async (values: Record<string, unknown>) => {
    setPending(true);
    const action =
      editing.kind === 'stage'
        ? saveStageAction
        : editing.kind === 'source'
          ? saveLeadSourceAction
          : editing.kind === 'loss'
            ? saveLossReasonAction
            : editing.kind === 'tax'
              ? saveTaxRateAction
              : saveDepartmentAction;
    const res = await action(values);
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    toast.success('تم الحفظ');
    onSaved();
  };

  return (
    <Drawer open onClose={onClose} title={`${row ? 'تعديل' : 'إضافة'} ${titles[editing.kind]}`} width="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          const values: Record<string, unknown> = Object.fromEntries(fd.entries());
          form.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name]').forEach((el) => {
            values[el.name] = el.checked;
          });
          if (row?.id) values.id = row.id;
          void submit(values);
        }}
        className="space-y-4"
      >
        {!row && (
          <Field label="الكود" required hint="حروف إنجليزية كبيرة بدون مسافات">
            <Input name="key" required dir="ltr" minLength={2} />
          </Field>
        )}
        <Field label="الاسم بالعربية" required>
          <Input name="nameAr" defaultValue={(row?.nameAr as string) ?? ''} required />
        </Field>
        <Field label="الاسم بالإنجليزية" required>
          <Input name="nameEn" defaultValue={(row?.nameEn as string) ?? ''} dir="ltr" required />
        </Field>

        {editing.kind === 'stage' && (
          <>
            <Field label="احتمالية الإغلاق %" required>
              <Input
                name="probability"
                type="number"
                min={0}
                max={100}
                dir="ltr"
                defaultValue={(row?.probability as number) ?? 0}
                required
              />
            </Field>
            <Field label="الترتيب" required>
              <Input
                name="sortOrder"
                type="number"
                min={0}
                dir="ltr"
                defaultValue={(row?.sortOrder as number) ?? 0}
                required
              />
            </Field>
            <Field label="اللون">
              <Input name="color" type="color" defaultValue={(row?.color as string) ?? '#2C7BE5'} />
            </Field>
            {!row && (
              <div className="flex gap-4">
                <Checkbox name="isWon" label="مرحلة فوز" />
                <Checkbox name="isLost" label="مرحلة خسارة" />
              </div>
            )}
          </>
        )}

        {editing.kind === 'tax' && (
          <>
            <Field label="النسبة %" required>
              <Input
                name="rate"
                type="number"
                min={0}
                max={100}
                step="0.01"
                dir="ltr"
                defaultValue={(row?.rate as number) ?? 0}
                required
              />
            </Field>
            <Field label="الدولة">
              <Select name="countryCode" defaultValue={(row?.countryCode as string) ?? ''}>
                <option value="">كل الدول</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.nameAr}
                  </option>
                ))}
              </Select>
            </Field>
            <Checkbox name="isDefault" label="افتراضية" defaultChecked={(row?.isDefault as boolean) ?? false} />
          </>
        )}

        <Checkbox name="isActive" label="مفعّل" defaultChecked={(row?.isActive as boolean) ?? true} />

        <div className="flex justify-end">
          <Button type="submit" loading={pending}>
            حفظ
          </Button>
        </div>
      </form>
    </Drawer>
  );
}

/**
 * سياسة المصادقة الثنائية.
 * الإلزام يُفرض عند دخول التطبيق: صاحب الدور المُلزَم يُوجَّه إلى شاشة التفعيل
 * ولا يصل إلى أي بيانات قبلها.
 */
function SecurityPanel({
  value,
  roles,
  canEdit,
  pending,
  onSave,
}: {
  value: string[];
  roles: { key: string; nameAr: string }[];
  canEdit: boolean;
  pending: boolean;
  onSave: (roles: string[]) => void;
}) {
  const [selected, setSelected] = React.useState<string[]>(value);

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  return (
    <Card>
      <CardHeader
        title="إلزام المصادقة الثنائية"
        subtitle="الأدوار المحددة هنا لا تصل إلى النظام قبل تفعيل التحقق بخطوتين"
      />
      <CardBody className="space-y-4">
        <p className="text-xs leading-6 text-ink-muted">
          الإلزام يبدأ فورًا: من يملك أحد هذه الأدوار ولم يفعّلها سيُوجَّه إلى شاشة التفعيل عند
          دخوله القادم. لن يفقد أحد حسابه — التفعيل يتم بتطبيق مصادقة على هاتفه، ومن يفقد جهازه
          يعيد المسؤول تعيينه من صفحة المستخدمين.
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {roles.map((role) => (
            <label
              key={role.key}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                selected.includes(role.key)
                  ? 'border-brand/40 bg-brand/10 text-ink'
                  : 'border-line text-ink-muted hover:border-line-strong',
                !canEdit && 'pointer-events-none opacity-60',
              )}
            >
              <Checkbox
                checked={selected.includes(role.key)}
                onChange={() => toggle(role.key)}
                disabled={!canEdit}
              />
              <span className="min-w-0 truncate">{role.nameAr}</span>
            </label>
          ))}
        </div>
        {canEdit && (
          <div className="flex justify-end border-t border-line pt-4">
            <Button type="button" loading={pending} onClick={() => onSave(selected)}>
              <Save className="h-4 w-4" />
              حفظ سياسة الحماية
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

'use client';

import * as React from 'react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { FiltersBar } from '@/components/filters-bar';
import { Badge, Button } from '@/components/ui/primitives';
import { Drawer } from '@/components/ui/drawer';
import { formatDate } from '@/lib/format';
import { MODULES, MODULE_LABELS } from '@/server/auth/permissions';
import type { Tone } from '@/i18n/labels';

interface Row {
  id: string;
  action: string;
  module: string;
  entityType: string;
  entityId: string;
  summary: string | null;
  oldValue: unknown;
  newValue: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { id: string; name: string } | null;
}

const ACTION_LABELS: Record<string, { ar: string; tone: Tone }> = {
  CREATE: { ar: 'إنشاء', tone: 'ok' },
  UPDATE: { ar: 'تعديل', tone: 'info' },
  DELETE: { ar: 'حذف', tone: 'danger' },
  RESTORE: { ar: 'استرجاع', tone: 'warn' },
  PURGE: { ar: 'حذف نهائي', tone: 'danger' },
  LOGIN: { ar: 'دخول', tone: 'muted' },
  LOGIN_FAILED: { ar: 'دخول فاشل', tone: 'danger' },
  LOGOUT: { ar: 'خروج', tone: 'muted' },
  EXPORT: { ar: 'تصدير', tone: 'warn' },
  IMPORT: { ar: 'استيراد', tone: 'info' },
  APPROVE: { ar: 'اعتماد', tone: 'ok' },
  REJECT: { ar: 'رفض', tone: 'danger' },
  ASSIGN: { ar: 'إسناد', tone: 'info' },
  STATUS_CHANGE: { ar: 'تغيير حالة', tone: 'brand' },
  PRICE_CHANGE: { ar: 'تغيير سعر', tone: 'warn' },
  PERMISSION_CHANGE: { ar: 'تغيير صلاحية', tone: 'danger' },
  FILE_ACCESS: { ar: 'وصول لملف', tone: 'muted' },
  PASSWORD_RESET: { ar: 'كلمة المرور', tone: 'warn' },
};

export function AuditClient({
  rows,
  total,
  page,
  pageSize,
  users,
  canExport,
}: {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  users: { id: string; name: string }[];
  canExport: boolean;
}) {
  const [detail, setDetail] = React.useState<Row | null>(null);

  const columns: Column<Row>[] = [
    {
      key: 'createdAt',
      header: 'التوقيت',
      primary: true,
      exportValue: (r) => r.createdAt,
      render: (r) => (
        <span className="num text-xs text-ink-muted">{formatDate(r.createdAt, 'ar', 'Africa/Cairo', true)}</span>
      ),
    },
    {
      key: 'user',
      header: 'المستخدم',
      exportValue: (r) => r.user?.name ?? 'النظام',
      render: (r) => <span className="text-xs text-ink">{r.user?.name ?? 'النظام'}</span>,
    },
    {
      key: 'action',
      header: 'الإجراء',
      exportValue: (r) => ACTION_LABELS[r.action]?.ar ?? r.action,
      render: (r) => (
        <Badge tone={ACTION_LABELS[r.action]?.tone ?? 'neutral'}>
          {ACTION_LABELS[r.action]?.ar ?? r.action}
        </Badge>
      ),
    },
    {
      key: 'module',
      header: 'الوحدة',
      exportValue: (r) => r.module,
      render: (r) => (
        <span className="text-xs text-ink-muted">
          {MODULE_LABELS[r.module as keyof typeof MODULE_LABELS]?.ar ?? r.module}
        </span>
      ),
    },
    {
      key: 'summary',
      header: 'التفاصيل',
      exportValue: (r) => r.summary ?? '',
      render: (r) => <span className="text-xs text-ink-muted">{r.summary ?? '—'}</span>,
    },
    {
      key: 'ip',
      header: 'IP',
      defaultHidden: true,
      exportValue: (r) => r.ip ?? '',
      render: (r) => (
        <span className="num text-[11px] text-ink-faint" dir="ltr">
          {r.ip ?? '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'end',
      render: (r) =>
        r.oldValue || r.newValue ? (
          <Button variant="ghost" size="sm" type="button" onClick={() => setDetail(r)}>
            التغييرات
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <FiltersBar
        searchPlaceholder="ابحث في الوصف أو معرّف السجل…"
        filters={[
          {
            key: 'module',
            label: 'الوحدة',
            options: MODULES.map((m) => ({ value: m, label: MODULE_LABELS[m].ar })),
          },
          {
            key: 'action',
            label: 'الإجراء',
            options: Object.entries(ACTION_LABELS).map(([value, v]) => ({ value, label: v.ar })),
          },
          { key: 'userId', label: 'المستخدم', options: users.map((u) => ({ value: u.id, label: u.name })) },
        ]}
      />

      <DataTable
        rows={rows}
        columns={columns}
        getKey={(r) => r.id}
        total={total}
        page={page}
        pageSize={pageSize}
        storageKey="audit"
        exportName="audit-log"
        canExport={canExport}
        emptyTitle="لا توجد سجلات"
        emptyDescription="سيظهر هنا كل إجراء يتم في النظام."
      />

      <Drawer
        open={detail !== null}
        onClose={() => setDetail(null)}
        title="تفاصيل التغيير"
        description={detail?.summary ?? undefined}
      >
        {detail && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Info label="الكيان" value={`${detail.entityType} · ${detail.entityId}`} />
              <Info label="المستخدم" value={detail.user?.name ?? 'النظام'} />
              <Info label="IP" value={detail.ip ?? '—'} />
              <Info label="التوقيت" value={formatDate(detail.createdAt, 'ar', 'Africa/Cairo', true)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="bp-label">القيمة القديمة</p>
                <pre className="max-h-72 overflow-auto rounded-md border border-line bg-surface-sunken p-3 text-[11px] text-ink-muted" dir="ltr">
                  {JSON.stringify(detail.oldValue ?? null, null, 2)}
                </pre>
              </div>
              <div>
                <p className="bp-label">القيمة الجديدة</p>
                <pre className="max-h-72 overflow-auto rounded-md border border-line bg-surface-sunken p-3 text-[11px] text-ink-muted" dir="ltr">
                  {JSON.stringify(detail.newValue ?? null, null, 2)}
                </pre>
              </div>
            </div>
            {detail.userAgent && (
              <div>
                <p className="bp-label">المتصفح</p>
                <p className="text-[11px] text-ink-faint" dir="ltr">
                  {detail.userAgent}
                </p>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-ink-faint">{label}</p>
      <p className="text-xs text-ink" dir="auto">
        {value}
      </p>
    </div>
  );
}

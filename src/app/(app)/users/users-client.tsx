'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, KeyRound, Ban, Pencil, Copy } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Drawer, ConfirmDialog } from '@/components/ui/drawer';
import { Avatar, Badge, Button, Checkbox, Field, Input, Select } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatMoney } from '@/lib/format';
import {
  createUserAction,
  updateUserAction,
  deactivateUserAction,
  forceResetAction,
} from './actions';

interface Row {
  id: string;
  name: string;
  nameEn: string | null;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  roleId: string;
  departmentId: string | null;
  managerId: string | null;
  locale: string;
  timezone: string;
  salesTargetMinor: number;
  isActive: boolean;
  mustResetPassword: boolean;
  lastLoginAt: string | null;
  avatarUrl: string | null;
  role: { key: string; nameAr: string };
  department: { nameAr: string } | null;
  manager: { name: string } | null;
}

export function UsersClient({
  users,
  roles,
  departments,
  canManage,
  currentUserId,
}: {
  users: Row[];
  roles: { id: string; key: string; nameAr: string }[];
  departments: { id: string; nameAr: string }[];
  canManage: boolean;
  currentUserId: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = React.useState<Row | 'new' | null>(null);
  const [confirmOff, setConfirmOff] = React.useState<Row | null>(null);
  const [pending, setPending] = React.useState(false);

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'المستخدم',
      primary: true,
      exportValue: (r) => r.name,
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r.name} src={r.avatarUrl} size={30} />
          <div className="min-w-0">
            <p className="truncate text-sm text-ink">{r.name}</p>
            <p className="truncate text-[11px] text-ink-faint" dir="ltr">
              {r.email}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'الدور',
      exportValue: (r) => r.role.nameAr,
      render: (r) => <Badge tone="brand">{r.role.nameAr}</Badge>,
    },
    {
      key: 'department',
      header: 'القسم',
      exportValue: (r) => r.department?.nameAr ?? '',
      render: (r) => <span className="text-xs text-ink-muted">{r.department?.nameAr ?? '—'}</span>,
    },
    {
      key: 'manager',
      header: 'المدير المباشر',
      exportValue: (r) => r.manager?.name ?? '',
      render: (r) => <span className="text-xs text-ink-muted">{r.manager?.name ?? '—'}</span>,
      defaultHidden: true,
    },
    {
      key: 'target',
      header: 'تارجت المبيعات',
      align: 'end',
      exportValue: (r) => r.salesTargetMinor / 100,
      render: (r) =>
        r.salesTargetMinor > 0 ? (
          <span className="num text-xs">{formatMoney(r.salesTargetMinor)}</span>
        ) : (
          '—'
        ),
      defaultHidden: true,
    },
    {
      key: 'lastLogin',
      header: 'آخر دخول',
      exportValue: (r) => r.lastLoginAt ?? '',
      render: (r) => (
        <span className="text-xs text-ink-muted">{r.lastLoginAt ? formatDate(r.lastLoginAt, 'ar', 'Africa/Cairo', true) : 'لم يسجل بعد'}</span>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      exportValue: (r) => (r.isActive ? 'نشط' : 'معطّل'),
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={r.isActive ? 'ok' : 'danger'} dot>
            {r.isActive ? 'نشط' : 'معطّل'}
          </Badge>
          {r.mustResetPassword && <Badge tone="warn">تغيير كلمة المرور</Badge>}
        </div>
      ),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: 'إجراءات',
            align: 'end' as const,
            render: (r: Row) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditing(r)} type="button">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    const res = await forceResetAction(r.id);
                    if (res.ok && res.data)
                      toast.success('تم إنشاء كلمة مرور مؤقتة', res.data.temporaryPassword);
                    else if (!res.ok) toast.error(res.error);
                    router.refresh();
                  }}
                  type="button"
                  title="إعادة تعيين كلمة المرور"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                </Button>
                {r.isActive && r.id !== currentUserId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmOff(r)}
                    type="button"
                    title="تعطيل الحساب"
                  >
                    <Ban className="h-3.5 w-3.5 text-danger" />
                  </Button>
                )}
              </div>
            ),
          } satisfies Column<Row>,
        ]
      : []),
  ];

  return (
    <>
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setEditing('new')} type="button">
            <UserPlus className="h-4 w-4" />
            مستخدم جديد
          </Button>
        </div>
      )}

      <DataTable
        rows={users}
        columns={columns}
        getKey={(r) => r.id}
        storageKey="users"
        exportName="users"
        canExport
        emptyTitle="لا يوجد مستخدمون"
        emptyDescription="ابدأ بإضافة أعضاء الفريق وتحديد أدوارهم."
      />

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'مستخدم جديد' : 'تعديل المستخدم'}
        description="الصلاحيات تُحدَّد من الدور — يمكن تعديل مصفوفة الأدوار من الإعدادات."
      >
        {editing !== null && (
          <UserForm
            key={editing === 'new' ? 'new' : editing.id}
            initial={editing === 'new' ? null : editing}
            roles={roles}
            departments={departments}
            users={users}
            pending={pending}
            onSubmit={async (values) => {
              setPending(true);
              const res =
                editing === 'new'
                  ? await createUserAction(values)
                  : await updateUserAction(editing.id, values);
              setPending(false);
              if (!res.ok) return toast.error(res.error);
              if (editing === 'new' && res.data) {
                toast.success('تم إنشاء المستخدم', `كلمة مرور مؤقتة: ${res.data.temporaryPassword}`);
              } else {
                toast.success('تم حفظ التعديلات');
              }
              setEditing(null);
              router.refresh();
            }}
          />
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmOff !== null}
        onClose={() => setConfirmOff(null)}
        title="تعطيل الحساب"
        message={`سيتم منع «${confirmOff?.name}» من الدخول وإنهاء جميع جلساته النشطة فورًا. يمكن إعادة التفعيل لاحقًا.`}
        confirmLabel="تعطيل"
        onConfirm={async () => {
          if (!confirmOff) return;
          const res = await deactivateUserAction(confirmOff.id);
          if (res.ok) toast.success('تم تعطيل الحساب');
          else toast.error(res.error);
          setConfirmOff(null);
          router.refresh();
        }}
      />
    </>
  );
}

function UserForm({
  initial,
  roles,
  departments,
  users,
  onSubmit,
  pending,
}: {
  initial: Row | null;
  roles: { id: string; nameAr: string }[];
  departments: { id: string; nameAr: string }[];
  users: Row[];
  onSubmit: (values: Record<string, unknown>) => void;
  pending: boolean;
}) {
  const [isActive, setIsActive] = React.useState(initial?.isActive ?? true);

  return (
    <form
      id="user-form"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        onSubmit({
          name: fd.get('name'),
          nameEn: fd.get('nameEn'),
          email: fd.get('email'),
          phone: fd.get('phone'),
          jobTitle: fd.get('jobTitle'),
          roleId: fd.get('roleId'),
          departmentId: fd.get('departmentId') || null,
          managerId: fd.get('managerId') || null,
          locale: fd.get('locale'),
          timezone: fd.get('timezone'),
          salesTarget: Number(fd.get('salesTarget') || 0),
          isActive,
        });
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الاسم بالعربية" required>
          <Input name="name" defaultValue={initial?.name} required minLength={3} />
        </Field>
        <Field label="الاسم بالإنجليزية">
          <Input name="nameEn" defaultValue={initial?.nameEn ?? ''} dir="ltr" />
        </Field>
        <Field label="البريد الإلكتروني" required>
          <Input name="email" type="email" defaultValue={initial?.email} dir="ltr" required />
        </Field>
        <Field label="رقم الهاتف">
          <Input name="phone" defaultValue={initial?.phone ?? ''} dir="ltr" />
        </Field>
        <Field label="المسمى الوظيفي">
          <Input name="jobTitle" defaultValue={initial?.jobTitle ?? ''} />
        </Field>
        <Field label="الدور" required>
          <Select name="roleId" defaultValue={initial?.roleId} required>
            <option value="">— اختر الدور —</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nameAr}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="القسم">
          <Select name="departmentId" defaultValue={initial?.departmentId ?? ''}>
            <option value="">— بدون —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nameAr}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="المدير المباشر" hint="يُستخدم لتحديد نطاق «فريقي» في الصلاحيات">
          <Select name="managerId" defaultValue={initial?.managerId ?? ''}>
            <option value="">— بدون —</option>
            {users
              .filter((u) => u.id !== initial?.id)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="اللغة">
          <Select name="locale" defaultValue={initial?.locale ?? 'ar'}>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </Select>
        </Field>
        <Field label="المنطقة الزمنية">
          <Select name="timezone" defaultValue={initial?.timezone ?? 'Africa/Cairo'}>
            <option value="Africa/Cairo">القاهرة (Africa/Cairo)</option>
            <option value="Asia/Riyadh">الرياض (Asia/Riyadh)</option>
            <option value="Asia/Dubai">دبي (Asia/Dubai)</option>
            <option value="UTC">UTC</option>
          </Select>
        </Field>
        <Field label="تارجت المبيعات الشهري" hint="بالجنيه المصري — يُستخدم في تقارير تحقيق التارجت">
          <Input
            name="salesTarget"
            type="number"
            min={0}
            step="0.01"
            dir="ltr"
            defaultValue={initial ? initial.salesTargetMinor / 100 : 0}
          />
        </Field>
      </div>

      <Checkbox
        label="الحساب نشط (يستطيع تسجيل الدخول)"
        checked={isActive}
        onChange={(e) => setIsActive(e.target.checked)}
      />

      {!initial && (
        <p className="rounded-md border border-info/25 bg-info/10 px-3 py-2 text-[11px] text-info">
          سيتم توليد كلمة مرور مؤقتة قوية وعرضها مرة واحدة بعد الحفظ، وسيُطلب من المستخدم تغييرها عند أول
          دخول.
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" loading={pending}>
          حفظ
        </Button>
      </div>
    </form>
  );
}

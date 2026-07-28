'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Save, ShieldAlert } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, Select } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { MODULES, ACTIONS, MODULE_LABELS, ACTION_LABELS } from '@/server/auth/permissions';
import { cn } from '@/lib/utils';
import { updateRolePermissionsAction } from '@/app/(app)/users/actions';

interface Role {
  id: string;
  key: string;
  nameAr: string;
  permissions: { module: string; action: string; scope: string }[];
  _count: { users: number };
}

type Grants = Map<string, string>; // `${module}.${action}` → scope

export function RolesMatrix({ roles }: { roles: Role[] }) {
  const router = useRouter();
  const toast = useToast();
  const [selectedId, setSelectedId] = React.useState(roles[0]?.id ?? '');
  const [pending, setPending] = React.useState(false);

  const role = roles.find((r) => r.id === selectedId);
  const isSuperAdmin = role?.key === 'SUPER_ADMIN';

  const [grants, setGrants] = React.useState<Grants>(new Map());

  React.useEffect(() => {
    const next: Grants = new Map();
    for (const p of role?.permissions ?? []) next.set(`${p.module}.${p.action}`, p.scope);
    setGrants(next);
  }, [role]);

  const toggle = (module: string, action: string) => {
    setGrants((prev) => {
      const next = new Map(prev);
      const key = `${module}.${action}`;
      if (next.has(key)) next.delete(key);
      else next.set(key, 'OWN');
      return next;
    });
  };

  const setScope = (module: string, action: string, scope: string) => {
    setGrants((prev) => new Map(prev).set(`${module}.${action}`, scope));
  };

  const save = async () => {
    if (!role) return;
    setPending(true);
    const res = await updateRolePermissionsAction({
      roleId: role.id,
      grants: Array.from(grants, ([key, scope]) => {
        const [module, action] = key.split('.');
        return { module, action, scope };
      }),
    });
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    toast.success('تم حفظ الصلاحيات', 'تم إنهاء جلسات أصحاب هذا الدور ليُطبَّق التغيير فورًا');
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem]">
          <label className="bp-label">الدور</label>
          <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nameAr} ({r._count.users} مستخدم)
              </option>
            ))}
          </Select>
        </div>
        {!isSuperAdmin && (
          <Button onClick={save} loading={pending} type="button">
            <Save className="h-4 w-4" />
            حفظ الصلاحيات
          </Button>
        )}
      </div>

      {isSuperAdmin && (
        <div className="flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/10 px-4 py-3 text-xs text-warn">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          دور المدير الأعلى يملك كل الصلاحيات ولا يمكن تعديله — هذا يمنع فقدان الوصول للنظام نهائيًا.
        </div>
      )}

      <Card>
        <CardHeader
          title={`صلاحيات: ${role?.nameAr ?? ''}`}
          subtitle="حدّد الإجراء ثم اختر نطاق البيانات: سجلاته فقط، فريقه، أو الكل"
        />
        <CardBody className="p-0">
          <div className="bp-table-scroll">
            <table className="w-full min-w-[1000px] text-xs">
              <thead>
                <tr className="border-b border-line bg-surface-sunken/60">
                  <th className="sticky start-0 z-10 bg-surface-sunken px-3 py-2 text-start text-[11px] text-ink-faint">
                    الوحدة
                  </th>
                  {ACTIONS.map((a) => (
                    <th key={a} className="px-2 py-2 text-center text-[10px] text-ink-faint">
                      {ACTION_LABELS[a].ar}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODULES.map((m) => (
                  <tr key={m} className="border-b border-line/60 last:border-0">
                    <td className="sticky start-0 z-10 bg-surface-raised px-3 py-2 text-ink">
                      {MODULE_LABELS[m].ar}
                    </td>
                    {ACTIONS.map((a) => {
                      const key = `${m}.${a}`;
                      const granted = grants.has(key);
                      const scoped = ['view', 'create', 'edit', 'delete', 'assign', 'approve', 'export'].includes(a);
                      return (
                        <td key={a} className="px-1.5 py-1.5 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <input
                              type="checkbox"
                              checked={granted}
                              disabled={isSuperAdmin}
                              onChange={() => toggle(m, a)}
                              aria-label={`${MODULE_LABELS[m].ar} — ${ACTION_LABELS[a].ar}`}
                              className="h-3.5 w-3.5 accent-[rgb(var(--bp-blue))]"
                            />
                            {granted && scoped && (
                              <select
                                value={grants.get(key)}
                                disabled={isSuperAdmin}
                                onChange={(e) => setScope(m, a, e.target.value)}
                                className={cn(
                                  'rounded border border-line bg-surface-sunken px-1 py-0.5 text-[9px] text-ink-muted',
                                )}
                              >
                                <option value="OWN">خاصته</option>
                                <option value="TEAM">فريقه</option>
                                <option value="ALL">الكل</option>
                              </select>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <div className="flex flex-wrap gap-2 text-[11px] text-ink-faint">
        <Badge tone="neutral">خاصته = السجلات التي أنشأها أو المسندة إليه</Badge>
        <Badge tone="neutral">فريقه = سجلاته + سجلات من يتبعونه إداريًا</Badge>
        <Badge tone="neutral">الكل = كل السجلات غير المحذوفة</Badge>
      </div>
    </div>
  );
}

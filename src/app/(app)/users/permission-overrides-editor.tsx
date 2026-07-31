'use client';

import * as React from 'react';
import { Save, Check, X, Minus } from 'lucide-react';
import { Badge, Button, Card, CardBody } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { MODULES, ACTIONS, MODULE_LABELS, ACTION_LABELS } from '@/server/auth/permissions';
import { cn } from '@/lib/utils';
import { getUserPermissionOverridesAction, updateUserPermissionOverridesAction } from './actions';

interface Cell {
  allow: boolean;
  scope: string;
}

type Cells = Map<string, Cell>; // `${module}.${action}` → override (غياب المفتاح = بدون تخصيص، يتبع الدور)

const SCOPED_ACTIONS = ['view', 'create', 'edit', 'delete', 'assign', 'approve', 'export'];

export function PermissionOverridesEditor({
  userId,
  userName,
  onSaved,
}: {
  userId: string;
  userName: string;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = React.useState(true);
  const [pending, setPending] = React.useState(false);
  const [cells, setCells] = React.useState<Cells>(new Map());

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getUserPermissionOverridesAction(userId).then((res) => {
      if (cancelled) return;
      if (res.ok && res.data) {
        const next: Cells = new Map();
        for (const o of res.data) next.set(`${o.module}.${o.action}`, { allow: o.allow, scope: o.scope });
        setCells(next);
      } else if (!res.ok) {
        toast.error(res.error);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // كل ضغطة تنقل الخلية: بدون تخصيص ← منح إضافي ← منع صريح ← بدون تخصيص.
  const cycle = (module: string, action: string) => {
    setCells((prev) => {
      const next = new Map(prev);
      const key = `${module}.${action}`;
      const cur = next.get(key);
      if (!cur) next.set(key, { allow: true, scope: 'OWN' });
      else if (cur.allow) next.set(key, { allow: false, scope: cur.scope });
      else next.delete(key);
      return next;
    });
  };

  const setScope = (module: string, action: string, scope: string) => {
    setCells((prev) => {
      const next = new Map(prev);
      const key = `${module}.${action}`;
      const cur = next.get(key);
      if (cur) next.set(key, { ...cur, scope });
      return next;
    });
  };

  const save = async () => {
    setPending(true);
    const overrides = Array.from(cells, ([key, v]) => {
      const [module, action] = key.split('.');
      return { module, action, scope: v.scope, allow: v.allow };
    });
    const res = await updateUserPermissionOverridesAction({ userId, overrides });
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    toast.success('تم حفظ الصلاحيات الإضافية', 'تم إنهاء جلسات المستخدم ليُطبَّق التغيير فورًا');
    onSaved();
  };

  if (loading) {
    return <p className="py-6 text-center text-xs text-ink-faint">جارِ التحميل…</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-faint">
        صلاحيات إضافية مستقلة عن دور «{userName}» — تُطبَّق فوق صلاحيات الدور: منح ما لا يمنحه الدور، أو
        منع صريح لما يمنحه الدور له تحديدًا. اضغط الخلية للتنقل بين الحالات الثلاث.
      </p>

      <div className="flex justify-end">
        <Button onClick={save} loading={pending} type="button">
          <Save className="h-4 w-4" />
          حفظ الصلاحيات الإضافية
        </Button>
      </div>

      <Card>
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
                      const cell = cells.get(key);
                      const state = !cell ? 'inherit' : cell.allow ? 'allow' : 'deny';
                      const scoped = SCOPED_ACTIONS.includes(a);
                      return (
                        <td key={a} className="px-1.5 py-1.5 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <button
                              type="button"
                              onClick={() => cycle(m, a)}
                              aria-label={`${MODULE_LABELS[m].ar} — ${ACTION_LABELS[a].ar}`}
                              className={cn(
                                'flex h-5 w-5 items-center justify-center rounded border',
                                state === 'inherit' && 'border-line text-ink-faint',
                                state === 'allow' && 'border-ok/40 bg-ok/15 text-ok',
                                state === 'deny' && 'border-danger/40 bg-danger/15 text-danger',
                              )}
                            >
                              {state === 'allow' && <Check className="h-3 w-3" />}
                              {state === 'deny' && <X className="h-3 w-3" />}
                              {state === 'inherit' && <Minus className="h-3 w-3" />}
                            </button>
                            {cell && cell.allow && scoped && (
                              <select
                                value={cell.scope}
                                onChange={(e) => setScope(m, a, e.target.value)}
                                className="rounded border border-line bg-surface-sunken px-1 py-0.5 text-[9px] text-ink-muted"
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
        <Badge tone="neutral">— بدون تخصيص = يتبع صلاحية الدور</Badge>
        <Badge tone="ok">✓ منح إضافي = فوق صلاحية الدور</Badge>
        <Badge tone="danger">✕ منع صريح = حتى لو يمنحها الدور</Badge>
      </div>
    </div>
  );
}

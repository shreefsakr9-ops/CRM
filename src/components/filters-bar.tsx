'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { Button, Select } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

export interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

/**
 * شريط فلاتر موحّد يعمل عبر الـ URL (قابل للمشاركة والحفظ كـ Saved View).
 */
export function FiltersBar({
  filters,
  searchPlaceholder = 'بحث…',
  quickFilters,
  className,
  children,
}: {
  filters: FilterDef[];
  searchPlaceholder?: string;
  quickFilters?: { key: string; value: string; label: string }[];
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = React.useState(params.get('q') ?? '');
  const [expanded, setExpanded] = React.useState(false);

  const update = React.useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      next.delete('page');
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.get('q') ?? '') !== q) update({ q: q || null });
    }, 350);
    return () => clearTimeout(timer);
  }, [q, params, update]);

  const activeCount = filters.filter((f) => params.get(f.key)).length + (params.get('filter') ? 1 : 0);

  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-ink-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            className="bp-input ps-9"
            aria-label="بحث"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              className="absolute inset-y-0 end-2 my-auto text-ink-faint hover:text-ink"
              aria-label="مسح البحث"
              type="button"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Button
          variant="secondary"
          size="md"
          onClick={() => setExpanded((s) => !s)}
          type="button"
          className="sm:hidden"
        >
          <SlidersHorizontal className="h-4 w-4" />
          فلاتر {activeCount > 0 && `(${activeCount})`}
        </Button>

        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          {filters.map((f) => (
            <Select
              // `defaultValue` لا `value` عمدًا: القائمة المتحكَّم بها تجعل
              // الخادم يكتب `selected` على الخيار المطابق بينما لا يكتبه
              // العميل، فيعتبره React عدم تطابق ترطيب ويعيد بناء الشجرة —
              // خطأ ظهر فعلًا في console. الـ`key` يعيد التركيب عند تغيّر
              // الرابط فتبقى القيمة المعروضة مطابقة للفلتر الفعلي.
              key={`${f.key}:${params.get(f.key) ?? ''}`}
              defaultValue={params.get(f.key) ?? ''}
              onChange={(e) => update({ [f.key]: e.target.value })}
              className="h-10 w-auto min-w-[9rem]"
              aria-label={f.label}
            >
              <option value="">{f.label}: الكل</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          ))}
          {activeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const next = new URLSearchParams();
                if (q) next.set('q', q);
                router.push(`${pathname}?${next.toString()}`, { scroll: false });
              }}
              type="button"
            >
              مسح الفلاتر
            </Button>
          )}
        </div>

        <div className="ms-auto flex items-center gap-2">{children}</div>
      </div>

      {expanded && (
        <div className="grid grid-cols-2 gap-2 sm:hidden">
          {filters.map((f) => (
            <Select
              // `defaultValue` لا `value` عمدًا: القائمة المتحكَّم بها تجعل
              // الخادم يكتب `selected` على الخيار المطابق بينما لا يكتبه
              // العميل، فيعتبره React عدم تطابق ترطيب ويعيد بناء الشجرة —
              // خطأ ظهر فعلًا في console. الـ`key` يعيد التركيب عند تغيّر
              // الرابط فتبقى القيمة المعروضة مطابقة للفلتر الفعلي.
              key={`${f.key}:${params.get(f.key) ?? ''}`}
              defaultValue={params.get(f.key) ?? ''}
              onChange={(e) => update({ [f.key]: e.target.value })}
              aria-label={f.label}
            >
              <option value="">{f.label}: الكل</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          ))}
        </div>
      )}

      {quickFilters && quickFilters.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {quickFilters.map((qf) => {
            const active = params.get(qf.key) === qf.value;
            return (
              <button
                key={`${qf.key}-${qf.value}`}
                onClick={() => update({ [qf.key]: active ? null : qf.value })}
                className={cn(
                  'rounded-full border px-3 py-1 text-[11px] transition-colors',
                  active
                    ? 'border-brand bg-brand/15 text-brand'
                    : 'border-line text-ink-muted hover:border-brand/40 hover:text-ink',
                )}
                type="button"
              >
                {qf.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

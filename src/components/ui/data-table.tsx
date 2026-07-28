'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Download, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, EmptyState } from './primitives';

export interface Column<T> {
  key: string;
  header: string;
  /** يظهر في عرض البطاقات على الموبايل كعنوان رئيسي */
  primary?: boolean;
  sortable?: boolean;
  align?: 'start' | 'center' | 'end';
  width?: string;
  render: (row: T) => React.ReactNode;
  /** القيمة النصية المستخدمة في التصدير */
  exportValue?: (row: T) => string | number;
  /** إخفاء افتراضي (يمكن للمستخدم إظهاره) */
  defaultHidden?: boolean;
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  getKey: (row: T) => string;
  rowHref?: (row: T) => string;
  total?: number;
  page?: number;
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  storageKey?: string;
  exportName?: string;
  canExport?: boolean;
  onExport?: () => void;
  bulkActions?: (selected: string[], clear: () => void) => React.ReactNode;
  className?: string;
}

export function DataTable<T>({
  rows,
  columns,
  getKey,
  rowHref,
  total,
  page = 1,
  pageSize = 25,
  emptyTitle = 'لا توجد نتائج',
  emptyDescription = 'جرّب تعديل الفلاتر أو ابدأ بإضافة سجل جديد.',
  emptyAction,
  storageKey,
  exportName = 'export',
  canExport,
  onExport,
  bulkActions,
  className,
}: DataTableProps<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [hidden, setHidden] = React.useState<string[]>(() =>
    columns.filter((c) => c.defaultHidden).map((c) => c.key),
  );
  const [showColumns, setShowColumns] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);

  // تفضيلات الأعمدة تُحفظ لكل مستخدم في المتصفح (تفضيل عرض فقط — ليست بيانات عمل)
  React.useEffect(() => {
    if (!storageKey) return;
    const saved = window.localStorage.getItem(`bp.cols.${storageKey}`);
    if (saved) setHidden(JSON.parse(saved) as string[]);
  }, [storageKey]);

  const toggleColumn = (key: string) => {
    setHidden((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      if (storageKey) window.localStorage.setItem(`bp.cols.${storageKey}`, JSON.stringify(next));
      return next;
    });
  };

  const visible = columns.filter((c) => !hidden.includes(c.key));
  const sortKey = params.get('sort');
  const sortDir = params.get('dir') === 'asc' ? 'asc' : 'desc';

  const setParam = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const onSort = (key: string) => {
    if (sortKey === key) setParam({ sort: key, dir: sortDir === 'asc' ? 'desc' : 'asc', page: null });
    else setParam({ sort: key, dir: 'desc', page: null });
  };

  const exportCsv = () => {
    if (onExport) return onExport();
    const cols = visible;
    const header = cols.map((c) => c.header);
    const lines = rows.map((r) =>
      cols.map((c) => {
        const v = c.exportValue ? c.exportValue(r) : '';
        const s = String(v ?? '').replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
      }),
    );
    const csv = '﻿' + [header, ...lines].map((l) => l.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportName}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalCount = total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const allSelected = rows.length > 0 && selected.length === rows.length;

  return (
    <div className={cn('bp-card overflow-hidden', className)}>
      {(bulkActions || canExport || columns.length > 4) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            {selected.length > 0 ? (
              <>
                <span className="num">{selected.length} محدد</span>
                {bulkActions?.(selected, () => setSelected([]))}
              </>
            ) : (
              <span className="num">
                {totalCount.toLocaleString('en-US')} سجل
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {canExport && (
              <Button variant="ghost" size="sm" onClick={exportCsv} type="button">
                <Download className="h-3.5 w-3.5" />
                تصدير
              </Button>
            )}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowColumns((s) => !s)}
                type="button"
                aria-expanded={showColumns}
              >
                <Columns3 className="h-3.5 w-3.5" />
                الأعمدة
              </Button>
              {showColumns && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowColumns(false)} />
                  <div className="absolute end-0 z-20 mt-1 w-56 rounded-lg border border-line bg-surface-raised p-1.5 shadow-pop">
                    {columns.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => toggleColumn(c.key)}
                        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-xs text-ink hover:bg-navy-800"
                      >
                        {c.header}
                        {!hidden.includes(c.key) && <Check className="h-3.5 w-3.5 text-brand" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      ) : (
        <>
          {/* الجدول — شاشات متوسطة فأكبر */}
          <div className="bp-table-scroll hidden md:block">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-sunken/60">
                  {bulkActions && (
                    <th className="w-10 px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label="تحديد الكل"
                        className="h-3.5 w-3.5 accent-[rgb(var(--bp-blue))]"
                        checked={allSelected}
                        onChange={(e) => setSelected(e.target.checked ? rows.map(getKey) : [])}
                      />
                    </th>
                  )}
                  {visible.map((c) => (
                    <th
                      key={c.key}
                      style={{ width: c.width }}
                      className={cn(
                        'px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint',
                        c.align === 'end' ? 'text-end' : c.align === 'center' ? 'text-center' : 'text-start',
                      )}
                    >
                      {c.sortable ? (
                        <button
                          onClick={() => onSort(c.key)}
                          className={cn(
                            'inline-flex items-center gap-1 hover:text-ink',
                            sortKey === c.key && 'text-brand',
                          )}
                          type="button"
                        >
                          {c.header}
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      ) : (
                        c.header
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const key = getKey(row);
                  const href = rowHref?.(row);
                  return (
                    <tr
                      key={key}
                      className="border-b border-line/60 transition-colors last:border-0 hover:bg-navy-800/40"
                    >
                      {bulkActions && (
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            aria-label="تحديد"
                            className="h-3.5 w-3.5 accent-[rgb(var(--bp-blue))]"
                            checked={selected.includes(key)}
                            onChange={(e) =>
                              setSelected((prev) =>
                                e.target.checked ? [...prev, key] : prev.filter((k) => k !== key),
                              )
                            }
                          />
                        </td>
                      )}
                      {visible.map((c, i) => (
                        <td
                          key={c.key}
                          className={cn(
                            'px-3 py-2.5 align-middle text-ink',
                            c.align === 'end' ? 'text-end' : c.align === 'center' ? 'text-center' : 'text-start',
                          )}
                        >
                          {href && i === 0 ? (
                            <Link href={href} className="block font-medium hover:text-brand">
                              {c.render(row)}
                            </Link>
                          ) : (
                            c.render(row)
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* بطاقات — الموبايل: كل الحقول تظل ظاهرة ولا يختفي أي عمود */}
          <div className="divide-y divide-line md:hidden">
            {rows.map((row) => {
              const key = getKey(row);
              const href = rowHref?.(row);
              const primary = visible.find((c) => c.primary) ?? visible[0];
              const rest = visible.filter((c) => c.key !== primary?.key);
              const content = (
                <div className="px-4 py-3">
                  <div className="mb-2 text-sm font-medium text-ink">{primary?.render(row)}</div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {rest.map((c) => (
                      <div key={c.key} className="min-w-0">
                        <dt className="text-[10px] uppercase tracking-wide text-ink-faint">{c.header}</dt>
                        <dd className="truncate text-xs text-ink-muted">{c.render(row)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
              return href ? (
                <Link key={key} href={href} className="block active:bg-navy-800/60">
                  {content}
                </Link>
              ) : (
                <div key={key}>{content}</div>
              );
            })}
          </div>
        </>
      )}

      {totalCount > pageSize && (
        <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2.5">
          <span className="num text-xs text-ink-faint">
            صفحة {page} من {totalPages}
          </span>
          <div className="flex gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setParam({ page: String(page - 1) })}
              type="button"
            >
              <ChevronRight className="h-3.5 w-3.5 flip-rtl" />
              السابق
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setParam({ page: String(page + 1) })}
              type="button"
            >
              التالي
              <ChevronLeft className="h-3.5 w-3.5 flip-rtl" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

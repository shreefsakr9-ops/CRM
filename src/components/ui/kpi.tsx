import Link from 'next/link';
import * as Icons from 'lucide-react';
import { cn } from '@/lib/utils';

export function KpiCard({
  label,
  value,
  sublabel,
  icon,
  tone = 'brand',
  href,
  delta,
  deltaLabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon?: string;
  tone?: 'brand' | 'ok' | 'warn' | 'danger' | 'info' | 'neutral';
  href?: string;
  /** نسبة التغير مقارنة بالفترة السابقة (موجب/سالب) */
  delta?: number | null;
  deltaLabel?: string;
}) {
  const Icon = icon
    ? ((Icons as unknown as Record<string, React.ElementType>)[icon] ?? Icons.Circle)
    : null;

  const toneClass = {
    brand: 'text-brand bg-brand/10',
    ok: 'text-ok bg-ok/10',
    warn: 'text-warn bg-warn/10',
    danger: 'text-danger bg-danger/10',
    info: 'text-info bg-info/10',
    neutral: 'text-ink-muted bg-navy-800',
  }[tone];

  const body = (
    <div className="bp-card h-full p-4 transition-colors hover:border-brand/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] text-ink-faint">{label}</p>
          <p className="num mt-1.5 text-xl font-bold tracking-tight text-ink">{value}</p>
          {sublabel && <p className="mt-1 truncate text-[11px] text-ink-muted">{sublabel}</p>}
        </div>
        {Icon && (
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', toneClass)}>
            <Icon className="h-4.5 w-4.5" />
          </span>
        )}
      </div>
      {delta !== undefined && delta !== null && (
        <div className="mt-2.5 flex items-center gap-1 text-[11px]">
          <span
            className={cn(
              'num inline-flex items-center gap-0.5 font-medium',
              delta > 0 ? 'text-ok' : delta < 0 ? 'text-danger' : 'text-ink-faint',
            )}
          >
            {delta > 0 ? '▲' : delta < 0 ? '▼' : '•'} {Math.abs(delta).toFixed(1)}%
          </span>
          {deltaLabel && <span className="text-ink-faint">{deltaLabel}</span>}
        </div>
      )}
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function KpiGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>{children}</div>
  );
}

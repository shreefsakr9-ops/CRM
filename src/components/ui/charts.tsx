'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * رسوم SVG خفيفة بلا مكتبات خارجية — تُستخدم فقط عندما تضيف وضوحًا حقيقيًا.
 * كلها تعمل في RTL وتحترم متغيرات الألوان.
 */

const PALETTE = [
  'rgb(var(--bp-blue))',
  'rgb(var(--bp-cyan))',
  'rgb(var(--bp-ok))',
  'rgb(var(--bp-warn))',
  'rgb(var(--bp-danger))',
  'rgb(var(--bp-info))',
  '#A855F7',
  '#F97316',
];

export interface Point {
  label: string;
  value: number;
}

export function BarChart({
  data,
  height = 180,
  formatValue = (v: number) => v.toLocaleString('en-US'),
  className,
  horizontal,
}: {
  data: Point[];
  height?: number;
  formatValue?: (v: number) => string;
  className?: string;
  horizontal?: boolean;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) {
    return <EmptyChart className={className} />;
  }

  if (horizontal) {
    return (
      <div className={cn('space-y-2.5', className)}>
        {data.map((d, i) => (
          <div key={d.label} className="group">
            <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate text-ink-muted">{d.label}</span>
              <span className="num shrink-0 text-ink">{formatValue(d.value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-navy-800">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(d.value / max) * 100}%`,
                  background: PALETTE[i % PALETTE.length],
                }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => (
          <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="num text-[10px] text-ink-muted">{formatValue(d.value)}</span>
            <div
              className="w-full rounded-t transition-all"
              style={{
                height: `${Math.max(2, (d.value / max) * (height - 34))}px`,
                background: `linear-gradient(180deg, ${PALETTE[i % PALETTE.length]}, ${PALETTE[i % PALETTE.length]}55)`,
              }}
              title={`${d.label}: ${formatValue(d.value)}`}
            />
            <span className="w-full truncate text-center text-[10px] text-ink-faint">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LineChart({
  data,
  height = 160,
  formatValue = (v: number) => v.toLocaleString('en-US'),
  className,
}: {
  data: Point[];
  height?: number;
  formatValue?: (v: number) => string;
  className?: string;
}) {
  if (data.length < 2) return <EmptyChart className={className} />;
  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value), 0);
  const range = max - min || 1;
  const w = 100;
  const h = 100;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d.value - min) / range) * h;
    return { x, y, d };
  });
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${path} L${w},${h} L0,${h} Z`;

  return (
    <div className={cn('w-full', className)}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height }} className="w-full">
        <defs>
          <linearGradient id="bp-line-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--bp-blue))" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(var(--bp-blue))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#bp-line-fill)" />
        <path
          d={path}
          fill="none"
          stroke="rgb(var(--bp-cyan))"
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-ink-faint">
        <span>{data[0]?.label}</span>
        <span className="num text-ink-muted">{formatValue(data[data.length - 1]?.value ?? 0)}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

export function DonutChart({
  data,
  size = 150,
  className,
  centerLabel,
  centerValue,
}: {
  data: Point[];
  size?: number;
  className?: string;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <EmptyChart className={className} />;

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className={cn('flex flex-wrap items-center gap-5', className)}>
      <svg width={size} height={size} viewBox="0 0 100 100" className="shrink-0 -rotate-90">
        {data.map((d, i) => {
          const fraction = d.value / total;
          const dash = fraction * circumference;
          const el = (
            <circle
              key={d.label}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth="12"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      {(centerValue || centerLabel) && (
        <div className="pointer-events-none absolute" style={{ width: 0 }} />
      )}
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2 text-[11px]">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: PALETTE[i % PALETTE.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-ink-muted">{d.label}</span>
            <span className="num text-ink">{d.value.toLocaleString('en-US')}</span>
            <span className="num w-10 text-end text-ink-faint">
              {Math.round((d.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyChart({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex h-32 items-center justify-center rounded-md border border-dashed border-line text-xs text-ink-faint',
        className,
      )}
    >
      لا توجد بيانات كافية لعرض الرسم
    </div>
  );
}

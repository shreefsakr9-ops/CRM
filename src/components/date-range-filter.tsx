'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/primitives';

/**
 * فلتر [من/إلى] موحّد عبر الـ URL — نفس مكوّنات وستايل فلتر التاريخ في تقرير
 * المالية (`/reports`)، مُعاد استخدامه هنا لضمان نفس الشكل في كل صفحات القوائم.
 */
export function DateRangeFilter({ fromKey = 'from', toKey = 'to' }: { fromKey?: string; toKey?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setRange = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="flex items-end gap-2">
      <div>
        <label className="bp-label">من</label>
        <Input
          type="date"
          dir="ltr"
          value={params.get(fromKey) ?? ''}
          onChange={(e) => setRange(fromKey, e.target.value)}
          className="h-9"
        />
      </div>
      <div>
        <label className="bp-label">إلى</label>
        <Input
          type="date"
          dir="ltr"
          value={params.get(toKey) ?? ''}
          onChange={(e) => setRange(toKey, e.target.value)}
          className="h-9"
        />
      </div>
    </div>
  );
}

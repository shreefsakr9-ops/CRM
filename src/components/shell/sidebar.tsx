'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Icons from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandMark, BrandWordmark } from '@/components/brand';
import type { NavSection } from './nav-config';

function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ElementType>)[name] ?? Icons.Circle;
  return <C className={className} />;
}

export function Sidebar({
  sections,
  counts,
  open,
  onClose,
  locale = 'ar',
}: {
  sections: NavSection[];
  counts: { notifications: number; myTasks: number; approvals: number };
  open: boolean;
  onClose: () => void;
  locale?: 'ar' | 'en';
}) {
  const pathname = usePathname();

  const content = (
    <nav className="flex h-full flex-col">
      <div className="flex h-[var(--bp-header-h)] items-center gap-2.5 border-b border-line px-4">
        <BrandMark size={28} />
        <BrandWordmark className="text-sm" />
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.labelEn}>
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
              {locale === 'ar' ? section.labelAr : section.labelEn}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const count = item.badge ? counts[item.badge] : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        'group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors',
                        active
                          ? 'bg-brand/12 font-medium text-brand'
                          : 'text-ink-muted hover:bg-navy-800 hover:text-ink',
                      )}
                    >
                      <Icon
                        name={item.icon}
                        className={cn('h-4 w-4 shrink-0', active ? 'text-brand' : 'text-ink-faint')}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {locale === 'ar' ? item.labelAr : item.labelEn}
                      </span>
                      {count > 0 && (
                        <span className="num rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {count > 99 ? '99+' : count}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line px-4 py-3 text-[10px] text-ink-faint safe-bottom">
        Blue Point OS · v0.1
      </div>
    </nav>
  );

  return (
    <>
      {/* ثابت على الشاشات الكبيرة */}
      <aside
        className="fixed inset-y-0 start-0 z-30 hidden w-[var(--bp-sidebar-w)] border-e border-line bg-surface lg:block"
        aria-label="القائمة الجانبية"
      >
        {content}
      </aside>

      {/* درج منزلق على الموبايل */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/70 backdrop-blur-sm" onClick={onClose} />
          <aside className="relative h-full w-[min(84vw,var(--bp-sidebar-w))] border-e border-line bg-surface shadow-pop">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}

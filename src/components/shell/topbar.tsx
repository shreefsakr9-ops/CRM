'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, Search, Bell, LogOut, User as UserIcon, Loader2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/primitives';

export interface SearchGroup {
  module: string;
  label: string;
  items: { id: string; title: string; subtitle?: string; href: string }[];
}

export function Topbar({
  user,
  unread,
  onMenu,
  quickCreate,
}: {
  user: { name: string; email: string; avatarUrl: string | null; roleLabel: string };
  unread: number;
  onMenu: () => void;
  quickCreate: { href: string; label: string }[];
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<SearchGroup[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [openSearch, setOpenSearch] = React.useState(false);
  const [menu, setMenu] = React.useState<'user' | 'create' | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // اختصار لوحة المفاتيح: Ctrl/Cmd + K
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpenSearch(true);
        setTimeout(() => inputRef.current?.focus(), 10);
      }
      if (e.key === 'Escape') setOpenSearch(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  React.useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: ctrl.signal,
        });
        if (res.ok) setResults((await res.json()).groups as SearchGroup[]);
      } catch {
        /* تم إلغاء الطلب */
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  const go = (href: string) => {
    setOpenSearch(false);
    setQuery('');
    router.push(href);
  };

  return (
    <header className="sticky top-0 z-20 flex h-[var(--bp-header-h)] items-center gap-2 border-b border-line bg-surface/85 px-3 backdrop-blur-md sm:px-4">
      <button
        onClick={onMenu}
        className="rounded-md p-2 text-ink-muted hover:bg-navy-800 hover:text-ink lg:hidden"
        aria-label="فتح القائمة"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* البحث الشامل */}
      <div className="relative flex-1 max-w-xl">
        <button
          onClick={() => {
            setOpenSearch(true);
            setTimeout(() => inputRef.current?.focus(), 10);
          }}
          className="flex w-full items-center gap-2 rounded-md border border-line bg-surface-sunken px-3 py-2 text-xs text-ink-faint hover:border-brand/40"
          type="button"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-start">ابحث عن عميل، صفقة، مشروع، فاتورة…</span>
          <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[10px] sm:inline">
            Ctrl K
          </kbd>
        </button>

        {openSearch && (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-navy-950/70 px-4 pt-[12vh] backdrop-blur-sm">
            <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-line bg-surface-raised shadow-pop">
              <div className="flex items-center gap-2 border-b border-line px-4">
                <Search className="h-4 w-4 text-ink-faint" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="اكتب اسمًا، رقم هاتف، رقم كوتيشن أو فاتورة…"
                  className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
                />
                {searching && <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />}
                <button
                  onClick={() => setOpenSearch(false)}
                  className="rounded p-1 text-ink-faint hover:text-ink"
                  aria-label="إغلاق"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-[55vh] overflow-y-auto p-2">
                {query.trim().length < 2 ? (
                  <p className="px-3 py-8 text-center text-xs text-ink-faint">
                    اكتب حرفين على الأقل لبدء البحث
                  </p>
                ) : results.length === 0 && !searching ? (
                  <p className="px-3 py-8 text-center text-xs text-ink-faint">لا توجد نتائج مطابقة</p>
                ) : (
                  results.map((g) => (
                    <div key={g.module} className="mb-2">
                      <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
                        {g.label}
                      </p>
                      {g.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => go(item.href)}
                          className="flex w-full flex-col items-start rounded-md px-3 py-2 text-start hover:bg-navy-800"
                          type="button"
                        >
                          <span className="text-sm text-ink">{item.title}</span>
                          {item.subtitle && (
                            <span className="text-[11px] text-ink-faint">{item.subtitle}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* إنشاء سريع */}
      {quickCreate.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setMenu(menu === 'create' ? null : 'create')}
            className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-hover"
            type="button"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">إنشاء</span>
          </button>
          {menu === 'create' && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
              <div className="absolute end-0 z-20 mt-1 w-48 rounded-lg border border-line bg-surface-raised p-1.5 shadow-pop">
                {quickCreate.map((q) => (
                  <Link
                    key={q.href}
                    href={q.href}
                    onClick={() => setMenu(null)}
                    className="block rounded px-2.5 py-1.5 text-xs text-ink hover:bg-navy-800"
                  >
                    {q.label}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <Link
        href="/notifications"
        className="relative rounded-md p-2 text-ink-muted hover:bg-navy-800 hover:text-ink"
        aria-label={`الإشعارات${unread ? ` (${unread} غير مقروء)` : ''}`}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="num absolute -top-0.5 -end-0.5 min-w-4 rounded-full bg-accent px-1 text-[9px] font-bold leading-4 text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Link>

      <div className="relative">
        <button
          onClick={() => setMenu(menu === 'user' ? null : 'user')}
          className={cn('flex items-center gap-2 rounded-md p-1 hover:bg-navy-800')}
          aria-label="حساب المستخدم"
          type="button"
        >
          <Avatar name={user.name} src={user.avatarUrl} size={30} />
        </button>
        {menu === 'user' && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
            <div className="absolute end-0 z-20 mt-1 w-56 rounded-lg border border-line bg-surface-raised p-1.5 shadow-pop">
              <div className="border-b border-line px-2.5 py-2">
                <p className="truncate text-sm font-medium text-ink">{user.name}</p>
                <p className="truncate text-[11px] text-ink-faint" dir="ltr">
                  {user.email}
                </p>
                <p className="mt-1 text-[11px] text-brand">{user.roleLabel}</p>
              </div>
              <Link
                href="/profile"
                onClick={() => setMenu(null)}
                className="flex items-center gap-2 rounded px-2.5 py-2 text-xs text-ink hover:bg-navy-800"
              >
                <UserIcon className="h-3.5 w-3.5" />
                الملف الشخصي وكلمة المرور
              </Link>
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-xs text-danger hover:bg-danger/10"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  تسجيل الخروج
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

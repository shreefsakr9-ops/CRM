'use client';

import * as React from 'react';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import type { NavSection } from './nav-config';

export function AppShell({
  sections,
  counts,
  user,
  quickCreate,
  locale = 'ar',
  children,
}: {
  sections: NavSection[];
  counts: { notifications: number; myTasks: number; approvals: number };
  user: { name: string; email: string; avatarUrl: string | null; roleLabel: string };
  quickCreate: { href: string; label: string }[];
  locale?: 'ar' | 'en';
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="min-h-dvh">
      <Sidebar
        sections={sections}
        counts={counts}
        open={open}
        onClose={() => setOpen(false)}
        locale={locale}
      />
      <div className="lg:ms-[var(--bp-sidebar-w)]">
        <Topbar
          user={user}
          unread={counts.notifications}
          onMenu={() => setOpen(true)}
          quickCreate={quickCreate}
        />
        <main className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}

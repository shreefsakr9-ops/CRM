'use client';

import * as React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './primitives';

/**
 * Side Drawer للعمليات السريعة (إضافة متابعة، تعليق، تعديل سريع).
 * العمليات الكبيرة تستخدم صفحات كاملة وليس نوافذ منبثقة.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'sm' | 'md' | 'lg';
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl' };

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className="absolute inset-0 animate-fade-in bg-navy-950/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative z-10 ms-auto flex h-full w-full flex-col border-s border-line bg-surface shadow-pop',
          'animate-slide-up sm:animate-fade-in',
          widths[width],
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-ink-faint">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-ink-faint hover:bg-navy-800 hover:text-ink"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="border-t border-line bg-surface-raised px-5 py-3 safe-bottom">{footer}</div>
        )}
      </div>
    </div>
  );
}

/** تأكيد واضح قبل الإجراءات الحساسة — مع خيار تأكيد نصي للحذف النهائي. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'تأكيد',
  tone = 'danger',
  requireText,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  requireText?: string;
  loading?: boolean;
}) {
  const [typed, setTyped] = React.useState('');
  React.useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  if (!open) return null;
  const blocked = Boolean(requireText) && typed.trim() !== requireText;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="alertdialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-navy-950/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md animate-slide-up rounded-lg border border-line bg-surface-raised p-5 shadow-pop">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              tone === 'danger' ? 'bg-danger/12 text-danger' : 'bg-brand/12 text-brand',
            )}
          >
            <AlertTriangle className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">{message}</p>
            {requireText && (
              <div className="mt-3">
                <label className="bp-label">
                  اكتب <span className="font-mono text-ink">{requireText}</span> للتأكيد
                </label>
                <input
                  className="bp-input"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoFocus
                />
              </div>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} type="button">
            إلغاء
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            disabled={blocked}
            loading={loading}
            type="button"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

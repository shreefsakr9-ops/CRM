import {
  Phone,
  MessageCircle,
  Mail,
  Users,
  StickyNote,
  ArrowLeftRight,
  UserCheck,
  FileText,
  CalendarClock,
  Paperclip,
  Settings2,
  MessageSquare,
  BadgeCheck,
  Wallet,
} from 'lucide-react';
import { Avatar } from '@/components/ui/primitives';
import { formatDate } from '@/lib/format';
import { label } from '@/i18n/labels';
import { cn } from '@/lib/utils';

const ICONS: Record<string, React.ElementType> = {
  CALL: Phone,
  WHATSAPP: MessageCircle,
  EMAIL: Mail,
  MEETING: Users,
  NOTE: StickyNote,
  STATUS_CHANGE: ArrowLeftRight,
  ASSIGNMENT: UserCheck,
  QUOTATION: FileText,
  FOLLOW_UP: CalendarClock,
  FILE: Paperclip,
  SYSTEM: Settings2,
  COMMENT: MessageSquare,
  APPROVAL: BadgeCheck,
  PAYMENT: Wallet,
};

export interface TimelineItem {
  id: string;
  type: string;
  subject: string;
  body?: string | null;
  outcome?: string | null;
  durationMin?: number | null;
  occurredAt: string;
  user?: { name: string; avatarUrl: string | null } | null;
}

export function Timeline({ items, timezone = 'Africa/Cairo' }: { items: TimelineItem[]; timezone?: string }) {
  if (items.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-xs text-ink-faint">
        لا توجد أنشطة مسجلة بعد — كل تواصل أو تغيير حالة سيظهر هنا تلقائيًا.
      </p>
    );
  }

  return (
    <ol className="relative space-y-0 px-4 py-3">
      {items.map((item, i) => {
        const Icon = ICONS[item.type] ?? Settings2;
        return (
          <li key={item.id} className="relative flex gap-3 pb-4">
            {i < items.length - 1 && (
              <span className="absolute top-8 h-[calc(100%-1.25rem)] w-px bg-line" style={{ insetInlineStart: '0.9375rem' }} />
            )}
            <span
              className={cn(
                'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface-raised text-ink-muted',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className="text-sm text-ink">{item.subject}</p>
                <span className="text-[10px] text-ink-faint">{label('activityType', item.type)}</span>
              </div>
              {item.body && <p className="mt-0.5 whitespace-pre-wrap text-xs text-ink-muted">{item.body}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
                {item.user && (
                  <span className="flex items-center gap-1">
                    <Avatar name={item.user.name} src={item.user.avatarUrl} size={16} />
                    {item.user.name}
                  </span>
                )}
                <span>{formatDate(item.occurredAt, 'ar', timezone, true)}</span>
                {item.durationMin ? <span>· {item.durationMin} دقيقة</span> : null}
                {item.outcome ? <span className="text-ok">· {item.outcome}</span> : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

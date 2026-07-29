'use client';

import * as React from 'react';
import { Field, Select, Checkbox } from '@/components/ui/primitives';
import { label } from '@/i18n/labels';

/**
 * اختيار مستلم المراسلة وإضافة نسخة (CC) من جهات اتصال العميل.
 *
 * الاختيار يُرسل كمعرّفات لا كعناوين بريد: الخادم هو من يحوّل المعرّف إلى عنوان
 * بعد التأكد أنه يخص عميل المستند. لو أُرسل العنوان من المتصفح لأمكن لأي مستخدم
 * توجيه فاتورة عميل إلى بريد يختاره — والواجهة لا تُعتبر حماية.
 *
 * القائمة تُعرض فقط عند وجود أكثر من جهة اتصال واحدة؛ الحالة الشائعة (جهة واحدة)
 * تبقى بلا حقول إضافية.
 */

export interface RecipientOption {
  id: string;
  name: string;
  email: string;
  type: string;
  isPrimary: boolean;
}

export interface RecipientChoice {
  toContactId?: string;
  ccContactIds: string[];
}

function describe(option: RecipientOption) {
  return `${option.name} — ${label('contactType', option.type)} · ${option.email}`;
}

export function RecipientPicker({
  options,
  value,
  onChange,
  disabled,
}: {
  options: RecipientOption[];
  value: RecipientChoice;
  onChange: (next: RecipientChoice) => void;
  disabled?: boolean;
}) {
  if (options.length < 2) return null;

  const ccCandidates = options.filter((o) => o.id !== value.toContactId);

  return (
    <div className="space-y-3">
      <Field label="المستلم" hint="اتركه على «الاختيار التلقائي» ليذهب لجهة الاتصال المناسبة.">
        <Select
          value={value.toContactId ?? ''}
          disabled={disabled}
          onChange={(e) => {
            const toContactId = e.target.value || undefined;
            onChange({
              toContactId,
              // المستلم لا يكون نسخةً لنفسه — نزيله من CC عند اختياره.
              ccContactIds: value.ccContactIds.filter((id) => id !== toContactId),
            });
          }}
        >
          <option value="">الاختيار التلقائي</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {describe(o)}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="نسخة (CC)" hint="جهات اتصال إضافية تصلها نفس الرسالة والمرفق.">
        <div className="space-y-1.5 rounded-md border border-line bg-surface-sunken/50 p-2.5">
          {ccCandidates.map((o) => (
            <Checkbox
              key={o.id}
              className="w-full text-xs"
              disabled={disabled}
              checked={value.ccContactIds.includes(o.id)}
              onChange={(e) =>
                onChange({
                  ...value,
                  ccContactIds: e.target.checked
                    ? [...value.ccContactIds, o.id]
                    : value.ccContactIds.filter((id) => id !== o.id),
                })
              }
              label={describe(o)}
            />
          ))}
          {ccCandidates.length === 0 && (
            <p className="text-xs text-ink-faint">لا توجد جهات اتصال أخرى.</p>
          )}
        </div>
      </Field>
    </div>
  );
}

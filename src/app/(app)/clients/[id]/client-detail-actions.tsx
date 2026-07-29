'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, UserPlus, FileText, FolderPlus } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { options as labelOptions } from '@/i18n/labels';
import { ClientForm, type ClientFormValues } from '../client-form';
import { upsertContactAction } from '../actions';

export function ClientDetailActions({
  client,
  options,
  perms,
}: {
  client: ClientFormValues & { id: string };
  options: { users: { id: string; name: string }[]; countries: { code: string; nameAr: string }[] };
  perms: {
    canEdit: boolean;
    canManageContacts: boolean;
    canCreateQuotation: boolean;
    canCreateProject: boolean;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState<'edit' | 'contact' | null>(null);
  const [pending, setPending] = React.useState(false);
  const [isPrimary, setIsPrimary] = React.useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      {perms.canEdit && (
        <Button size="sm" variant="secondary" onClick={() => setOpen('edit')} type="button">
          <Pencil className="h-3.5 w-3.5" />
          تعديل
        </Button>
      )}
      {perms.canManageContacts && (
        <Button size="sm" variant="secondary" onClick={() => setOpen('contact')} type="button">
          <UserPlus className="h-3.5 w-3.5" />
          جهة اتصال
        </Button>
      )}
      {perms.canCreateQuotation && (
        <Link href={`/quotations/new?clientId=${client.id}`}>
          <Button size="sm">
            <FileText className="h-3.5 w-3.5" />
            عرض سعر
          </Button>
        </Link>
      )}
      {perms.canCreateProject && (
        <Link href={`/projects/new?clientId=${client.id}`}>
          <Button size="sm" variant="outline">
            <FolderPlus className="h-3.5 w-3.5" />
            مشروع
          </Button>
        </Link>
      )}

      <Drawer open={open === 'edit'} onClose={() => setOpen(null)} title="تعديل بيانات العميل">
        <ClientForm
          initial={client}
          options={options}
          onDone={() => {
            setOpen(null);
            router.refresh();
          }}
        />
      </Drawer>

      <Drawer
        open={open === 'contact'}
        onClose={() => setOpen(null)}
        title="جهة اتصال جديدة"
        description="حدّد نوع جهة الاتصال حتى يعرف الفريق من يتخذ القرار ومن يستلم الفواتير."
        width="sm"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setPending(true);
            const res = await upsertContactAction({
              ...Object.fromEntries(fd.entries()),
              clientId: client.id,
              isPrimary,
            });
            setPending(false);
            if (!res.ok) return toast.error(res.error);
            toast.success('تمت إضافة جهة الاتصال');
            setOpen(null);
            router.refresh();
          }}
          className="space-y-4"
        >
          <Field label="الاسم" required>
            <Input name="name" required minLength={2} />
          </Field>
          <Field label="المسمى الوظيفي">
            <Input name="position" />
          </Field>
          <Field label="النوع" required>
            <Select name="type" defaultValue="MAIN" options={labelOptions('contactType')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الهاتف">
              <Input name="phone" dir="ltr" />
            </Field>
            <Field label="واتساب">
              <Input name="whatsapp" dir="ltr" />
            </Field>
          </div>
          <Field label="البريد الإلكتروني">
            <Input name="email" type="email" dir="ltr" />
          </Field>
          <Checkbox
            label="جهة الاتصال الأساسية"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
          />
          <Field label="ملاحظات">
            <Textarea name="notes" rows={2} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={pending}>
              إضافة
            </Button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}

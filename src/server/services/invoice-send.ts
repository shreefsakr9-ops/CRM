import 'server-only';
import { prisma } from '@/server/db';
import { requirePermission, NotFound, BadRequest, AppError } from '@/server/auth/guard';
import { renderInvoicePdf } from './invoice-pdf';
import { sendMail, renderEmail, appUrl, isMailEnabled, maskEmail } from './mailer';
import { getSettings } from './settings';
import { audit } from './audit';
import { formatMoney, formatDate } from '@/lib/format';
import type { Lang } from './pdf-layout';

/**
 * إرسال الفاتورة للعميل بالبريد مع مرفق PDF.
 *
 * مبدآن يحكمان هذه العملية:
 * 1. تغيير الحالة إلى «مُرسلة» لا يتم إلا بعد نجاح الإرسال فعلًا — حتى لا تظهر
 *    الفاتورة كمُرسلة وهي لم تصل. الإرسال بدون بريد يبقى ممكنًا صراحةً للحالات
 *    التي تُسلَّم فيها الفاتورة يدويًا.
 * 2. النتيجة تُعاد كما هي بلا تجميل: من استلمها، أو سبب عدم الإرسال.
 */

export type InvoiceSendOutcome =
  | { status: 'sent'; to: string }
  | { status: 'marked_only'; reason: string };

/** جهة الاتصال المالية أولًا، ثم جهة الاتصال الرئيسية، ثم أي جهة لها بريد. */
async function resolveRecipient(clientId: string) {
  const contacts = await prisma.contact.findMany({
    where: { clientId, deletedAt: null, email: { not: null } },
    // ترتيب حتمي: بدونه قد تعيد المعاينة جهة والإرسال جهة أخرى عند تعدد
    // جهات الاتصال من نفس النوع، لأن Postgres لا يضمن ترتيب الصفوف.
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    select: { name: true, email: true, type: true, isPrimary: true },
  });
  const withEmail = contacts.filter((c) => c.email?.includes('@'));
  return (
    withEmail.find((c) => c.type === 'FINANCE') ??
    withEmail.find((c) => c.isPrimary) ??
    withEmail[0] ??
    null
  );
}

export async function previewInvoiceRecipient(invoiceId: string) {
  await requirePermission('invoices', 'view');
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, deletedAt: null },
    select: { clientId: true },
  });
  if (!invoice) throw NotFound('الفاتورة غير موجودة');
  const contact = await resolveRecipient(invoice.clientId);
  return {
    mailEnabled: isMailEnabled(),
    // البريد كاملًا لأن المستخدم على وشك الإرسال إليه ويجب أن يتحقق منه.
    recipient: contact ? { name: contact.name, email: contact.email! } : null,
  };
}

export async function sendInvoiceToClient(
  invoiceId: string,
  options: { email: boolean; lang?: Lang } = { email: true },
): Promise<InvoiceSendOutcome> {
  const user = await requirePermission('invoices', 'edit');
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, deletedAt: null },
    include: { client: { select: { legalName: true, brandName: true } } },
  });
  if (!invoice) throw NotFound('الفاتورة غير موجودة');
  if (invoice.status !== 'DRAFT') throw BadRequest('الفاتورة مُرسلة بالفعل');

  const markSent = async (summary: string) => {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'SENT', sentAt: new Date() },
    });
    await audit({
      userId: user.id,
      action: 'STATUS_CHANGE',
      module: 'invoices',
      entityType: 'INVOICE',
      entityId: invoiceId,
      summary,
    });
  };

  if (!options.email) {
    await markSent(`تعليم الفاتورة ${invoice.number} كمُرسلة (تسليم يدوي بدون بريد)`);
    return { status: 'marked_only', reason: 'اختير التعليم كمُرسلة بدون إرسال بريد' };
  }

  if (!isMailEnabled()) {
    await markSent(`تعليم الفاتورة ${invoice.number} كمُرسلة (خادم البريد غير مضبوط)`);
    return { status: 'marked_only', reason: 'خادم البريد غير مضبوط' };
  }

  const contact = await resolveRecipient(invoice.clientId);
  if (!contact) {
    await markSent(`تعليم الفاتورة ${invoice.number} كمُرسلة (لا يوجد بريد لجهة اتصال)`);
    return { status: 'marked_only', reason: 'لا توجد جهة اتصال لها بريد إلكتروني عند هذا العميل' };
  }

  const settings = await getSettings();
  const lang: Lang = options.lang ?? (settings.locale.defaultLocale === 'en' ? 'en' : 'ar');
  // توليد الـPDF يعتمد على Chromium وقد يفشل لأسباب تشغيلية (غير مثبّت، ذاكرة).
  // نحوّله إلى خطأ مفهوم بدل رسالة عامة، وتبقى الفاتورة مسودة.
  let pdf: Buffer;
  try {
    pdf = await renderInvoicePdf(invoiceId, lang);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[invoice-send] تعذّر توليد PDF للفاتورة ${invoice.number}: ${message}`);
    throw new AppError(
      'تعذّر توليد ملف الفاتورة — لم تُرسل وبقيت مسودة. راجع سجل الخادم.',
      500,
      'PDF_FAILED',
    );
  }

  const clientName = invoice.client.brandName || invoice.client.legalName;
  const total = formatMoney(invoice.totalMinor, invoice.currency, lang);
  const due = formatDate(invoice.dueDate, lang, settings.locale.timezone);

  // بيانات التواصل قد تكون غير مضبوطة بعد — لا نكتب جملة معلّقة بلا قيمة.
  const contactPoint = settings.company.email || settings.company.phone;
  const footnote = contactPoint
    ? lang === 'ar'
      ? `لأي استفسار بخصوص هذه الفاتورة تواصل معنا على ${contactPoint}.`
      : `For any question about this invoice contact us at ${contactPoint}.`
    : undefined;

  const result = await sendMail({
    to: contact.email!,
    subject:
      lang === 'ar'
        ? `فاتورة ${invoice.number} — ${settings.company.nameAr}`
        : `Invoice ${invoice.number} — ${settings.company.nameEn}`,
    html: await renderEmail({
      heading: lang === 'ar' ? `فاتورة رقم ${invoice.number}` : `Invoice ${invoice.number}`,
      intro:
        lang === 'ar'
          ? `مرحبًا ${contact.name}، مرفق فاتورة ${clientName} بصيغة PDF.`
          : `Hello ${contact.name}, please find the invoice for ${clientName} attached as a PDF.`,
      blocks: [
        { title: lang === 'ar' ? 'الإجمالي' : 'Total', value: total },
        { title: lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due date', value: due },
      ],
      footnote,
      audience: 'client',
    }),
    replyTo: settings.company.email || undefined,
    attachments: [
      { filename: `${invoice.number}.pdf`, content: pdf, contentType: 'application/pdf' },
    ],
  });

  if (result.status !== 'sent') {
    // الحالة تبقى «مسودة»: فاتورة لم تصل يجب أن تظل قابلة لإعادة المحاولة.
    const reason = result.status === 'failed' ? result.error : result.reason;
    await audit({
      userId: user.id,
      action: 'EXPORT',
      module: 'invoices',
      entityType: 'INVOICE',
      entityId: invoiceId,
      summary: `فشل إرسال الفاتورة ${invoice.number} إلى ${maskEmail(contact.email!)}`,
    });
    throw BadRequest(`تعذّر إرسال البريد: ${reason}`);
  }

  await markSent(`إرسال الفاتورة ${invoice.number} بالبريد إلى ${maskEmail(contact.email!)}`);
  return { status: 'sent', to: contact.email! };
}

/** رابط الفاتورة داخل النظام — يُستخدم في إشعارات الفريق لا في بريد العميل. */
export function invoiceLink(id: string) {
  return appUrl(`/invoices/${id}`);
}

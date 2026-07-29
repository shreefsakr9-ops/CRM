import 'server-only';
import { prisma } from '@/server/db';
import { requirePermission, NotFound, BadRequest, AppError } from '@/server/auth/guard';
import { renderQuotationPdf } from './quotation-pdf';
import { sendMail, renderEmail, isMailEnabled, maskEmail } from './mailer';
import { getSettings } from './settings';
import { contactOptions, resolveChosenContacts, dedupeCc } from './recipients';
import { audit } from './audit';
import { formatMoney, formatDate } from '@/lib/format';
import type { Lang } from './pdf-layout';

/**
 * إرسال عرض السعر للعميل بالبريد مع مرفق PDF — بنفس قواعد إرسال الفاتورة:
 * الحالة لا تتحول إلى «مُرسل» إلا بعد نجاح الإرسال فعلًا، وتبقى خيار التسليم
 * اليدوي متاحًا صراحةً.
 *
 * الفرق عن الفاتورة: عرض السعر قد يكون لعميل محتمل (Lead) لم يصبح عميلًا بعد،
 * فمصدر البريد يختلف.
 */

export type QuotationSendOutcome =
  | { status: 'sent'; to: string }
  | { status: 'marked_only'; reason: string };

interface Recipient {
  name: string;
  email: string;
  /** من أين جاء البريد — يُعرض للمستخدم قبل الإرسال. */
  source: 'contact' | 'lead';
}

async function resolveRecipient(q: {
  contactId: string | null;
  clientId: string | null;
  leadId: string | null;
}): Promise<Recipient | null> {
  // جهة الاتصال المحددة على العرض نفسه أولًا — هي من تفاوض فعلًا.
  if (q.contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: q.contactId, deletedAt: null, email: { not: null } },
      select: { name: true, email: true },
    });
    if (contact?.email) return { name: contact.name, email: contact.email, source: 'contact' };
  }

  if (q.clientId) {
    const contacts = await prisma.contact.findMany({
      where: { clientId: q.clientId, deletedAt: null, email: { not: null } },
      // ترتيب حتمي: بدونه قد تعيد المعاينة جهة والإرسال جهة أخرى عند تعدد
      // جهات الاتصال من نفس النوع، لأن Postgres لا يضمن ترتيب الصفوف.
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: { name: true, email: true, type: true, isPrimary: true },
    });
    const withEmail = contacts.filter((c) => c.email?.includes('@'));
    const chosen =
      withEmail.find((c) => c.type === 'DECISION_MAKER') ??
      withEmail.find((c) => c.isPrimary) ??
      withEmail[0];
    if (chosen?.email) return { name: chosen.name, email: chosen.email, source: 'contact' };
  }

  if (q.leadId) {
    const lead = await prisma.lead.findFirst({
      where: { id: q.leadId, deletedAt: null },
      select: { fullName: true, email: true },
    });
    if (lead?.email?.includes('@')) {
      return { name: lead.fullName, email: lead.email, source: 'lead' };
    }
  }

  return null;
}

export async function previewQuotationRecipient(quotationId: string) {
  const user = await requirePermission('quotations', 'view');
  const q = await prisma.quotation.findFirst({
    where: { id: quotationId, deletedAt: null },
    select: { contactId: true, clientId: true, leadId: true },
  });
  if (!q) throw NotFound('عرض السعر غير موجود');

  const settings = await getSettings();
  return {
    mailEnabled: isMailEnabled(),
    recipient: await resolveRecipient(q),
    // جهات اتصال العميل ليختار المستخدم مستلمًا آخر أو يضيف نسخة. عرض السعر
    // المرتبط بعميل محتمل فقط لا عميل له، فالقائمة تكون فارغة والاختيار غير متاح.
    options: await contactOptions(q.clientId),
    defaultLang: settings.locale.defaultLocale === 'en' ? ('en' as Lang) : ('ar' as Lang),
    canSend: user.permissions['quotations.edit'] !== undefined,
  };
}

export async function sendQuotationToClient(
  quotationId: string,
  options: {
    email: boolean;
    lang?: Lang;
    /** مستلم مختار يدويًا بدل الاختيار التلقائي. */
    toContactId?: string;
    /** جهات اتصال تُضاف كنسخة (CC). */
    ccContactIds?: string[];
  } = { email: true },
): Promise<QuotationSendOutcome> {
  const user = await requirePermission('quotations', 'edit');
  const settings = await getSettings();

  const q = await prisma.quotation.findFirst({
    where: { id: quotationId, deletedAt: null },
    select: {
      id: true,
      number: true,
      status: true,
      leadId: true,
      clientId: true,
      contactId: true,
      totalMinor: true,
      currency: true,
      expiryDate: true,
    },
  });
  if (!q) throw NotFound('عرض السعر غير موجود');

  // نفس شرط الاعتماد الداخلي المطبَّق سابقًا — لا يتغيّر بإضافة البريد.
  if (settings.quotation.requireInternalApproval && q.status !== 'APPROVED_INTERNALLY') {
    throw BadRequest('لا يمكن الإرسال قبل الاعتماد الداخلي (الإعداد مفعّل في إعدادات النظام)');
  }
  if (q.status === 'SENT') throw BadRequest('عرض السعر مُرسل بالفعل');

  // التحقق من المدخلات قبل أي تغيير حالة: معرّف خاطئ يجب أن يفشل الطلب لا أن
  // يُتجاهل بصمت ويُعلَّم العرض كمُرسل.
  const [picked] = options.toContactId
    ? await resolveChosenContacts(q.clientId, [options.toContactId])
    : [];
  const ccContacts = await resolveChosenContacts(q.clientId, options.ccContactIds ?? []);

  const markSentInternal = async (summary: string) => {
    await prisma.quotation.update({
      where: { id: quotationId },
      data: { status: 'SENT', sentAt: new Date() },
    });
    if (q.leadId) {
      await prisma.activity.create({
        data: {
          entityType: 'LEAD',
          entityId: q.leadId,
          type: 'QUOTATION',
          subject: summary,
          userId: user.id,
        },
      });
    }
    await audit({
      userId: user.id,
      action: 'STATUS_CHANGE',
      module: 'quotations',
      entityType: 'QUOTATION',
      entityId: quotationId,
      summary,
    });
  };

  if (!options.email) {
    await markSentInternal(`تعليم عرض السعر ${q.number} كمُرسل (تسليم يدوي بدون بريد)`);
    return { status: 'marked_only', reason: 'اختير التعليم كمُرسل بدون إرسال بريد' };
  }

  if (!isMailEnabled()) {
    await markSentInternal(`تعليم عرض السعر ${q.number} كمُرسل (خادم البريد غير مضبوط)`);
    return { status: 'marked_only', reason: 'خادم البريد غير مضبوط' };
  }

  const recipient: Recipient | null = picked
    ? { name: picked.name, email: picked.email, source: 'contact' }
    : await resolveRecipient(q);
  if (!recipient) {
    await markSentInternal(`تعليم عرض السعر ${q.number} كمُرسل (لا يوجد بريد للمستلم)`);
    return {
      status: 'marked_only',
      reason: 'لا يوجد بريد إلكتروني لجهة الاتصال أو للعميل المحتمل',
    };
  }

  const cc = dedupeCc(
    recipient.email,
    ccContacts.map((c) => c.email),
  );

  const lang: Lang = options.lang ?? (settings.locale.defaultLocale === 'en' ? 'en' : 'ar');

  let pdf: Buffer;
  try {
    pdf = await renderQuotationPdf(quotationId, lang);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[quotation-send] تعذّر توليد PDF لعرض السعر ${q.number}: ${message}`);
    throw new AppError(
      'تعذّر توليد ملف عرض السعر — لم يُرسل وبقيت حالته كما هي. راجع سجل الخادم.',
      500,
      'PDF_FAILED',
    );
  }

  const total = formatMoney(q.totalMinor, q.currency, lang);
  const validUntil = formatDate(q.expiryDate, lang, settings.locale.timezone);
  const contactPoint = settings.company.email || settings.company.phone;

  const result = await sendMail({
    to: recipient.email,
    cc,
    subject:
      lang === 'ar'
        ? `عرض سعر ${q.number} — ${settings.company.nameAr}`
        : `Quotation ${q.number} — ${settings.company.nameEn}`,
    html: await renderEmail({
      heading: lang === 'ar' ? `عرض سعر رقم ${q.number}` : `Quotation ${q.number}`,
      intro:
        lang === 'ar'
          ? `مرحبًا ${recipient.name}، مرفق عرض السعر بصيغة PDF. يسعدنا تلقّي ملاحظاتك.`
          : `Hello ${recipient.name}, please find our quotation attached as a PDF. We welcome your feedback.`,
      blocks: [
        { title: lang === 'ar' ? 'الإجمالي' : 'Total', value: total },
        { title: lang === 'ar' ? 'صالح حتى' : 'Valid until', value: validUntil },
      ],
      footnote: contactPoint
        ? lang === 'ar'
          ? `لأي استفسار أو تعديل مطلوب تواصل معنا على ${contactPoint}.`
          : `For any question or requested change contact us at ${contactPoint}.`
        : undefined,
      audience: 'client',
    }),
    replyTo: settings.company.email || undefined,
    attachments: [{ filename: `${q.number}.pdf`, content: pdf, contentType: 'application/pdf' }],
  });

  if (result.status !== 'sent') {
    // الحالة لا تتغيّر: عرض لم يصل يجب أن يظل قابلًا لإعادة الإرسال.
    const reason = result.status === 'failed' ? result.error : result.reason;
    await audit({
      userId: user.id,
      action: 'EXPORT',
      module: 'quotations',
      entityType: 'QUOTATION',
      entityId: quotationId,
      summary: `فشل إرسال عرض السعر ${q.number} إلى ${maskEmail(recipient.email)}`,
    });
    throw new AppError(`تعذّر إرسال البريد: ${reason}`, 400, 'MAIL_FAILED');
  }

  await markSentInternal(
    `إرسال عرض السعر ${q.number} بالبريد إلى ${maskEmail(recipient.email)}` +
      (cc.length ? ` (نسخة إلى ${cc.length})` : ''),
  );
  return { status: 'sent', to: recipient.email };
}

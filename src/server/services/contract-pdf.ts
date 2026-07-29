import 'server-only';
import { getContract } from './contracts';
import { htmlToPdf } from './pdf';
import { documentShell, esc, type Lang } from './pdf-layout';
import { formatMoney, formatDate, currencySymbol } from '@/lib/format';
import { audit } from './audit';
import { requireUser } from '@/server/auth/guard';
import { CONTRACT_STATUS, INVOICE_STATUS } from '@/i18n/labels';

/**
 * ملخص عقد — وليس العقد القانوني نفسه.
 *
 * العقد الموقَّع مستند خارجي يُرفع على السجل (`signedFileId`). ما يولّده النظام هنا
 * هو ورقة ملخص للبيانات المسجَّلة: الأطراف، المدة، القيمة، الخدمات وحالة الفوترة.
 * التسمية والتنبيه أسفل الورقة صريحان في ذلك حتى لا تُستخدم كبديل عن العقد.
 */

const T = {
  ar: {
    summary: 'ملخص عقد',
    number: 'رقم العقد',
    status: 'الحالة',
    startDate: 'تاريخ البداية',
    endDate: 'تاريخ الانتهاء',
    client: 'العميل',
    owner: 'مسؤول الحساب',
    title: 'موضوع العقد',
    duration: 'المدة',
    value: 'قيمة العقد',
    renewal: 'التجديد',
    renewalDate: 'تاريخ التجديد',
    autoRenew: 'تجديد تلقائي',
    yes: 'نعم',
    no: 'لا',
    paymentTerms: 'شروط الدفع',
    services: 'الخدمات المتعاقد عليها',
    invoices: 'الفوترة',
    invoiceNumber: 'الفاتورة',
    invoiceStatus: 'الحالة',
    total: 'الإجمالي',
    paid: 'المدفوع',
    invoicedTotal: 'إجمالي ما فُوتر',
    collectedTotal: 'إجمالي ما حُصِّل',
    projects: 'المشاريع المرتبطة',
    quotation: 'عرض السعر المصدر',
    notes: 'ملاحظات',
    disclaimer:
      'هذه ورقة ملخص صادرة عن النظام الداخلي لأغراض المتابعة والأرشفة، وليست العقد القانوني ولا بديلًا عنه. المرجع الملزم هو نسخة العقد الموقَّعة من الطرفين.',
    financialHidden: 'القيم المالية غير معروضة لعدم توفر صلاحية عرضها.',
    draftStamp: 'مسودة',
  },
  en: {
    summary: 'Contract summary',
    number: 'Contract No.',
    status: 'Status',
    startDate: 'Start date',
    endDate: 'End date',
    client: 'Client',
    owner: 'Account owner',
    title: 'Subject',
    duration: 'Duration',
    value: 'Contract value',
    renewal: 'Renewal',
    renewalDate: 'Renewal date',
    autoRenew: 'Auto renew',
    yes: 'Yes',
    no: 'No',
    paymentTerms: 'Payment terms',
    services: 'Contracted services',
    invoices: 'Billing',
    invoiceNumber: 'Invoice',
    invoiceStatus: 'Status',
    total: 'Total',
    paid: 'Paid',
    invoicedTotal: 'Total invoiced',
    collectedTotal: 'Total collected',
    projects: 'Linked projects',
    quotation: 'Source quotation',
    notes: 'Notes',
    disclaimer:
      'This is an internal summary sheet for tracking and archiving. It is not the legal contract and does not replace it. The binding reference is the copy signed by both parties.',
    financialHidden: 'Financial values are hidden — permission not granted.',
    draftStamp: 'DRAFT',
  },
} as const;

/**
 * صيغة العدد بالعربية تختلف حسب الكمية (مفرد/مثنى/جمع قلة/تمييز مفرد منصوب).
 * كتابة «3 شهرًا» خطأ لغوي واضح في مستند يصل للعميل.
 */
function pluralAr(count: number, forms: [string, string, string, string]): string {
  if (count === 1) return forms[0];
  if (count === 2) return forms[1];
  if (count >= 3 && count <= 10) return `${count} ${forms[2]}`;
  return `${count} ${forms[3]}`;
}

function durationLabel(days: number, lang: Lang): string {
  if (days >= 60) {
    const months = Math.round(days / 30);
    return lang === 'ar'
      ? pluralAr(months, ['شهر واحد', 'شهران', 'أشهر', 'شهرًا'])
      : `${months} month${months === 1 ? '' : 's'}`;
  }
  return lang === 'ar'
    ? pluralAr(days, ['يوم واحد', 'يومان', 'أيام', 'يومًا'])
    : `${days} day${days === 1 ? '' : 's'}`;
}

export async function renderContractHtml(id: string, lang: Lang = 'ar') {
  // getContract يفرض الصلاحية والنطاق، ويحجب القيم المالية لمن لا يملك view_financial.
  const c = await getContract(id);
  const t = T[lang];
  const money = (v: bigint | number) => formatMoney(v, c.currency, lang, { withSymbol: false });
  const symbol = esc(currencySymbol(c.currency, lang));
  const clientName = c.client.brandName || c.client.legalName;

  const dayMs = 86_400_000;
  const totalDays = Math.round((c.endDate.getTime() - c.startDate.getTime()) / dayMs);
  const durationText = durationLabel(totalDays, lang);

  const servicesHtml = c.services.length
    ? `<section class="block">
      <h2>${t.services}</h2>
      <table class="table">
        <tbody>
          ${c.services
            .map((s, i) => `<tr><td class="c" style="width:26px">${i + 1}</td><td>${esc(s.service.nameAr)}</td></tr>`)
            .join('')}
        </tbody>
      </table>
    </section>`
    : '';

  const projectsHtml = c.projects.length
    ? `<section class="block">
      <h2>${t.projects}</h2>
      <table class="table">
        <tbody>
          ${c.projects
            .map((p, i) => `<tr><td class="c" style="width:26px">${i + 1}</td><td>${esc(p.name)}</td></tr>`)
            .join('')}
        </tbody>
      </table>
    </section>`
    : '';

  // قائمة الفواتير فارغة أصلًا لمن لا يملك صلاحية عرض المالية.
  const invoicedMinor = c.invoices.reduce((sum, i) => sum + i.totalMinor, 0n);
  const collectedMinor = c.invoices.reduce((sum, i) => sum + i.paidMinor, 0n);
  const invoicesHtml = c.invoices.length
    ? `<section class="block">
      <h2>${t.invoices}</h2>
      <table class="table">
        <thead>
          <tr>
            <th>${t.invoiceNumber}</th>
            <th>${t.invoiceStatus}</th>
            <th class="e">${t.total}</th>
            <th class="e">${t.paid}</th>
          </tr>
        </thead>
        <tbody>
          ${c.invoices
            .map(
              (i) => `
            <tr>
              <td class="num">${esc(i.number)}</td>
              <td>${esc(INVOICE_STATUS[i.status]?.[lang] ?? i.status)}</td>
              <td class="e num">${money(i.totalMinor)}</td>
              <td class="e num">${money(i.paidMinor)}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
      <div class="totals">
        <table>
          <tr><td>${t.invoicedTotal}</td><td class="e num">${money(invoicedMinor)} ${symbol}</td></tr>
          <tr class="grand"><td>${t.collectedTotal}</td><td class="e num">${money(collectedMinor)} ${symbol}</td></tr>
        </table>
      </div>
    </section>`
    : '';

  const facts: { label: string; value: string; num?: boolean }[] = [
    { label: t.title, value: c.title },
    { label: t.duration, value: durationText, num: true },
    { label: t.autoRenew, value: c.autoRenew ? t.yes : t.no },
  ];
  if (c.renewalDate) {
    facts.push({ label: t.renewalDate, value: formatDate(c.renewalDate, lang), num: true });
  }
  if (c.paymentTerms) facts.push({ label: t.paymentTerms, value: c.paymentTerms });
  if (c.quotation) facts.push({ label: t.quotation, value: c.quotation.number, num: true });
  facts.push(
    c.valueMinor !== null
      ? { label: t.value, value: `${money(c.valueMinor)} ${currencySymbol(c.currency, lang)}`, num: true }
      : { label: t.value, value: '—' },
  );

  return documentShell({
    lang,
    title: c.number,
    docTitle: t.summary,
    footerNote: c.number,
    watermark: c.status === 'DRAFT' ? { text: t.draftStamp, tone: 'neutral' as const } : undefined,
    metaRows: [
      { label: t.number, value: c.number, num: true },
      { label: t.startDate, value: formatDate(c.startDate, lang), num: true },
      { label: t.endDate, value: formatDate(c.endDate, lang), num: true },
      { label: t.status, value: CONTRACT_STATUS[c.status]?.[lang] ?? c.status },
    ],
    body: `
<div class="cards">
  <div class="card">
    <h3>${t.client}</h3>
    <div class="name">${esc(clientName)}</div>
    ${c.client.brandName ? `<div class="line">${esc(c.client.legalName)}</div>` : ''}
  </div>
  <div class="card">
    <h3>${t.owner}</h3>
    <div class="name">${esc(c.owner.name)}</div>
  </div>
</div>

<table class="table">
  <tbody>
    ${facts
      .map(
        (f) =>
          `<tr><td style="width:34%" class="muted">${esc(f.label)}</td><td class="strong${f.num ? ' num' : ''}">${esc(f.value)}</td></tr>`,
      )
      .join('\n    ')}
  </tbody>
</table>

${c.valueMinor === null ? `<div class="notice">${esc(t.financialHidden)}</div>` : ''}
${servicesHtml}
${invoicesHtml}
${projectsHtml}
${c.notes ? `<section class="block"><h2>${t.notes}</h2><p>${esc(c.notes)}</p></section>` : ''}

<div class="notice">${esc(t.disclaimer)}</div>`,
  });
}

export async function renderContractPdf(id: string, lang: Lang = 'ar') {
  const user = await requireUser();
  const html = await renderContractHtml(id, lang);
  const pdf = await htmlToPdf(html);
  await audit({
    userId: user.id,
    action: 'EXPORT',
    module: 'contracts',
    entityType: 'CONTRACT',
    entityId: id,
    summary: `تصدير ملخص العقد إلى PDF (${lang})`,
  });
  return pdf;
}

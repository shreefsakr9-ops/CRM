import 'server-only';
import { getQuotation } from './quotations';
import { htmlToPdf } from './pdf';
import { documentShell, esc, type Lang } from './pdf-layout';
import { formatMoney, formatDate, currencySymbol } from '@/lib/format';
import { audit } from './audit';
import { requireUser } from '@/server/auth/guard';

const T = {
  ar: {
    quotation: 'عرض سعر',
    number: 'رقم العرض',
    issueDate: 'تاريخ الإصدار',
    expiryDate: 'صالح حتى',
    to: 'مقدَّم إلى',
    attn: 'عناية',
    item: 'البند',
    description: 'الوصف',
    qty: 'الكمية',
    unitPrice: 'سعر الوحدة',
    discount: 'الخصم',
    tax: 'الضريبة',
    lineTotal: 'الإجمالي',
    subtotal: 'المجموع الفرعي',
    totalDiscount: 'إجمالي الخصم',
    totalTax: 'إجمالي الضريبة',
    grandTotal: 'الإجمالي النهائي',
    payment: 'جدول السداد',
    installment: 'الدفعة',
    percentage: 'النسبة',
    amount: 'المبلغ',
    dueDate: 'تاريخ الاستحقاق',
    terms: 'الشروط والأحكام',
    paymentTerms: 'شروط الدفع',
    executionTerms: 'شروط التنفيذ',
    notes: 'ملاحظات',
    preparedBy: 'أعدّه',
    approvedBy: 'اعتمده',
    signature: 'التوقيع والختم',
    clientSignature: 'توقيع العميل',
    taxNumber: 'الرقم الضريبي',
    page: 'صفحة',
    version: 'الإصدار',
  },
  en: {
    quotation: 'Quotation',
    number: 'Quotation No.',
    issueDate: 'Issue date',
    expiryDate: 'Valid until',
    to: 'Prepared for',
    attn: 'Attn',
    item: 'Item',
    description: 'Description',
    qty: 'Qty',
    unitPrice: 'Unit price',
    discount: 'Discount',
    tax: 'Tax',
    lineTotal: 'Total',
    subtotal: 'Subtotal',
    totalDiscount: 'Total discount',
    totalTax: 'Total tax',
    grandTotal: 'Grand total',
    payment: 'Payment schedule',
    installment: 'Installment',
    percentage: 'Percentage',
    amount: 'Amount',
    dueDate: 'Due date',
    terms: 'Terms & conditions',
    paymentTerms: 'Payment terms',
    executionTerms: 'Execution terms',
    notes: 'Notes',
    preparedBy: 'Prepared by',
    approvedBy: 'Approved by',
    signature: 'Signature & stamp',
    clientSignature: 'Client signature',
    taxNumber: 'Tax number',
    page: 'Page',
    version: 'Version',
  },
} as const;

export async function renderQuotationHtml(id: string, lang: Lang = 'ar') {
  const q = await getQuotation(id);
  const t = T[lang];
  const money = (v: bigint | number) => formatMoney(v, q.currency, lang, { withSymbol: false });

  const clientName = q.client
    ? q.client.brandName || q.client.legalName
    : q.lead
      ? q.lead.fullName
      : '—';

  const itemsHtml = q.items
    .map(
      (item, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>
          <div class="strong">${esc(lang === 'ar' ? item.nameAr : item.nameEn || item.nameAr)}</div>
          ${item.description ? `<div class="muted">${esc(item.description)}</div>` : ''}
        </td>
        <td class="c num">${esc(Number(item.quantity))}</td>
        <td class="e num">${money(item.unitPriceMinor)}</td>
        <td class="e num">${item.discountMinor > 0n ? money(item.discountMinor) : '—'}</td>
        <td class="e num">${item.taxMinor > 0n ? money(item.taxMinor) : '—'}</td>
        <td class="e num strong">${money(item.totalMinor)}</td>
      </tr>`,
    )
    .join('');

  const installmentsHtml = q.installments.length
    ? `
    <section class="block">
      <h2>${t.payment}</h2>
      <table class="table">
        <thead>
          <tr>
            <th>${t.installment}</th>
            <th class="c">${t.percentage}</th>
            <th class="e">${t.amount}</th>
            <th class="e">${t.dueDate}</th>
          </tr>
        </thead>
        <tbody>
          ${q.installments
            .map(
              (inst) => `
            <tr>
              <td>${esc(inst.label)}</td>
              <td class="c num">${Number(inst.percentage)}%</td>
              <td class="e num">${money(inst.amountMinor)} ${esc(currencySymbol(q.currency, lang))}</td>
              <td class="e num">${inst.dueDate ? formatDate(inst.dueDate, lang) : '—'}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </section>`
    : '';

  const terms = lang === 'ar' ? q.termsAr : q.termsEn;

  const statusWatermark =
    q.status === 'DRAFT'
      ? { text: lang === 'ar' ? 'مسودة' : 'DRAFT', tone: 'neutral' as const }
      : q.status === 'REJECTED' || q.status === 'EXPIRED'
        ? { text: lang === 'ar' ? 'غير سارٍ' : 'VOID', tone: 'danger' as const }
        : undefined;

  return documentShell({
    lang,
    title: q.number,
    docTitle: t.quotation,
    footerNote: q.number,
    watermark: statusWatermark,
    metaRows: [
      { label: t.number, value: q.number, num: true },
      ...(q.version > 1 ? [{ label: t.version, value: String(q.version), num: true }] : []),
      { label: t.issueDate, value: formatDate(q.issueDate, lang), num: true },
      { label: t.expiryDate, value: formatDate(q.expiryDate, lang), num: true },
    ],
    body: `
<div class="cards">
  <div class="card">
    <h3>${t.to}</h3>
    <div class="name">${esc(clientName)}</div>
    ${q.client?.legalName && q.client.brandName ? `<div class="line">${esc(q.client.legalName)}</div>` : ''}
    ${q.client?.address ? `<div class="line">${esc(q.client.address)}</div>` : ''}
    ${q.client?.taxNumber ? `<div class="line">${t.taxNumber}: <span class="num">${esc(q.client.taxNumber)}</span></div>` : ''}
    ${q.contact ? `<div class="line">${t.attn}: ${esc(q.contact.name)}${q.contact.position ? ` — ${esc(q.contact.position)}` : ''}</div>` : ''}
  </div>
  <div class="card">
    <h3>${t.preparedBy}</h3>
    <div class="name">${esc(q.preparedBy.name)}</div>
    ${q.approvedBy ? `<div class="line">${t.approvedBy}: ${esc(q.approvedBy.name)}</div>` : ''}
    ${q.paymentTerms ? `<div class="line">${t.paymentTerms}: ${esc(q.paymentTerms)}</div>` : ''}
  </div>
</div>

<table class="table">
  <thead>
    <tr>
      <th class="c" style="width:26px">#</th>
      <th>${t.item}</th>
      <th class="c" style="width:52px">${t.qty}</th>
      <th class="e" style="width:78px">${t.unitPrice}</th>
      <th class="e" style="width:70px">${t.discount}</th>
      <th class="e" style="width:70px">${t.tax}</th>
      <th class="e" style="width:82px">${t.lineTotal}</th>
    </tr>
  </thead>
  <tbody>${itemsHtml}</tbody>
</table>

<div class="totals">
  <table>
    <tr><td>${t.subtotal}</td><td class="e num">${money(q.subtotalMinor)} ${esc(currencySymbol(q.currency, lang))}</td></tr>
    ${q.discountMinor > 0n ? `<tr><td>${t.totalDiscount}</td><td class="e num">− ${money(q.discountMinor)}</td></tr>` : ''}
    ${q.taxMinor > 0n ? `<tr><td>${t.totalTax}</td><td class="e num">${money(q.taxMinor)}</td></tr>` : ''}
    <tr class="grand"><td>${t.grandTotal}</td><td class="e num">${money(q.totalMinor)} ${esc(currencySymbol(q.currency, lang))}</td></tr>
  </table>
</div>

${installmentsHtml}

${q.executionTerms ? `<section class="block"><h2>${t.executionTerms}</h2><p>${esc(q.executionTerms)}</p></section>` : ''}
${terms ? `<section class="block"><h2>${t.terms}</h2><p>${esc(terms)}</p></section>` : ''}
${q.notes ? `<section class="block"><h2>${t.notes}</h2><p>${esc(q.notes)}</p></section>` : ''}

<div class="sign">
  <div><div class="line">${t.signature}</div></div>
  <div><div class="line">${t.clientSignature}</div></div>
</div>`,
  });
}

export async function renderQuotationPdf(id: string, lang: Lang = 'ar') {
  const user = await requireUser();
  const html = await renderQuotationHtml(id, lang);
  const pdf = await htmlToPdf(html);
  await audit({
    userId: user.id,
    action: 'EXPORT',
    module: 'quotations',
    entityType: 'QUOTATION',
    entityId: id,
    summary: `تصدير عرض السعر إلى PDF (${lang})`,
  });
  return pdf;
}

import 'server-only';
import { getQuotation } from './quotations';
import { getSettings } from './settings';
import { fontFaceCss, htmlToPdf } from './pdf';
import { formatMoney, formatDate, currencySymbol } from '@/lib/format';
import { audit } from './audit';
import { requireUser } from '@/server/auth/guard';

type Lang = 'ar' | 'en';

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

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function renderQuotationHtml(id: string, lang: Lang = 'ar') {
  const q = await getQuotation(id);
  const settings = await getSettings();
  const t = T[lang];
  const rtl = lang === 'ar';
  const fonts = await fontFaceCss();
  const money = (v: bigint | number) => formatMoney(v, q.currency, lang, { withSymbol: false });
  const company = settings.company;

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

  return `<!doctype html>
<html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8" />
<title>${esc(q.number)}</title>
<style>
${fonts}
* { box-sizing: border-box; }
body {
  font-family: 'Cairo', system-ui, sans-serif;
  margin: 0; color: #10233D; font-size: 11px; line-height: 1.7;
  direction: ${rtl ? 'rtl' : 'ltr'};
}
.num { font-variant-numeric: tabular-nums; }
header.doc {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 18px;
  border-bottom: 3px solid #2C7BE5; padding-bottom: 12px; margin-bottom: 16px;
}
.brand { display: flex; align-items: center; gap: 10px; }
.brand-mark { width: 42px; height: 42px; }
.brand h1 { margin: 0; font-size: 17px; font-weight: 800; letter-spacing: -.3px; }
.brand p { margin: 2px 0 0; font-size: 10px; color: #5C7189; }
.doc-meta { text-align: ${rtl ? 'left' : 'right'}; }
.doc-meta .title {
  font-size: 20px; font-weight: 800; color: #2C7BE5; margin: 0 0 4px;
}
.doc-meta .row { font-size: 10.5px; color: #5C7189; }
.doc-meta .row b { color: #10233D; }
.cards { display: flex; gap: 12px; margin-bottom: 14px; }
.card {
  flex: 1; border: 1px solid #DCE4EE; border-radius: 8px; padding: 10px 12px; background: #F8FAFD;
}
.card h3 { margin: 0 0 6px; font-size: 10px; color: #5C7189; font-weight: 700; letter-spacing: .4px; }
.card .name { font-size: 12.5px; font-weight: 700; }
.card .line { font-size: 10.5px; color: #5C7189; }
.table { width: 100%; border-collapse: collapse; margin-top: 6px; }
.table thead th {
  background: #10233D; color: #fff; font-size: 10px; font-weight: 700;
  padding: 7px 8px; text-align: ${rtl ? 'right' : 'left'};
}
.table tbody td { padding: 7px 8px; border-bottom: 1px solid #E6ECF4; vertical-align: top; }
.table tbody tr:nth-child(even) { background: #FAFCFF; }
.c { text-align: center; }
.e { text-align: ${rtl ? 'left' : 'right'}; }
.strong { font-weight: 700; }
.muted { color: #5C7189; font-size: 10px; }
.totals { margin-top: 12px; display: flex; justify-content: ${rtl ? 'flex-start' : 'flex-end'}; }
.totals table { width: 46%; border-collapse: collapse; }
.totals td { padding: 5px 8px; font-size: 11px; }
.totals tr.grand td {
  background: #2C7BE5; color: #fff; font-size: 13px; font-weight: 800; border-radius: 4px;
}
.block { margin-top: 16px; page-break-inside: avoid; }
.block h2 {
  font-size: 11.5px; margin: 0 0 6px; color: #2C7BE5; font-weight: 800;
  border-inline-start: 3px solid #3FC8F5; padding-inline-start: 7px;
}
.block p { margin: 0; white-space: pre-wrap; font-size: 10.5px; color: #33465E; }
.sign { display: flex; gap: 40px; margin-top: 34px; page-break-inside: avoid; }
.sign div { flex: 1; }
.sign .line { border-top: 1px solid #9AA9BC; margin-top: 42px; padding-top: 5px; font-size: 10px; color: #5C7189; }
footer.doc {
  margin-top: 22px; border-top: 1px solid #DCE4EE; padding-top: 8px;
  font-size: 9.5px; color: #7C8BA1; display: flex; justify-content: space-between;
}
</style>
</head>
<body>
<header class="doc">
  <div class="brand">
    <svg class="brand-mark" viewBox="0 0 64 64">
      <circle cx="25" cy="26" r="19" fill="#F5333F"/>
      <circle cx="40" cy="35" r="19" fill="#3FC8F5"/>
      <path d="M30 34c3-6 9-9 15-9-2 5-6 9-11 11l3 5-6-2-4 4 1-6-5-1z" fill="#0B1A2F"/>
    </svg>
    <div>
      <h1>${esc(lang === 'ar' ? company.nameAr : company.nameEn)}</h1>
      <p>${esc(lang === 'ar' ? company.addressAr : company.addressEn)}</p>
      <p>${esc(company.phone)}${company.email ? ` · ${esc(company.email)}` : ''}</p>
      ${company.taxNumber ? `<p>${t.taxNumber}: ${esc(company.taxNumber)}</p>` : ''}
    </div>
  </div>
  <div class="doc-meta">
    <p class="title">${t.quotation}</p>
    <div class="row"><b>${t.number}:</b> <span class="num">${esc(q.number)}</span></div>
    ${q.version > 1 ? `<div class="row"><b>${t.version}:</b> <span class="num">${q.version}</span></div>` : ''}
    <div class="row"><b>${t.issueDate}:</b> <span class="num">${formatDate(q.issueDate, lang)}</span></div>
    <div class="row"><b>${t.expiryDate}:</b> <span class="num">${formatDate(q.expiryDate, lang)}</span></div>
  </div>
</header>

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
  <div><div class="line">${t.signature} — ${esc(lang === 'ar' ? company.nameAr : company.nameEn)}</div></div>
  <div><div class="line">${t.clientSignature}</div></div>
</div>

<footer class="doc">
  <span>${esc(lang === 'ar' ? company.nameAr : company.nameEn)}${company.website ? ` · ${esc(company.website)}` : ''}</span>
  <span class="num">${esc(q.number)}</span>
</footer>
</body>
</html>`;
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

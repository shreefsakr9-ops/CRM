import 'server-only';
import { getInvoice } from './invoices';
import { getSettings } from './settings';
import { htmlToPdf } from './pdf';
import { documentShell, esc, type Lang } from './pdf-layout';
import { formatMoney, formatDate, currencySymbol } from '@/lib/format';
import { audit } from './audit';
import { requireUser } from '@/server/auth/guard';
import { INVOICE_STATUS, PAYMENT_METHOD } from '@/i18n/labels';

const T = {
  ar: {
    invoice: 'فاتورة',
    number: 'رقم الفاتورة',
    issueDate: 'تاريخ الإصدار',
    dueDate: 'تاريخ الاستحقاق',
    status: 'الحالة',
    billTo: 'الفاتورة إلى',
    reference: 'مرجع الفاتورة',
    project: 'المشروع',
    contract: 'العقد',
    quotation: 'عرض السعر',
    item: 'البند',
    qty: 'الكمية',
    unitPrice: 'سعر الوحدة',
    discount: 'الخصم',
    tax: 'الضريبة',
    lineTotal: 'الإجمالي',
    subtotal: 'المجموع الفرعي',
    totalDiscount: 'إجمالي الخصم',
    totalTax: 'إجمالي الضريبة',
    grandTotal: 'إجمالي الفاتورة',
    paid: 'المدفوع',
    due: 'المتبقي',
    payments: 'الدفعات المسجَّلة',
    date: 'التاريخ',
    method: 'الوسيلة',
    amount: 'المبلغ',
    ref: 'المرجع',
    recordedBy: 'سجّلها',
    bankDetails: 'بيانات السداد',
    notes: 'ملاحظات',
    taxNumber: 'الرقم الضريبي',
    paidStamp: 'مدفوعة',
    draftStamp: 'مسودة',
    cancelledStamp: 'ملغاة',
    overdueNotice: 'هذه الفاتورة تجاوزت تاريخ الاستحقاق. برجاء سداد المبلغ المتبقي في أقرب وقت.',
    draftNotice: 'مسودة داخلية غير صالحة للمطالبة بالسداد — لم تُرسل للعميل بعد.',
    cancelledNotice: 'هذه الفاتورة ملغاة ولا يترتب عليها أي التزام مالي.',
    cancelReason: 'سبب الإلغاء',
  },
  en: {
    invoice: 'Invoice',
    number: 'Invoice No.',
    issueDate: 'Issue date',
    dueDate: 'Due date',
    status: 'Status',
    billTo: 'Bill to',
    reference: 'Reference',
    project: 'Project',
    contract: 'Contract',
    quotation: 'Quotation',
    item: 'Item',
    qty: 'Qty',
    unitPrice: 'Unit price',
    discount: 'Discount',
    tax: 'Tax',
    lineTotal: 'Total',
    subtotal: 'Subtotal',
    totalDiscount: 'Total discount',
    totalTax: 'Total tax',
    grandTotal: 'Invoice total',
    paid: 'Paid',
    due: 'Balance due',
    payments: 'Recorded payments',
    date: 'Date',
    method: 'Method',
    amount: 'Amount',
    ref: 'Reference',
    recordedBy: 'Recorded by',
    bankDetails: 'Payment details',
    notes: 'Notes',
    taxNumber: 'Tax number',
    paidStamp: 'PAID',
    draftStamp: 'DRAFT',
    cancelledStamp: 'CANCELLED',
    overdueNotice: 'This invoice is past its due date. Please settle the outstanding balance as soon as possible.',
    draftNotice: 'Internal draft — not a payment request and not yet sent to the client.',
    cancelledNotice: 'This invoice is cancelled and carries no financial obligation.',
    cancelReason: 'Cancellation reason',
  },
} as const;

export async function renderInvoiceHtml(id: string, lang: Lang = 'ar') {
  const inv = await getInvoice(id);
  const settings = await getSettings();
  const t = T[lang];
  const money = (v: bigint | number) => formatMoney(v, inv.currency, lang, { withSymbol: false });
  const symbol = esc(currencySymbol(inv.currency, lang));

  const dueMinor = inv.totalMinor - inv.paidMinor;
  const clientName = inv.client.brandName || inv.client.legalName;

  const itemsHtml = inv.items
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

  // الدفعات تظهر في الفاتورة نفسها حتى يرى العميل ما سُجِّل له بالفعل.
  const paymentsHtml = inv.payments.length
    ? `
    <section class="block">
      <h2>${t.payments}</h2>
      <table class="table">
        <thead>
          <tr>
            <th>${t.date}</th>
            <th>${t.method}</th>
            <th>${t.ref}</th>
            <th class="e">${t.amount}</th>
          </tr>
        </thead>
        <tbody>
          ${inv.payments
            .map(
              (p) => `
            <tr>
              <td class="num">${formatDate(p.paidAt, lang)}</td>
              <td>${esc(PAYMENT_METHOD[p.method]?.[lang] ?? p.method)}</td>
              <td>${p.reference ? `<span class="num">${esc(p.reference)}</span>` : '—'}</td>
              <td class="e num strong">${money(p.amountMinor)} ${symbol}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </section>`
    : '';

  // بيانات السداد تُقرأ من إعدادات الشركة — لا قيم ثابتة داخل الكود.
  const bank = settings.company.bankDetails;
  const bankHtml = bank
    ? `<section class="block"><h2>${t.bankDetails}</h2><p>${esc(bank)}</p></section>`
    : '';

  const notice =
    inv.status === 'DRAFT'
      ? t.draftNotice
      : inv.status === 'CANCELLED'
        ? `${t.cancelledNotice}${inv.cancelReason ? ` — ${t.cancelReason}: ${inv.cancelReason}` : ''}`
        : inv.status === 'OVERDUE'
          ? t.overdueNotice
          : null;

  // المستند غير النهائي يحمل ختمًا واضحًا حتى لا يُستخدم كمطالبة سداد صحيحة.
  const watermark =
    inv.status === 'DRAFT'
      ? { text: t.draftStamp, tone: 'neutral' as const }
      : inv.status === 'CANCELLED'
        ? { text: t.cancelledStamp, tone: 'danger' as const }
        : inv.status === 'PAID'
          ? { text: t.paidStamp, tone: 'ok' as const }
          : undefined;

  const references: { label: string; value: string }[] = [];
  if (inv.project) references.push({ label: t.project, value: inv.project.name });
  if (inv.contract) references.push({ label: t.contract, value: inv.contract.number });
  if (inv.quotation) references.push({ label: t.quotation, value: inv.quotation.number });
  if (inv.paymentMethod) {
    references.push({
      label: t.method,
      value: PAYMENT_METHOD[inv.paymentMethod]?.[lang] ?? inv.paymentMethod,
    });
  }

  return documentShell({
    lang,
    title: inv.number,
    docTitle: t.invoice,
    footerNote: inv.number,
    watermark,
    metaRows: [
      { label: t.number, value: inv.number, num: true },
      { label: t.issueDate, value: formatDate(inv.issueDate, lang), num: true },
      { label: t.dueDate, value: formatDate(inv.dueDate, lang), num: true },
      { label: t.status, value: INVOICE_STATUS[inv.status]?.[lang] ?? inv.status },
    ],
    body: `
<div class="cards">
  <div class="card">
    <h3>${t.billTo}</h3>
    <div class="name">${esc(clientName)}</div>
    ${inv.client.brandName ? `<div class="line">${esc(inv.client.legalName)}</div>` : ''}
    ${inv.client.address ? `<div class="line">${esc(inv.client.address)}</div>` : ''}
    ${inv.client.taxNumber ? `<div class="line">${t.taxNumber}: <span class="num">${esc(inv.client.taxNumber)}</span></div>` : ''}
  </div>
  ${
    references.length
      ? `<div class="card">
    <h3>${t.reference}</h3>
    ${references.map((r) => `<div class="line">${esc(r.label)}: <b>${esc(r.value)}</b></div>`).join('\n    ')}
  </div>`
      : ''
  }
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
    <tr><td>${t.subtotal}</td><td class="e num">${money(inv.subtotalMinor)} ${symbol}</td></tr>
    ${inv.discountMinor > 0n ? `<tr><td>${t.totalDiscount}</td><td class="e num">− ${money(inv.discountMinor)}</td></tr>` : ''}
    ${inv.taxMinor > 0n ? `<tr><td>${t.totalTax}</td><td class="e num">${money(inv.taxMinor)}</td></tr>` : ''}
    <tr class="grand"><td>${t.grandTotal}</td><td class="e num">${money(inv.totalMinor)} ${symbol}</td></tr>
    ${inv.paidMinor > 0n ? `<tr class="sep"><td>${t.paid}</td><td class="e num">− ${money(inv.paidMinor)} ${symbol}</td></tr>` : ''}
    ${dueMinor > 0n ? `<tr class="due"><td>${t.due}</td><td class="e num">${money(dueMinor)} ${symbol}</td></tr>` : ''}
  </table>
</div>

${notice ? `<div class="notice">${esc(notice)}</div>` : ''}
${paymentsHtml}
${bankHtml}
${inv.notes ? `<section class="block"><h2>${t.notes}</h2><p>${esc(inv.notes)}</p></section>` : ''}`,
  });
}

export async function renderInvoicePdf(id: string, lang: Lang = 'ar') {
  const user = await requireUser();
  const html = await renderInvoiceHtml(id, lang);
  const pdf = await htmlToPdf(html);
  await audit({
    userId: user.id,
    action: 'EXPORT',
    module: 'invoices',
    entityType: 'INVOICE',
    entityId: id,
    summary: `تصدير الفاتورة إلى PDF (${lang})`,
  });
  return pdf;
}

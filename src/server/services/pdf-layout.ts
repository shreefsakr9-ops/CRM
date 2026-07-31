import 'server-only';
import { getSettings } from './settings';
import { fontFaceCss, logoDataUri } from './pdf';

/**
 * الهيكل المشترك لكل مستندات الـPDF (عرض سعر، فاتورة، ملخص عقد).
 * الهدف: هوية بصرية واحدة وقاعدة CSS واحدة — أي تعديل في الشكل يتم هنا مرة واحدة.
 */

export type Lang = 'ar' | 'en';

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface MetaRow {
  label: string;
  value: string;
  /** يعرض القيمة بأرقام جدولية (للأرقام والتواريخ) */
  num?: boolean;
}

export interface ShellParams {
  lang: Lang;
  /** عنوان النافذة/الملف */
  title: string;
  /** العنوان الكبير أعلى المستند: «فاتورة» / «عرض سعر» */
  docTitle: string;
  metaRows: MetaRow[];
  body: string;
  /** رقم المستند في التذييل */
  footerNote?: string;
  /**
   * ختم مائل عبر الصفحة — إلزامي لأي مستند غير نهائي (مسودة، ملغاة).
   * بدونه قد تُستخدم مسودة فاتورة كأنها فاتورة صحيحة.
   */
  watermark?: { text: string; tone: 'neutral' | 'danger' | 'ok' };
}

const LABEL = {
  ar: { taxNumber: 'الرقم الضريبي' },
  en: { taxNumber: 'Tax number' },
} as const;

export async function documentShell(params: ShellParams): Promise<string> {
  const settings = await getSettings();
  const company = settings.company;
  const { lang } = params;
  const rtl = lang === 'ar';
  const fonts = await fontFaceCss();
  const logo = await logoDataUri();
  const t = LABEL[lang];

  const watermarkColor =
    params.watermark?.tone === 'danger'
      ? 'rgba(226, 62, 62, 0.18)'
      : params.watermark?.tone === 'ok'
        ? 'rgba(28, 160, 106, 0.16)'
        : 'rgba(92, 113, 137, 0.18)';

  return `<!doctype html>
<html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8" />
<title>${esc(params.title)}</title>
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
.brand-mark { width: 42px; height: 42px; object-fit: contain; }
.brand h1 { margin: 0; font-size: 17px; font-weight: 800; letter-spacing: -.3px; }
.brand p { margin: 2px 0 0; font-size: 10px; color: #5C7189; }
.doc-meta { text-align: ${rtl ? 'left' : 'right'}; }
.doc-meta .title { font-size: 20px; font-weight: 800; color: #2C7BE5; margin: 0 0 4px; }
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
.totals tr.due td { background: #10233D; color: #fff; font-size: 12.5px; font-weight: 800; border-radius: 4px; }
.totals tr.sep td { border-top: 1px solid #DCE4EE; }
.block { margin-top: 16px; page-break-inside: avoid; }
.block h2 {
  font-size: 11.5px; margin: 0 0 6px; color: #2C7BE5; font-weight: 800;
  border-inline-start: 3px solid #3FC8F5; padding-inline-start: 7px;
}
.block p { margin: 0; white-space: pre-wrap; font-size: 10.5px; color: #33465E; }
.sign { display: flex; gap: 40px; margin-top: 34px; page-break-inside: avoid; }
.sign div { flex: 1; }
.sign .line { border-top: 1px solid #9AA9BC; margin-top: 42px; padding-top: 5px; font-size: 10px; color: #5C7189; }
.notice {
  margin-top: 14px; border: 1px solid #DCE4EE; border-inline-start: 3px solid #F0A93B;
  background: #FFFBF3; border-radius: 6px; padding: 8px 11px; font-size: 10px; color: #5C4527;
}
footer.doc {
  margin-top: 22px; border-top: 1px solid #DCE4EE; padding-top: 8px;
  font-size: 9.5px; color: #7C8BA1; display: flex; justify-content: space-between;
}
.watermark {
  position: fixed; top: 42%; inset-inline-start: 0; width: 100%; text-align: center;
  font-size: 88px; font-weight: 900; letter-spacing: 6px; transform: rotate(-24deg);
  color: ${watermarkColor}; z-index: 0; pointer-events: none;
}
body > *:not(.watermark) { position: relative; z-index: 1; }
</style>
</head>
<body>
${params.watermark ? `<div class="watermark">${esc(params.watermark.text)}</div>` : ''}
<header class="doc">
  <div class="brand">
    <img class="brand-mark" src="${logo}" alt="" />
    <div>
      <h1>${esc(lang === 'ar' ? company.nameAr : company.nameEn)}</h1>
      <p>${esc(lang === 'ar' ? company.addressAr : company.addressEn)}</p>
      <p>${esc(company.phone)}${company.email ? ` · ${esc(company.email)}` : ''}</p>
      ${company.taxNumber ? `<p>${t.taxNumber}: ${esc(company.taxNumber)}</p>` : ''}
    </div>
  </div>
  <div class="doc-meta">
    <p class="title">${esc(params.docTitle)}</p>
    ${params.metaRows
      .map(
        (row) =>
          `<div class="row"><b>${esc(row.label)}:</b> <span${row.num ? ' class="num"' : ''}>${esc(row.value)}</span></div>`,
      )
      .join('\n    ')}
  </div>
</header>

${params.body}

<footer class="doc">
  <span>${esc(lang === 'ar' ? company.nameAr : company.nameEn)}${company.website ? ` · ${esc(company.website)}` : ''}</span>
  <span class="num">${esc(params.footerNote ?? '')}</span>
</footer>
</body>
</html>`;
}

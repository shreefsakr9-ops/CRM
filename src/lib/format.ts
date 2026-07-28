export type Locale = 'ar' | 'en';

const CURRENCY_DECIMALS: Record<string, number> = { EGP: 2, SAR: 2, USD: 2, AED: 2, KWD: 3 };

export function currencyDecimals(code: string) {
  return CURRENCY_DECIMALS[code] ?? 2;
}

/** يعرض مبلغًا مخزَّنًا بوحدة العملة الصغرى. لا يستخدم القسمة العائمة في التحويل. */
export function formatMoney(
  minor: number | bigint,
  currency = 'EGP',
  locale: Locale = 'ar',
  opts: { compact?: boolean; withSymbol?: boolean } = {},
): string {
  const decimals = currencyDecimals(currency);
  const bi = typeof minor === 'bigint' ? minor : BigInt(Math.round(minor));
  const neg = bi < 0n;
  const abs = neg ? -bi : bi;
  const factor = 10n ** BigInt(decimals);
  const int = abs / factor;
  const frac = (abs % factor).toString().padStart(decimals, '0');

  const nf = new Intl.NumberFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', {
    maximumFractionDigits: 0,
    notation: opts.compact ? 'compact' : 'standard',
  });

  const intStr = nf.format(Number(int));
  const body = opts.compact ? intStr : `${intStr}.${frac}`;
  const sign = neg ? '-' : '';
  if (opts.withSymbol === false) return `${sign}${body}`;
  return `${sign}${body} ${currencySymbol(currency, locale)}`;
}

export function currencySymbol(code: string, locale: Locale = 'ar') {
  const map: Record<string, [string, string]> = {
    EGP: ['ج.م', 'EGP'],
    SAR: ['ر.س', 'SAR'],
    USD: ['$', 'USD'],
    AED: ['د.إ', 'AED'],
    KWD: ['د.ك', 'KWD'],
  };
  const entry = map[code] ?? [code, code];
  return locale === 'ar' ? entry[0] : entry[1];
}

export function formatNumber(value: number, locale: Locale = 'ar', digits = 0) {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(value: number | null, locale: Locale = 'ar', digits = 1) {
  if (value === null || Number.isNaN(value)) return '—';
  return `${formatNumber(value, locale, digits)}%`;
}

export function formatDate(
  value: Date | string | null | undefined,
  locale: Locale = 'ar',
  timezone = 'Africa/Cairo',
  withTime = false,
): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: timezone,
  }).format(d);
}

export function formatDateInput(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

export function formatRelative(value: Date | string | null | undefined, locale: Locale = 'ar') {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  const diff = d.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar-EG' : 'en', { numeric: 'auto' });
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return rtf.format(Math.round(diff / 1000), 'second');
}

export function formatDuration(minutes: number, locale: Locale = 'ar') {
  if (!minutes) return locale === 'ar' ? '٠ د' : '0m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (locale === 'ar') return `${h ? `${formatNumber(h)} س ` : ''}${m ? `${formatNumber(m)} د` : ''}`.trim();
  return `${h ? `${h}h ` : ''}${m ? `${m}m` : ''}`.trim();
}

export function daysBetween(a: Date | string, b: Date | string = new Date()) {
  const d1 = typeof a === 'string' ? new Date(a) : a;
  const d2 = typeof b === 'string' ? new Date(b) : b;
  return Math.round((d1.getTime() - d2.getTime()) / 86_400_000);
}

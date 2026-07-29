/**
 * كل الحسابات المالية هنا. القاعدة: أعداد صحيحة فقط (BigInt) بوحدة العملة الصغرى.
 * لا Floating Point في أي خطوة — لا في السطر ولا في الإجمالي ولا في الأقساط.
 *
 * دلالات discountValue:
 *   PERCENT → نسبة مئوية (مثال 10.5 = 10.5%)
 *   AMOUNT  → مبلغ بوحدة العملة الصغرى (مثال 5000 = 50.00 ج.م)
 */

export type DiscountKind = 'NONE' | 'PERCENT' | 'AMOUNT';

/** دقة الكميات والنسب: 4 خانات عشرية → معامل 10^4 */
export const SCALE = 10_000n;

/** يحوّل رقمًا عشريًا (كمية/نسبة) إلى عدد صحيح مقيس بدقة 4 خانات، بتقريب half-up. */
export function toScaled(value: number | string): bigint {
  const s = String(value).trim();
  if (!/^-?\d*(\.\d*)?$/.test(s) || s === '' || s === '-') {
    throw new Error(`قيمة رقمية غير صالحة: ${value}`);
  }
  const neg = s.startsWith('-');
  const [intPart = '0', fracRaw = ''] = (neg ? s.slice(1) : s).split('.');
  const frac = (fracRaw + '00000').slice(0, 5); // خانة إضافية للتقريب
  const base = BigInt(intPart || '0') * SCALE + BigInt(frac.slice(0, 4) || '0');
  const roundUp = Number(frac[4] ?? '0') >= 5;
  const result = base + (roundUp ? 1n : 0n);
  return neg ? -result : result;
}

export function fromScaled(value: bigint, decimals = 4): string {
  const neg = value < 0n;
  const v = neg ? -value : value;
  const int = v / SCALE;
  const frac = (v % SCALE).toString().padStart(4, '0').slice(0, decimals);
  return `${neg ? '-' : ''}${int}${decimals > 0 ? '.' + frac : ''}`;
}

/** (a × b) ÷ d بتقريب half-up على الأعداد الصحيحة. */
export function mulDivRound(a: bigint, b: bigint, d: bigint): bigint {
  if (d === 0n) throw new Error('قسمة على صفر في حساب مالي');
  const neg = (a < 0n) !== (b < 0n) !== (d < 0n);
  const A = a < 0n ? -a : a;
  const B = b < 0n ? -b : b;
  const D = d < 0n ? -d : d;
  const res = (A * B * 2n + D) / (D * 2n);
  return neg ? -res : res;
}

/** يحوّل نصًا بوحدة العملة الكبرى (مثل "1250.75") إلى وحدة صغرى (125075). */
export function parseAmountToMinor(value: number | string, decimals = 2): bigint {
  const scaled = toScaled(value);
  const factor = 10n ** BigInt(decimals);
  return mulDivRound(scaled, factor, SCALE);
}

/** يحوّل وحدة صغرى إلى نص بوحدة كبرى (بدون Floating Point). */
export function minorToDecimalString(minor: bigint, decimals = 2): string {
  const neg = minor < 0n;
  const v = neg ? -minor : minor;
  const factor = 10n ** BigInt(decimals);
  const int = v / factor;
  const frac = (v % factor).toString().padStart(decimals, '0');
  return `${neg ? '-' : ''}${int}${decimals > 0 ? '.' + frac : ''}`;
}

export interface LineInput {
  /** الكمية كنص/رقم — تُقاس داخليًا بدقة 4 خانات */
  quantity: number | string;
  /** سعر الوحدة بوحدة العملة الصغرى */
  unitPriceMinor: bigint;
  discountType?: DiscountKind;
  /** نسبة أو مبلغ حسب discountType */
  discountValue?: number | string;
  /** نسبة الضريبة المئوية، مثال 14 = 14% */
  taxRate?: number | string;
}

export interface LineTotals {
  subtotalMinor: bigint;
  discountMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
}

export function computeLine(input: LineInput): LineTotals {
  const qty = toScaled(input.quantity);
  if (qty < 0n) throw new Error('الكمية لا يمكن أن تكون سالبة');
  if (input.unitPriceMinor < 0n) throw new Error('سعر الوحدة لا يمكن أن يكون سالبًا');

  const subtotal = mulDivRound(input.unitPriceMinor, qty, SCALE);

  let discount = 0n;
  const kind = input.discountType ?? 'NONE';
  if (kind === 'PERCENT') {
    const pct = toScaled(input.discountValue ?? 0);
    if (pct < 0n || pct > 100n * SCALE) throw new Error('نسبة الخصم يجب أن تكون بين 0 و 100');
    discount = mulDivRound(subtotal, pct, 100n * SCALE);
  } else if (kind === 'AMOUNT') {
    discount = BigInt(Math.trunc(Number(input.discountValue ?? 0)));
    if (discount < 0n) throw new Error('مبلغ الخصم لا يمكن أن يكون سالبًا');
  }
  if (discount > subtotal) discount = subtotal;

  const net = subtotal - discount;
  const rate = toScaled(input.taxRate ?? 0);
  if (rate < 0n) throw new Error('نسبة الضريبة لا يمكن أن تكون سالبة');
  const tax = mulDivRound(net, rate, 100n * SCALE);

  return { subtotalMinor: subtotal, discountMinor: discount, taxMinor: tax, totalMinor: net + tax };
}

export interface DocumentInput {
  lines: LineInput[];
  headerDiscountType?: DiscountKind;
  headerDiscountValue?: number | string;
}

export interface DocumentTotals extends LineTotals {
  lines: LineTotals[];
  headerDiscountMinor: bigint;
}

/**
 * خصم الرأس (على مستوى المستند) يُوزَّع على السطور بالتناسب قبل الضريبة،
 * والفرق الناتج عن التقريب يُسوَّى على آخر سطر حتى يبقى المجموع مطابقًا تمامًا.
 */
export function computeDocument(input: DocumentInput): DocumentTotals {
  const base = input.lines.map((l) => computeLine(l));
  const netBeforeHeader = base.reduce((s, l) => s + l.subtotalMinor - l.discountMinor, 0n);

  let headerDiscount = 0n;
  const kind = input.headerDiscountType ?? 'NONE';
  if (kind === 'PERCENT') {
    const pct = toScaled(input.headerDiscountValue ?? 0);
    if (pct < 0n || pct > 100n * SCALE) throw new Error('نسبة خصم المستند يجب أن تكون بين 0 و 100');
    headerDiscount = mulDivRound(netBeforeHeader, pct, 100n * SCALE);
  } else if (kind === 'AMOUNT') {
    headerDiscount = BigInt(Math.trunc(Number(input.headerDiscountValue ?? 0)));
  }
  if (headerDiscount < 0n) headerDiscount = 0n;
  if (headerDiscount > netBeforeHeader) headerDiscount = netBeforeHeader;

  const lines: LineTotals[] = [];
  let allocated = 0n;
  base.forEach((line, i) => {
    const lineNet = line.subtotalMinor - line.discountMinor;
    let share: bigint;
    if (headerDiscount === 0n || netBeforeHeader === 0n) {
      share = 0n;
    } else if (i === base.length - 1) {
      share = headerDiscount - allocated; // تسوية فرق التقريب على آخر سطر
    } else {
      share = mulDivRound(lineNet, headerDiscount, netBeforeHeader);
      allocated += share;
    }
    const netAfter = lineNet - share;
    const rate = toScaled(input.lines[i]?.taxRate ?? 0);
    const tax = mulDivRound(netAfter, rate, 100n * SCALE);
    lines.push({
      subtotalMinor: line.subtotalMinor,
      discountMinor: line.discountMinor + share,
      taxMinor: tax,
      totalMinor: netAfter + tax,
    });
  });

  return {
    lines,
    headerDiscountMinor: headerDiscount,
    subtotalMinor: lines.reduce((s, l) => s + l.subtotalMinor, 0n),
    discountMinor: lines.reduce((s, l) => s + l.discountMinor, 0n),
    taxMinor: lines.reduce((s, l) => s + l.taxMinor, 0n),
    totalMinor: lines.reduce((s, l) => s + l.totalMinor, 0n),
  };
}

/**
 * يوزّع مبلغًا على أقساط حسب نسب مئوية.
 * مجموع النسب يجب أن يساوي 100%، وفرق التقريب يُضاف لآخر قسط.
 */
export function splitInstallments(
  totalMinor: bigint,
  percentages: (number | string)[],
): bigint[] {
  if (percentages.length === 0) return [];
  const scaled = percentages.map((p) => toScaled(p));
  const sum = scaled.reduce((a, b) => a + b, 0n);
  if (sum !== 100n * SCALE) {
    throw new Error(`مجموع نسب الأقساط يجب أن يساوي 100% (الحالي ${fromScaled(sum, 2)}%)`);
  }
  const out: bigint[] = [];
  let allocated = 0n;
  scaled.forEach((pct, i) => {
    if (i === scaled.length - 1) {
      out.push(totalMinor - allocated);
    } else {
      const amt = mulDivRound(totalMinor, pct, 100n * SCALE);
      allocated += amt;
      out.push(amt);
    }
  });
  return out;
}

/** حساب الحالة المالية للفاتورة من المدفوعات. */
export function invoicePaymentState(totalMinor: bigint, paidMinor: bigint, dueDate: Date, now = new Date()) {
  if (paidMinor <= 0n) {
    return now > dueDate ? ('OVERDUE' as const) : ('SENT' as const);
  }
  if (paidMinor < totalMinor) {
    return now > dueDate ? ('OVERDUE' as const) : ('PARTIALLY_PAID' as const);
  }
  return 'PAID' as const;
}

/** مؤشرات التسويق مع حماية من القسمة على صفر. */
export type Metric = { value: number; sufficient: boolean };

const insufficient: Metric = { value: 0, sufficient: false };

export function cpl(adSpendMinor: bigint, leads: number): Metric {
  if (leads <= 0) return insufficient;
  return { value: Number(adSpendMinor) / 100 / leads, sufficient: true };
}

export function conversionRate(sales: number, leads: number): Metric {
  if (leads <= 0) return insufficient;
  return { value: (sales / leads) * 100, sufficient: true };
}

export function roas(revenueMinor: bigint, adSpendMinor: bigint): Metric {
  if (adSpendMinor <= 0n) return insufficient;
  return { value: Number(revenueMinor) / Number(adSpendMinor), sufficient: true };
}

/** الربح = الإيراد المعترف به − التكاليف المباشرة (والتكاليف غير المباشرة اختيارية). */
export function projectProfit(params: {
  recognizedRevenueMinor: bigint;
  directCostsMinor: bigint;
  indirectCostsMinor?: bigint;
  includeIndirect?: boolean;
}) {
  const indirect = params.includeIndirect ? (params.indirectCostsMinor ?? 0n) : 0n;
  const profitMinor = params.recognizedRevenueMinor - params.directCostsMinor - indirect;
  const marginPercent =
    params.recognizedRevenueMinor > 0n
      ? Number((profitMinor * 10000n) / params.recognizedRevenueMinor) / 100
      : null;
  return { profitMinor, marginPercent, includedIndirect: Boolean(params.includeIndirect) };
}

/** التوقع المرجّح = قيمة الصفقة × احتمالية الإغلاق. */
export function weightedForecast(valueMinor: bigint, probabilityPercent: number | string): bigint {
  return mulDivRound(valueMinor, toScaled(probabilityPercent), 100n * SCALE);
}

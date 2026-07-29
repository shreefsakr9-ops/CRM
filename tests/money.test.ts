import { describe, it, expect } from 'vitest';
import {
  computeLine,
  computeDocument,
  splitInstallments,
  invoicePaymentState,
  weightedForecast,
  projectProfit,
  cpl,
  conversionRate,
  roas,
  parseAmountToMinor,
  minorToDecimalString,
  toScaled,
  mulDivRound,
} from '@/server/services/money';

describe('التحويل بين الوحدات', () => {
  it('يحوّل النصوص العشرية إلى وحدة صغرى بدقة', () => {
    expect(parseAmountToMinor('1250.75')).toBe(125075n);
    expect(parseAmountToMinor('0.1')).toBe(10n);
    expect(parseAmountToMinor('0.005')).toBe(1n); // تقريب half-up
    expect(parseAmountToMinor('0.004')).toBe(0n);
  });

  it('يعيد التحويل بدون فقدان دقة', () => {
    expect(minorToDecimalString(125075n)).toBe('1250.75');
    expect(minorToDecimalString(5n)).toBe('0.05');
    expect(minorToDecimalString(-125075n)).toBe('-1250.75');
  });

  it('لا يقع في خطأ 0.1 + 0.2 الشهير للأعداد العائمة', () => {
    const a = parseAmountToMinor('0.1');
    const b = parseAmountToMinor('0.2');
    expect(minorToDecimalString(a + b)).toBe('0.30');
    // للمقارنة: العدد العائم يعطي 0.30000000000000004
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('mulDivRound يقرّب half-up', () => {
    expect(mulDivRound(5n, 1n, 2n)).toBe(3n); // 2.5 → 3
    expect(mulDivRound(3n, 1n, 2n)).toBe(2n); // 1.5 → 2
    expect(toScaled('12.34567')).toBe(123457n); // 4 خانات + تقريب
  });
});

describe('حساب السطر الواحد', () => {
  it('يحسب المجموع الفرعي والضريبة', () => {
    const line = computeLine({ quantity: 3, unitPriceMinor: 150000n, taxRate: 14 });
    expect(line.subtotalMinor).toBe(450000n); // 4500.00
    expect(line.discountMinor).toBe(0n);
    expect(line.taxMinor).toBe(63000n); // 630.00
    expect(line.totalMinor).toBe(513000n); // 5130.00
  });

  it('يطبّق خصمًا بالنسبة قبل الضريبة', () => {
    const line = computeLine({
      quantity: 1,
      unitPriceMinor: 100000n,
      discountType: 'PERCENT',
      discountValue: 10,
      taxRate: 14,
    });
    expect(line.discountMinor).toBe(10000n);
    expect(line.taxMinor).toBe(12600n); // 14% من 900.00
    expect(line.totalMinor).toBe(102600n);
  });

  it('يطبّق خصمًا بمبلغ ولا يتجاوز قيمة السطر', () => {
    const line = computeLine({
      quantity: 1,
      unitPriceMinor: 50000n,
      discountType: 'AMOUNT',
      discountValue: 80000,
    });
    expect(line.discountMinor).toBe(50000n);
    expect(line.totalMinor).toBe(0n);
  });

  it('يدعم الكميات الكسرية بدقة', () => {
    const line = computeLine({ quantity: '2.5', unitPriceMinor: 33333n });
    expect(line.subtotalMinor).toBe(83333n); // 2.5 × 333.33 = 833.325 → 833.33
  });

  it('يرفض القيم غير الصالحة', () => {
    expect(() => computeLine({ quantity: -1, unitPriceMinor: 100n })).toThrow();
    expect(() =>
      computeLine({ quantity: 1, unitPriceMinor: 100n, discountType: 'PERCENT', discountValue: 150 }),
    ).toThrow();
  });
});

describe('حساب المستند الكامل', () => {
  it('يجمع السطور بدقة', () => {
    const doc = computeDocument({
      lines: [
        { quantity: 2, unitPriceMinor: 150000n, taxRate: 14 },
        { quantity: 1, unitPriceMinor: 80000n, taxRate: 14 },
      ],
    });
    expect(doc.subtotalMinor).toBe(380000n);
    expect(doc.taxMinor).toBe(53200n);
    expect(doc.totalMinor).toBe(433200n);
  });

  it('يوزّع خصم المستند بالتناسب ويسوّي فرق التقريب على آخر سطر', () => {
    const doc = computeDocument({
      lines: [
        { quantity: 1, unitPriceMinor: 10000n },
        { quantity: 1, unitPriceMinor: 10000n },
        { quantity: 1, unitPriceMinor: 10000n },
      ],
      headerDiscountType: 'AMOUNT',
      headerDiscountValue: 100, // 1.00 على ثلاثة سطور — لا تقبل القسمة بالتساوي
    });
    expect(doc.discountMinor).toBe(100n);
    // المجموع يبقى مطابقًا تمامًا بلا سنت ضائع
    expect(doc.totalMinor).toBe(30000n - 100n);
    const sumLines = doc.lines.reduce((s, l) => s + l.totalMinor, 0n);
    expect(sumLines).toBe(doc.totalMinor);
  });

  it('يحسب الضريبة بعد خصم المستند وليس قبله', () => {
    const doc = computeDocument({
      lines: [{ quantity: 1, unitPriceMinor: 100000n, taxRate: 14 }],
      headerDiscountType: 'PERCENT',
      headerDiscountValue: 50,
    });
    expect(doc.discountMinor).toBe(50000n);
    expect(doc.taxMinor).toBe(7000n); // 14% من 500.00 وليس من 1000.00
    expect(doc.totalMinor).toBe(57000n);
  });
});

describe('تقسيم الأقساط', () => {
  it('يوزّع المبلغ حسب النسب', () => {
    const parts = splitInstallments(100000n, [50, 30, 20]);
    expect(parts).toEqual([50000n, 30000n, 20000n]);
  });

  it('يضيف فرق التقريب لآخر قسط ويحافظ على المجموع', () => {
    const total = 100001n;
    const parts = splitInstallments(total, ['33.33', '33.33', '33.34']);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(total);
  });

  it('يرفض النسب التي لا تساوي 100%', () => {
    expect(() => splitInstallments(100000n, [50, 30])).toThrow(/100%/);
  });
});

describe('حالة الفاتورة', () => {
  const future = new Date(Date.now() + 86_400_000);
  const past = new Date(Date.now() - 86_400_000);

  it('مُرسلة عند عدم وجود مدفوعات قبل الاستحقاق', () => {
    expect(invoicePaymentState(100000n, 0n, future)).toBe('SENT');
  });
  it('متأخرة بعد الاستحقاق بدون سداد كامل', () => {
    expect(invoicePaymentState(100000n, 0n, past)).toBe('OVERDUE');
    expect(invoicePaymentState(100000n, 50000n, past)).toBe('OVERDUE');
  });
  it('مدفوعة جزئيًا', () => {
    expect(invoicePaymentState(100000n, 50000n, future)).toBe('PARTIALLY_PAID');
  });
  it('مدفوعة بالكامل حتى بعد الاستحقاق', () => {
    expect(invoicePaymentState(100000n, 100000n, past)).toBe('PAID');
  });
});

describe('مؤشرات الأعمال', () => {
  it('التوقع المرجّح = القيمة × الاحتمالية', () => {
    expect(weightedForecast(100000n, 65)).toBe(65000n);
    expect(weightedForecast(100000n, '12.5')).toBe(12500n);
  });

  it('ربح المشروع = الإيراد − التكاليف المباشرة', () => {
    const r = projectProfit({ recognizedRevenueMinor: 100000n, directCostsMinor: 40000n });
    expect(r.profitMinor).toBe(60000n);
    expect(r.marginPercent).toBe(60);
    expect(r.includedIndirect).toBe(false);
  });

  it('التكاليف غير المباشرة تُحتسب فقط عند تفعيلها', () => {
    const off = projectProfit({
      recognizedRevenueMinor: 100000n,
      directCostsMinor: 40000n,
      indirectCostsMinor: 20000n,
    });
    const on = projectProfit({
      recognizedRevenueMinor: 100000n,
      directCostsMinor: 40000n,
      indirectCostsMinor: 20000n,
      includeIndirect: true,
    });
    expect(off.profitMinor).toBe(60000n);
    expect(on.profitMinor).toBe(40000n);
    expect(on.includedIndirect).toBe(true);
  });
});

describe('مؤشرات التسويق — الحماية من القسمة على صفر', () => {
  it('CPL يعيد «بيانات غير كافية» عند صفر عملاء', () => {
    expect(cpl(100000n, 0).sufficient).toBe(false);
    expect(cpl(100000n, 50)).toEqual({ value: 20, sufficient: true });
  });

  it('معدل التحويل يعيد «بيانات غير كافية» عند صفر عملاء', () => {
    expect(conversionRate(5, 0).sufficient).toBe(false);
    expect(conversionRate(5, 50)).toEqual({ value: 10, sufficient: true });
  });

  it('ROAS يعيد «بيانات غير كافية» عند صفر إنفاق', () => {
    expect(roas(100000n, 0n).sufficient).toBe(false);
    expect(roas(300000n, 100000n)).toEqual({ value: 3, sufficient: true });
  });
});

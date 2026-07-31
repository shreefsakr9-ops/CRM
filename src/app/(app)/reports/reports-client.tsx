'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Download, Printer } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input } from '@/components/ui/primitives';
import { BarChart, DonutChart, type ValueFormat } from '@/components/ui/charts';
import { KpiCard, KpiGrid } from '@/components/ui/kpi';
import { formatMoney, formatNumber, formatPercent, formatDuration, formatDate } from '@/lib/format';
import { label } from '@/i18n/labels';
import { cn } from '@/lib/utils';

interface SalesReport {
  showMoney: boolean;
  totals: Record<string, number | null>;
  bySource: { label: string; value: number }[];
  byCampaign: { label: string; value: number }[];
  byAgent: { label: string; value: number }[];
  byService: { label: string; value: number }[];
  lossReasons: { label: string; value: number }[];
  ownerPerformance: { label: string; value: number; count: number }[];
}

interface OperationsReport {
  projectsByStatus: { label: string; value: number }[];
  overdueTasks: number;
  blockedTasks: number;
  completedTasks: number;
  onTimeDeliveryRate: number | null;
  estimatedMinutes: number;
  actualMinutes: number;
  clientWaitMinutes: number;
  reviewMinutes: number;
  workload: { label: string; value: number }[];
  revisionsBySource: { label: string; value: number }[];
  delayBreakdown: { label: string; value: number }[];
  departmentBottlenecks: { label: string; value: number }[];
}

interface FinancialReport {
  showProfit: boolean;
  includedIndirect: boolean;
  invoicedMinor: number;
  invoiceCount: number;
  collectedMinor: number;
  outstandingMinor: number;
  overdueMinor: number;
  overdueCount: number;
  recurringValueMinor: number;
  recurringCount: number;
  expensesMinor: number;
  netProfitMinor: number;
  byClient: { label: string; value: number; collected: number }[];
  byService: { label: string; value: number }[];
  byCurrency: { label: string; value: number }[];
  expensesByCategory: { label: string; value: number }[];
  profitability: {
    id: string;
    name: string;
    revenueMinor: number;
    costsMinor: number;
    profitMinor: number;
    marginPercent: number | null;
  }[];
}

interface MarketingRow {
  id: string;
  platform: string;
  campaignName: string;
  periodStart: string;
  periodEnd: string;
  adSpendMinor: number;
  currency: string;
  leads: number;
  qualified: number;
  bookings: number;
  sales: number;
  revenueMinor: number;
  cpl: number | null;
  conversionRate: number | null;
  roas: number | null;
}

const TABS = [
  ['sales', 'المبيعات'],
  ['operations', 'العمليات'],
  ['financial', 'المالية'],
  ['marketing', 'أداء التسويق'],
] as const;

export function ReportsClient({
  sales,
  operations,
  financial,
  marketing,
  range,
  canExport,
}: {
  sales: SalesReport;
  operations: OperationsReport | null;
  financial: FinancialReport | null;
  marketing: MarketingRow[];
  range: { from: string; to: string };
  canExport: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [tab, setTab] = React.useState<(typeof TABS)[number][0]>('sales');

  const setRange = (key: 'from' | 'to', value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  };

  const exportCsv = (name: string, headers: string[], rows: (string | number)[][]) => {
    const csv =
      '﻿' +
      [headers, ...rows]
        .map((r) =>
          r
            .map((v) => {
              const s = String(v ?? '');
              return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            })
            .join(','),
        )
        .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}-${range.from}_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const money = (v: number | null) => (v === null ? '—' : formatMoney(v));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 no-print">
        <div className="flex gap-1 rounded-md border border-line p-0.5">
          {TABS.filter(([key]) =>
            key === 'financial' ? financial !== null : key === 'operations' ? operations !== null : true,
          ).map(([key, text]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'rounded px-3 py-1.5 text-xs transition-colors',
                tab === key ? 'bg-brand/15 text-brand' : 'text-ink-muted hover:text-ink',
              )}
            >
              {text}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <div>
            <label className="bp-label">من</label>
            <Input
              type="date"
              dir="ltr"
              value={range.from}
              onChange={(e) => setRange('from', e.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <label className="bp-label">إلى</label>
            <Input
              type="date"
              dir="ltr"
              value={range.to}
              onChange={(e) => setRange('to', e.target.value)}
              className="h-9"
            />
          </div>
        </div>

        <div className="ms-auto flex gap-2">
          <Button variant="ghost" size="sm" type="button" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            طباعة
          </Button>
        </div>
      </div>

      {tab === 'sales' && (
        <div className="space-y-4">
          <KpiGrid>
            <KpiCard label="عملاء محتملون" value={formatNumber(sales.totals.leads ?? 0)} icon="UserPlus" />
            <KpiCard
              label="بدون تواصل"
              value={formatNumber(sales.totals.uncontacted ?? 0)}
              icon="PhoneOff"
              tone={(sales.totals.uncontacted ?? 0) > 0 ? 'danger' : 'ok'}
            />
            <KpiCard
              label="صفقات ناجحة"
              value={formatNumber(sales.totals.wonCount ?? 0)}
              sublabel={sales.showMoney ? money(sales.totals.wonValueMinor) : undefined}
              icon="TrendingUp"
              tone="ok"
            />
            <KpiCard
              label="معدل الفوز"
              value={formatPercent(sales.totals.winRate)}
              sublabel={`${formatNumber(sales.totals.lostCount ?? 0)} صفقة خاسرة`}
              icon="Target"
            />
          </KpiGrid>

          {sales.showMoney && (
            <KpiGrid>
              <KpiCard label="قيمة المسار" value={money(sales.totals.pipelineValueMinor)} icon="Kanban" tone="brand" />
              <KpiCard label="التوقع المرجّح" value={money(sales.totals.weightedForecastMinor)} icon="LineChart" />
              <KpiCard label="متوسط قيمة الصفقة" value={money(sales.totals.avgDealValueMinor)} icon="Coins" />
              <KpiCard
                label="متوسط دورة البيع"
                value={
                  sales.totals.avgCycleDays === null
                    ? 'بيانات غير كافية'
                    : `${formatNumber(Math.round(sales.totals.avgCycleDays))} يوم`
                }
                icon="Timer"
              />
            </KpiGrid>
          )}

          <KpiGrid className="lg:grid-cols-3">
            <KpiCard label="تحويل Lead → Won" value={formatPercent(sales.totals.leadToWonRate)} icon="Percent" />
            <KpiCard label="تحويل مؤهل → Won" value={formatPercent(sales.totals.qualifiedToWonRate)} icon="Percent" />
            <KpiCard
              label="متوسط زمن الاستجابة"
              value={
                sales.totals.avgResponseHours === null
                  ? 'بيانات غير كافية'
                  : `${formatNumber(Math.round((sales.totals.avgResponseHours ?? 0) * 10) / 10, 'ar', 1)} ساعة`
              }
              icon="Clock"
            />
          </KpiGrid>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="العملاء حسب المصدر"
              data={sales.bySource}
              onExport={
                canExport
                  ? () => exportCsv('leads-by-source', ['المصدر', 'العدد'], sales.bySource.map((r) => [r.label, r.value]))
                  : undefined
              }
            />
            <ChartCard
              title="العملاء حسب الحملة"
              data={sales.byCampaign}
              onExport={
                canExport
                  ? () =>
                      exportCsv('leads-by-campaign', ['الحملة', 'العدد'], sales.byCampaign.map((r) => [r.label, r.value]))
                  : undefined
              }
            />
            <ChartCard title="العملاء حسب الخدمة" data={sales.byService} />
            <ChartCard title="أسباب الخسارة" data={sales.lossReasons} />
          </div>

          <Card>
            <CardHeader
              title="أداء فريق المبيعات"
              action={
                canExport && (
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() =>
                      exportCsv(
                        'sales-performance',
                        ['المندوب', 'عدد الصفقات', sales.showMoney ? 'القيمة' : 'العدد'],
                        sales.ownerPerformance.map((r) => [r.label, r.count, r.value]),
                      )
                    }
                  >
                    <Download className="h-3.5 w-3.5" />
                    تصدير
                  </Button>
                )
              }
            />
            <CardBody>
              <BarChart
                horizontal
                data={sales.ownerPerformance}
                format={sales.showMoney ? 'money' : 'number'}
              />
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'operations' && operations && (
        <div className="space-y-4">
          <KpiGrid>
            <KpiCard label="مهام متأخرة" value={formatNumber(operations.overdueTasks)} icon="AlarmClock" tone={operations.overdueTasks ? 'danger' : 'ok'} />
            <KpiCard label="مهام معطّلة" value={formatNumber(operations.blockedTasks)} icon="Lock" tone="warn" />
            <KpiCard label="مهام مكتملة" value={formatNumber(operations.completedTasks)} icon="CheckCircle2" tone="ok" />
            <KpiCard label="التسليم في الموعد" value={formatPercent(operations.onTimeDeliveryRate)} icon="Timer" />
          </KpiGrid>

          <KpiGrid>
            <KpiCard label="الوقت المقدَّر" value={formatDuration(operations.estimatedMinutes)} icon="Hourglass" />
            <KpiCard label="الوقت الفعلي" value={formatDuration(operations.actualMinutes)} icon="Clock" />
            <KpiCard label="انتظار العميل" value={formatDuration(operations.clientWaitMinutes)} icon="PauseCircle" tone="warn" />
            <KpiCard label="المراجعة الداخلية" value={formatDuration(operations.reviewMinutes)} icon="Eye" />
          </KpiGrid>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="المشاريع حسب الحالة" />
              <CardBody>
                <DonutChart
                  data={operations.projectsByStatus.map((r) => ({
                    label: label('projectStatus', r.label),
                    value: r.value,
                  }))}
                />
              </CardBody>
            </Card>
            <ChartCard title="توزيع الأحمال" data={operations.workload} />
            <Card>
              <CardHeader title="التعديلات حسب المصدر" subtitle="التفرقة بين التعديل الداخلي وطلب العميل" />
              <CardBody>
                <DonutChart
                  data={operations.revisionsBySource.map((r) => ({
                    label: label('revisionSource', r.label),
                    value: r.value,
                  }))}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="تصنيف التأخير" />
              <CardBody>
                <BarChart
                  horizontal
                  data={operations.delayBreakdown.map((r) => ({
                    label: label('delayReason', r.label),
                    value: r.value,
                  }))}
                />
              </CardBody>
            </Card>
            <ChartCard title="اختناقات الأقسام" data={operations.departmentBottlenecks} />
          </div>
        </div>
      )}

      {tab === 'financial' && financial && (
        <div className="space-y-4">
          <KpiGrid>
            <KpiCard label="إجمالي المفوتر" value={formatMoney(financial.invoicedMinor)} sublabel={`${financial.invoiceCount} فاتورة`} icon="ReceiptText" />
            <KpiCard label="المحصَّل" value={formatMoney(financial.collectedMinor)} icon="Wallet" tone="ok" />
            <KpiCard label="المستحقات" value={formatMoney(financial.outstandingMinor)} icon="AlertCircle" tone="warn" />
            <KpiCard
              label="متأخرات"
              value={formatMoney(financial.overdueMinor)}
              sublabel={`${financial.overdueCount} فاتورة`}
              icon="TimerOff"
              tone={financial.overdueCount ? 'danger' : 'ok'}
            />
          </KpiGrid>

          <KpiGrid className="lg:grid-cols-3">
            <KpiCard
              label="الإيراد المتكرر (عقود سارية)"
              value={formatMoney(financial.recurringValueMinor)}
              sublabel={`${financial.recurringCount} عقد`}
              icon="Repeat"
              tone="brand"
            />
            <KpiCard label="المصروفات المباشرة" value={formatMoney(financial.expensesMinor)} icon="CreditCard" tone="warn" />
            <KpiCard
              label="صافي الربح (محصَّل − مصروفات مباشرة)"
              value={formatMoney(financial.netProfitMinor)}
              icon="PiggyBank"
              tone={financial.netProfitMinor >= 0 ? 'ok' : 'danger'}
            />
          </KpiGrid>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="الإيراد حسب العميل"
              format="money"
              data={financial.byClient}
              onExport={
                canExport
                  ? () =>
                      exportCsv(
                        'revenue-by-client',
                        ['العميل', 'المفوتر', 'المحصَّل'],
                        financial.byClient.map((r) => [r.label, r.value, r.collected]),
                      )
                  : undefined
              }
            />
            <ChartCard title="الإيراد حسب الخدمة" format="money" data={financial.byService} />
            <ChartCard
              title="المصروفات حسب التصنيف"
              format="money"
              data={financial.expensesByCategory.map((r) => ({
                label: label('expenseCategory', r.label),
                value: r.value,
              }))}
            />
            <ChartCard title="الفوترة حسب العملة" format="money" data={financial.byCurrency} />
          </div>

          {financial.showProfit && (
            <Card>
              <CardHeader
                title="ربحية المشاريع"
                subtitle={`الربح = الإيراد المحصَّل − التكاليف المباشرة${financial.includedIndirect ? ' − التكاليف غير المباشرة' : ' (التكاليف غير المباشرة غير محتسبة)'}`}
                action={
                  canExport && (
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      onClick={() =>
                        exportCsv(
                          'project-profitability',
                          ['المشروع', 'الإيراد', 'التكاليف', 'الربح', 'الهامش %'],
                          financial.profitability.map((p) => [
                            p.name,
                            p.revenueMinor / 100,
                            p.costsMinor / 100,
                            p.profitMinor / 100,
                            p.marginPercent ?? '',
                          ]),
                        )
                      }
                    >
                      <Download className="h-3.5 w-3.5" />
                      تصدير
                    </Button>
                  )
                }
              />
              <CardBody className="p-0">
                {financial.profitability.length === 0 ? (
                  <EmptyState title="لا توجد بيانات ربحية" description="سجّل الفواتير والمصروفات على المشاريع." />
                ) : (
                  <div className="bp-table-scroll">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="border-b border-line bg-surface-sunken/60 text-[11px] text-ink-faint">
                          <th className="px-3 py-2 text-start">المشروع</th>
                          <th className="px-3 py-2 text-end">الإيراد</th>
                          <th className="px-3 py-2 text-end">التكاليف</th>
                          <th className="px-3 py-2 text-end">الربح</th>
                          <th className="px-3 py-2 text-end">الهامش</th>
                        </tr>
                      </thead>
                      <tbody>
                        {financial.profitability.map((p) => (
                          <tr key={p.id} className="border-b border-line/60 last:border-0">
                            <td className="px-3 py-2.5 text-ink">{p.name}</td>
                            <td className="num px-3 py-2.5 text-end">{formatMoney(p.revenueMinor)}</td>
                            <td className="num px-3 py-2.5 text-end text-warn">{formatMoney(p.costsMinor)}</td>
                            <td
                              className={cn(
                                'num px-3 py-2.5 text-end font-medium',
                                p.profitMinor >= 0 ? 'text-ok' : 'text-danger',
                              )}
                            >
                              {formatMoney(p.profitMinor)}
                            </td>
                            <td className="num px-3 py-2.5 text-end">{formatPercent(p.marginPercent)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {tab === 'marketing' && (
        <Card>
          <CardHeader
            title="أداء الحملات التسويقية"
            subtitle="CPL = الإنفاق ÷ العملاء · معدل التحويل = المبيعات ÷ العملاء × 100 · ROAS = الإيراد ÷ الإنفاق"
            action={
              canExport &&
              marketing.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() =>
                    exportCsv(
                      'marketing-performance',
                      ['المنصة', 'الحملة', 'الإنفاق', 'العملاء', 'المؤهلون', 'الحجوزات', 'المبيعات', 'الإيراد', 'CPL', 'التحويل %', 'ROAS'],
                      marketing.map((r) => [
                        r.platform,
                        r.campaignName,
                        r.adSpendMinor / 100,
                        r.leads,
                        r.qualified,
                        r.bookings,
                        r.sales,
                        r.revenueMinor / 100,
                        r.cpl ?? 'بيانات غير كافية',
                        r.conversionRate ?? 'بيانات غير كافية',
                        r.roas ?? 'بيانات غير كافية',
                      ]),
                    )
                  }
                >
                  <Download className="h-3.5 w-3.5" />
                  تصدير
                </Button>
              )
            }
          />
          <CardBody className="p-0">
            {marketing.length === 0 ? (
              <EmptyState
                title="لا توجد بيانات حملات"
                description="أدخل بيانات الحملات يدويًا (المنصة، الإنفاق، العملاء، المبيعات) لتُحتسب المؤشرات."
              />
            ) : (
              <div className="bp-table-scroll">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface-sunken/60 text-[11px] text-ink-faint">
                      <th className="px-3 py-2 text-start">الحملة</th>
                      <th className="px-3 py-2 text-end">الإنفاق</th>
                      <th className="px-3 py-2 text-center">العملاء</th>
                      <th className="px-3 py-2 text-center">مؤهلون</th>
                      <th className="px-3 py-2 text-center">حجوزات</th>
                      <th className="px-3 py-2 text-center">مبيعات</th>
                      <th className="px-3 py-2 text-end">الإيراد</th>
                      <th className="px-3 py-2 text-end">CPL</th>
                      <th className="px-3 py-2 text-end">التحويل</th>
                      <th className="px-3 py-2 text-end">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketing.map((r) => (
                      <tr key={r.id} className="border-b border-line/60 last:border-0">
                        <td className="px-3 py-2.5">
                          <p className="text-ink">{r.campaignName}</p>
                          <p className="text-[11px] text-ink-faint">
                            {r.platform} · {formatDate(r.periodStart)} → {formatDate(r.periodEnd)}
                          </p>
                        </td>
                        <td className="num px-3 py-2.5 text-end">{formatMoney(r.adSpendMinor, r.currency)}</td>
                        <td className="num px-3 py-2.5 text-center">{r.leads}</td>
                        <td className="num px-3 py-2.5 text-center">{r.qualified}</td>
                        <td className="num px-3 py-2.5 text-center">{r.bookings}</td>
                        <td className="num px-3 py-2.5 text-center">{r.sales}</td>
                        <td className="num px-3 py-2.5 text-end">{formatMoney(r.revenueMinor, r.currency)}</td>
                        <td className="num px-3 py-2.5 text-end">
                          {r.cpl === null ? (
                            <Badge tone="muted">بيانات غير كافية</Badge>
                          ) : (
                            formatNumber(Math.round(r.cpl * 100) / 100, 'ar', 2)
                          )}
                        </td>
                        <td className="num px-3 py-2.5 text-end">
                          {r.conversionRate === null ? (
                            <Badge tone="muted">—</Badge>
                          ) : (
                            formatPercent(r.conversionRate)
                          )}
                        </td>
                        <td className="num px-3 py-2.5 text-end">
                          {r.roas === null ? (
                            <Badge tone="muted">—</Badge>
                          ) : (
                            `${formatNumber(Math.round(r.roas * 100) / 100, 'ar', 2)}×`
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function ChartCard({
  title,
  data,
  onExport,
  format = 'number',
}: {
  title: string;
  data: { label: string; value: number }[];
  onExport?: () => void;
  format?: ValueFormat;
}) {
  return (
    <Card>
      <CardHeader
        title={title}
        action={
          onExport && (
            <Button size="sm" variant="ghost" type="button" onClick={onExport}>
              <Download className="h-3.5 w-3.5" />
              تصدير
            </Button>
          )
        }
      />
      <CardBody>
        <BarChart horizontal data={data} format={format} />
      </CardBody>
    </Card>
  );
}

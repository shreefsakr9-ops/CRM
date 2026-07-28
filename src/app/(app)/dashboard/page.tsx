import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/server/auth/guard';
import { buildDashboard } from '@/server/services/dashboard';
import { KpiCard, KpiGrid } from '@/components/ui/kpi';
import { Card, CardBody, CardHeader, Badge, EmptyState, Progress } from '@/components/ui/primitives';
import { BarChart, LineChart } from '@/components/ui/charts';
import { formatMoney, formatDate, formatNumber, formatPercent } from '@/lib/format';
import { label, tone } from '@/i18n/labels';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'لوحة التحكم' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await buildDashboard(user);
  const { executive, sales, employee, operations } = data;

  const money = (v: number) => formatMoney(v, 'EGP', 'ar', { compact: v > 1_000_00 });

  return (
    <div className="space-y-6">
      <PageHeader
        title={`أهلًا، ${user.name.split(' ')[0]}`}
        description={`نظرة سريعة على ما يخصك اليوم · ${formatDate(new Date(), 'ar', user.timezone)}`}
      />

      {/* ── ملخص المستخدم ─────────────────────────────── */}
      <section>
        <KpiGrid>
          <KpiCard label="مهامي المفتوحة" value={formatNumber(employee.myTasks)} icon="ListChecks" href="/my-tasks" />
          <KpiCard
            label="مستحقة اليوم"
            value={formatNumber(employee.dueToday)}
            icon="CalendarClock"
            tone="warn"
            href="/my-tasks?filter=today"
          />
          <KpiCard
            label="متأخرة"
            value={formatNumber(employee.overdue)}
            icon="AlarmClock"
            tone={employee.overdue > 0 ? 'danger' : 'ok'}
            href="/my-tasks?filter=overdue"
          />
          <KpiCard
            label="ساعات هذا الأسبوع"
            value={formatNumber(Math.round((employee.weeklyMinutes / 60) * 10) / 10, 'ar', 1)}
            sublabel={`${formatNumber(employee.projects)} مشروع مسند إليك`}
            icon="Timer"
            tone="info"
          />
        </KpiGrid>
      </section>

      {/* ── تنفيذي ────────────────────────────────────── */}
      {executive && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">أداء الشركة</h2>
          <KpiGrid>
            <KpiCard
              label="الإيرادات المحصلة"
              value={money(executive.collectedMinor)}
              icon="Wallet"
              tone="ok"
              href="/payments"
            />
            <KpiCard
              label="مبيعات الشهر (صفقات ناجحة)"
              value={money(executive.wonRevenueMinor)}
              icon="TrendingUp"
              delta={
                executive.wonRevenuePrevMinor > 0
                  ? ((executive.wonRevenueMinor - executive.wonRevenuePrevMinor) /
                      executive.wonRevenuePrevMinor) *
                    100
                  : null
              }
              deltaLabel="مقارنة بالشهر السابق"
            />
            <KpiCard
              label="المستحقات غير المحصلة"
              value={money(executive.outstandingMinor)}
              sublabel={`${formatNumber(executive.overdueInvoices)} فاتورة متأخرة`}
              icon="ReceiptText"
              tone={executive.overdueInvoices > 0 ? 'danger' : 'neutral'}
              href="/invoices?status=OVERDUE"
            />
            <KpiCard
              label="قيمة مسار المبيعات"
              value={money(executive.pipelineValueMinor)}
              sublabel={`متوقع مرجّح: ${money(executive.weightedForecastMinor)}`}
              icon="Kanban"
              tone="brand"
              href="/pipeline"
            />
          </KpiGrid>

          <KpiGrid>
            <KpiCard label="عملاء نشطون" value={formatNumber(executive.activeClients)} sublabel={`${formatNumber(executive.newClients)} جديد هذا الشهر`} icon="Building2" href="/clients" />
            <KpiCard label="مشاريع جارية" value={formatNumber(executive.activeProjects)} sublabel={`${formatNumber(executive.delayedProjects)} متأخر`} icon="FolderKanban" tone={executive.delayedProjects ? 'warn' : 'neutral'} href="/projects" />
            <KpiCard label="مهام متأخرة" value={formatNumber(executive.overdueTasks)} icon="AlertTriangle" tone={executive.overdueTasks ? 'danger' : 'ok'} href="/tasks?filter=overdue" />
            <KpiCard label="عقود قريبة التجديد" value={formatNumber(executive.renewingContracts)} icon="FileSignature" tone="warn" href="/contracts?filter=renewing" />
          </KpiGrid>

          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="التحصيلات خلال ١٢ شهرًا" subtitle="بالجنيه المصري" />
              <CardBody>
                <LineChart data={executive.revenueTrend} format="money-compact" />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="مشاريع معرضة للخطر" />
              <CardBody className="p-0">
                {executive.atRiskProjects.length === 0 ? (
                  <EmptyState title="لا توجد مشاريع معرضة للخطر" description="كل المشاريع ضمن الجدول الزمني." />
                ) : (
                  <ul className="divide-y divide-line">
                    {executive.atRiskProjects.map((p) => (
                      <li key={p.id}>
                        <Link href={`/projects/${p.id}`} className="block px-4 py-2.5 hover:bg-navy-800/40">
                          <p className="truncate text-sm text-ink">{p.name}</p>
                          <p className="mt-0.5 text-[11px] text-warn">{p.reason}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader title="أكثر الخدمات مبيعًا" subtitle="بقيمة الصفقات الناجحة" />
              <CardBody>
                <BarChart horizontal data={executive.topServices} format="money-compact" />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="أكثر مصادر العملاء فعالية" subtitle="بعدد العملاء المحتملين" />
              <CardBody>
                <BarChart horizontal data={executive.topSources} />
              </CardBody>
            </Card>
          </div>
        </section>
      )}

      {/* ── المبيعات ──────────────────────────────────── */}
      {sales && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">المبيعات</h2>
          <KpiGrid>
            <KpiCard label="عملاء محتملون جدد (هذا الشهر)" value={formatNumber(sales.newLeads)} icon="UserPlus" href="/leads" />
            <KpiCard label="بدون تواصل" value={formatNumber(sales.uncontacted)} icon="PhoneOff" tone={sales.uncontacted ? 'danger' : 'ok'} href="/leads?filter=uncontacted" />
            <KpiCard label="متابعات مستحقة" value={formatNumber(sales.followUpsDue)} icon="CalendarCheck" tone="warn" href="/leads?filter=followup" />
            <KpiCard label="متابعات متأخرة" value={formatNumber(sales.followUpsOverdue)} icon="CalendarX" tone={sales.followUpsOverdue ? 'danger' : 'ok'} href="/leads?filter=followup-overdue" />
          </KpiGrid>

          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="قيمة الصفقات المفتوحة حسب المرحلة" subtitle="بالجنيه المصري" />
              <CardBody>
                <BarChart data={sales.byStage} format="money-compact" />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="مؤشرات المبيعات" />
              <CardBody className="space-y-3.5">
                <Metric label="معدل التحويل" value={formatPercent(sales.conversionRate)} />
                <Metric
                  label="متوسط زمن الاستجابة"
                  value={
                    sales.avgResponseHours === null
                      ? 'بيانات غير كافية'
                      : `${formatNumber(Math.round(sales.avgResponseHours * 10) / 10, 'ar', 1)} ساعة`
                  }
                />
                <Metric label="صفقات ناجحة / خاسرة" value={`${formatNumber(sales.wonCount)} / ${formatNumber(sales.lostCount)}`} />
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-ink-faint">تحقيق التارجت</span>
                    <span className="num text-ink">
                      {money(sales.achievedMinor)} / {money(sales.targetMinor)}
                    </span>
                  </div>
                  <Progress
                    value={sales.targetMinor > 0 ? (sales.achievedMinor / sales.targetMinor) * 100 : 0}
                    showLabel
                    tone={
                      sales.targetMinor > 0 && sales.achievedMinor / sales.targetMinor >= 1
                        ? 'ok'
                        : 'brand'
                    }
                  />
                </div>
              </CardBody>
            </Card>
          </div>
        </section>
      )}

      {/* ── العمليات ──────────────────────────────────── */}
      {operations && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">العمليات</h2>
          <KpiGrid>
            <KpiCard label="مشاريع نشطة" value={formatNumber(operations.activeProjects)} icon="FolderKanban" href="/projects" />
            <KpiCard label="معرضة للخطر" value={formatNumber(operations.atRisk)} icon="ShieldAlert" tone={operations.atRisk ? 'danger' : 'ok'} href="/projects?status=AT_RISK" />
            <KpiCard label="بانتظار مراجعة داخلية" value={formatNumber(operations.pendingInternalReviews)} icon="Eye" tone="warn" href="/tasks?status=WAITING_INTERNAL_REVIEW" />
            <KpiCard label="بانتظار العميل" value={formatNumber(operations.pendingClientApprovals)} icon="Hourglass" tone="warn" href="/tasks?status=WAITING_CLIENT" />
          </KpiGrid>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader title="توزيع الأحمال على الفريق" subtitle="عدد المهام المسندة" />
              <CardBody>
                <BarChart horizontal data={operations.workload} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="جودة التنفيذ" />
              <CardBody className="space-y-3.5">
                <Metric
                  label="التسليم في الموعد"
                  value={formatPercent(operations.onTimeDeliveryRate)}
                />
                <Metric label="تسليمات متأخرة" value={formatNumber(operations.delayedDeliverables)} />
                <Metric
                  label="التعديلات (داخلي / عميل)"
                  value={`${formatNumber(operations.revisionsInternal)} / ${formatNumber(operations.revisionsClient)}`}
                />
              </CardBody>
            </Card>
          </div>
        </section>
      )}

      {/* ── أجندتي ────────────────────────────────────── */}
      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="أقرب مهامي"
            action={
              <Link href="/my-tasks" className="text-xs text-brand hover:underline">
                عرض الكل
              </Link>
            }
          />
          <CardBody className="p-0">
            {employee.agenda.length === 0 ? (
              <EmptyState title="لا توجد مهام مفتوحة" description="كل شيء مكتمل — عمل ممتاز." />
            ) : (
              <ul className="divide-y divide-line">
                {employee.agenda.map((t) => (
                  <li key={t.id}>
                    <Link href={`/tasks/${t.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-navy-800/40">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink">{t.title}</p>
                        <p className="mt-0.5 text-[11px] text-ink-faint">
                          {t.dueDate ? formatDate(t.dueDate, 'ar', user.timezone) : 'بدون موعد'}
                        </p>
                      </div>
                      <Badge tone={tone('taskStatus', t.status)}>{label('taskStatus', t.status)}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="آخر الإشارات إليك" subtitle="التعليقات التي ذُكرت فيها" />
          <CardBody className="p-0">
            {employee.recentComments.length === 0 ? (
              <EmptyState title="لا توجد إشارات" description="ستظهر هنا التعليقات التي يُشار إليك فيها." />
            ) : (
              <ul className="divide-y divide-line">
                {employee.recentComments.map((c) => (
                  <li key={c.id} className="px-4 py-2.5">
                    <p className="text-xs text-ink-muted">{c.body}</p>
                    <p className="mt-1 text-[11px] text-ink-faint">
                      {c.author} · {formatDate(c.createdAt, 'ar', user.timezone, true)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </section>
    </div>
  );
}

function Metric({ label: l, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-ink-faint">{l}</span>
      <span className="num text-sm font-medium text-ink">{value}</span>
    </div>
  );
}

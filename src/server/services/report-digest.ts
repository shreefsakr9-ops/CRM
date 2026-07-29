import 'server-only';
import { prisma } from '@/server/db';
import { runAsUser, can } from '@/server/auth/guard';
import { buildActor } from '@/server/auth/session';
import { salesReport, financialReport, operationsReport, parseRange } from './reports';
import { sendMail, renderEmail, appUrl, isMailEnabled, type EmailBlock } from './mailer';
import { getSettings } from './settings';
import { formatMoney, formatNumber, formatPercent, daysLabel } from '@/lib/format';

/**
 * ملخص إداري دوري بالبريد.
 *
 * القاعدة الحاكمة: التقرير يُبنى **لكل مستلم على حدة داخل هويته**، فتنطبق عليه
 * نفس فحوص الصلاحيات ونفس نطاق البيانات المطبَّقة في الواجهة. البديل — استعلام
 * واحد يُرسل للجميع — كان سيسرّب أرقامًا مالية لمن لا يملك `view_financial`
 * ويكسر نطاق OWN/TEAM.
 */

export type DigestPeriod = 'WEEKLY' | 'MONTHLY';

/** بناء محتوى الملخص بهوية مستخدم محدد. */
async function buildForUser(userId: string, days: number) {
  const actor = await buildActor(userId);
  if (!actor) return null;

  return runAsUser(actor, async () => {
    const range = parseRange(
      new Date(Date.now() - days * 86_400_000).toISOString(),
      new Date().toISOString(),
    );
    const settings = await getSettings();
    const currency = settings.locale.baseCurrency;
    const blocks: EmailBlock[] = [];

    // المبيعات: متاحة لكل من يملك عرض التقارير. القيم المالية داخلها محجوبة
    // أصلًا من `salesReport` لمن لا يملك `view_financial` (تعود null).
    if (can(actor, 'reports', 'view')) {
      const sales = await salesReport(range);
      blocks.push(
        { title: 'عملاء محتملون جدد', value: formatNumber(sales.totals.leads) },
        { title: 'صفقات ناجحة', value: formatNumber(sales.totals.wonCount) },
      );
      if (sales.totals.winRate !== null) {
        blocks.push({ title: 'معدل الفوز', value: formatPercent(sales.totals.winRate) });
      }
      if (sales.totals.pipelineValueMinor !== null) {
        blocks.push({
          title: 'قيمة المسار المفتوح',
          value: formatMoney(sales.totals.pipelineValueMinor, currency),
        });
      }
    }

    // الأرقام المالية لمن يملك صلاحيتها فقط — `financialReport` نفسه يرفض غيره.
    if (can(actor, 'reports', 'view_financial')) {
      const finance = await financialReport(range);
      blocks.push(
        { title: 'المفوتر خلال الفترة', value: formatMoney(finance.invoicedMinor, currency) },
        { title: 'المحصَّل', value: formatMoney(finance.collectedMinor, currency) },
        {
          title: 'المتأخرات',
          value: `${formatMoney(finance.overdueMinor, currency)} (${formatNumber(finance.overdueCount)} فاتورة)`,
        },
      );
    }

    if (can(actor, 'reports', 'view')) {
      const ops = await operationsReport(range);
      if (ops.onTimeDeliveryRate !== null) {
        blocks.push({
          title: 'التسليم في الموعد',
          value: formatPercent(ops.onTimeDeliveryRate),
        });
      }
      blocks.push({ title: 'مهام متأخرة', value: formatNumber(ops.overdueTasks) });
    }

    return blocks.length > 0 ? blocks : null;
  });
}

/** المستلمون: أصحاب الأدوار المحددة في الإعدادات، النشطون فقط. */
async function recipients() {
  const settings = await getSettings();
  if (!settings.reports.digestRoles.length) return [];

  return prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      role: { key: { in: settings.reports.digestRoles } },
    },
    orderBy: { name: 'asc' },
    select: { id: true, email: true, name: true },
  });
}

export interface DigestResult {
  sent: number;
  skipped: number;
  reason?: string;
}

export async function sendReportDigest(period: DigestPeriod): Promise<DigestResult> {
  if (!isMailEnabled()) return { sent: 0, skipped: 0, reason: 'SMTP غير مضبوط' };

  const settings = await getSettings();
  if (!settings.reports.digestEnabled) {
    return { sent: 0, skipped: 0, reason: 'الملخص الدوري معطّل في الإعدادات' };
  }
  if (settings.reports.digestPeriod !== period) {
    return { sent: 0, skipped: 0, reason: 'فترة مختلفة عن المضبوطة' };
  }

  const days = period === 'WEEKLY' ? 7 : 30;
  const people = await recipients();
  const label = period === 'WEEKLY' ? 'الأسبوعي' : 'الشهري';

  let sent = 0;
  let skipped = 0;

  for (const person of people) {
    const blocks = await buildForUser(person.id, days);
    // من لا يملك أي صلاحية تقارير لا يُرسل له ملخص فارغ.
    if (!blocks) {
      skipped++;
      continue;
    }

    const result = await sendMail({
      to: person.email,
      subject: `الملخص ${label} — Blue Point OS`,
      html: await renderEmail({
        heading: `الملخص ${label}`,
        intro: `مرحبًا ${person.name}، هذه أرقام آخر ${daysLabel(days)} حسب صلاحياتك.`,
        blocks,
        action: { label: 'فتح التقارير', url: appUrl('/reports') },
        footnote:
          'الأرقام محسوبة بنفس منطق صفحة التقارير وضمن نطاق بياناتك. لإيقاف هذا الملخص راجع مدير النظام.',
      }),
    });
    if (result.status === 'sent') sent++;
    else skipped++;
  }

  return { sent, skipped };
}

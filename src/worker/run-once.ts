/** تشغيل دورة واحدة من الوظائف المجدولة — مفيد للاختبار وللـ cron الخارجي. */
import { runAllJobs } from './jobs';
import { prisma } from '@/server/db';

async function main() {
  const results = await runAllJobs();
  for (const r of results) {
    console.info(`${r.key}: ${r.count}${r.message ? ` — ${r.message}` : ''}`);
  }
  await prisma.$disconnect();
}

void main();

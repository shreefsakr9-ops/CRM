/**
 * Background Worker — عملية مستقلة عن تطبيق الويب.
 * تشغيل: npm run worker (أو حاوية worker في docker compose).
 */
import { runAllJobs } from './jobs';
import { prisma } from '@/server/db';

const INTERVAL_SECONDS = Number(process.env.WORKER_INTERVAL_SECONDS ?? 300);

let running = false;
let stopping = false;

async function tick() {
  if (running) {
    console.warn('[worker] الدورة السابقة لم تنتهِ بعد — تخطي هذه الدورة');
    return;
  }
  running = true;
  const startedAt = Date.now();
  try {
    const results = await runAllJobs();
    const created = results.reduce((s, r) => s + r.count, 0);
    console.info(
      `[worker] اكتملت الدورة في ${Date.now() - startedAt}ms — ${created} إشعار/عنصر`,
      results.map((r) => `${r.key}:${r.count}`).join(' '),
    );
  } catch (error) {
    console.error('[worker] خطأ غير متوقع في الدورة:', error);
  } finally {
    running = false;
  }
}

async function main() {
  console.info(`▶ Blue Point OS Worker — كل ${INTERVAL_SECONDS} ثانية`);
  await tick();
  const timer = setInterval(() => {
    if (!stopping) void tick();
  }, INTERVAL_SECONDS * 1000);

  const shutdown = async (signal: string) => {
    console.info(`[worker] إيقاف بإشارة ${signal}…`);
    stopping = true;
    clearInterval(timer);
    // انتظار انتهاء الدورة الجارية قبل الإغلاق حتى لا تُقطع عملية كتابة.
    const deadline = Date.now() + 30_000;
    while (running && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250));
    }
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();

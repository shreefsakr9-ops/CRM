/**
 * تشغيل نسخة الإنتاج المبنية لاختبارات المتصفح.
 *
 * لماذا `next start` لا `next dev`: الاختبار يجب أن يفحص ما سيُنشر فعلًا.
 * وضع التطوير يتسامح مع أخطاء يرفضها البناء، ويعيد صفحات مختلفة (Fast Refresh،
 * رسائل أخطاء مفصّلة) — فاختباره لا يثبت أن الإنتاج سليم.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import net from 'node:net';

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3210);
export const E2E_BASE = `http://127.0.0.1:${E2E_PORT}`;

let server: ChildProcess | null = null;

async function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net
      .createServer()
      .once('error', () => resolve(true))
      .once('listening', () => probe.close(() => resolve(false)))
      .listen(port, '127.0.0.1');
  });
}

async function waitForReady(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    if (server?.exitCode !== null && server?.exitCode !== undefined) {
      throw new Error(`الخادم توقف قبل أن يجهز (رمز الخروج ${server.exitCode})`);
    }
    try {
      // صفحة الدخول عامة ولا تلمس الجلسة — أخف نقطة جاهزية.
      const res = await fetch(`${E2E_BASE}/login`, { redirect: 'manual' });
      if (res.status < 500) return;
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`الخادم لم يجهز خلال ${timeoutMs}ms — آخر خطأ: ${lastError}`);
}

export async function startServer() {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL غير مضبوط');

  // رسالة صريحة بدل «الخادم توقف»: النسيان الأشيع هو تشغيل الاختبارات قبل
  // البناء، وخطأ Next عنها يضيع وسط سجلّ طويل.
  if (!existsSync('.next/BUILD_ID')) {
    throw new Error('لا توجد نسخة إنتاج مبنية — شغّل `npm run build` قبل اختبارات المتصفح');
  }

  if (await portInUse(E2E_PORT)) {
    // خادم معلّق من تشغيل سابق يعطي فشلًا مضلّلًا: الاختبارات تعمل على نسخة
    // قديمة من الكود بدل ما بُني الآن.
    throw new Error(
      `المنفذ ${E2E_PORT} مشغول — أوقف الخادم المعلّق أولًا (pkill -f "next start")`,
    );
  }

  // نشغّل ملف Next التنفيذي مباشرةً لا عبر npx: npx يضيف عملية وسيطة لا تمرّر
  // إشارة الإنهاء لابنها، فيبقى الخادم حيًّا بعد انتهاء الاختبارات ويحجز المنفذ.
  const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');

  server = spawn(process.execPath, [nextBin, 'start', '-p', String(E2E_PORT), '-H', '127.0.0.1'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DATABASE_URL: databaseUrl,
      APP_URL: E2E_BASE,
      SESSION_SECRET: process.env.SESSION_SECRET ?? 'e2e-session-secret-not-for-production',
      FILE_SIGNING_SECRET: process.env.FILE_SIGNING_SECRET ?? 'e2e-file-secret-not-for-production',
      // خادم بريد «مضبوط» لكنه مسدود عمدًا: الواجهة تعرض مسار الإرسال كاملًا
      // (اختيار المستلم والنسخ) بدل إخفائه، وأي إرسال فعلي يفشل فورًا باتصال
      // مرفوض بدل أن يخرج بريد حقيقي من بيئة اختبار.
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1',
      SMTP_FROM: 'Blue Point OS E2E <no-reply@invalid>',
    },
    // مجموعة عمليات خاصة حتى نتمكن من إنهاء الشجرة كاملة لا العملية الأم فقط.
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // لا نصمت مخرجات الخادم: خطأ داخل صفحة يظهر هنا فقط، ومن دونه يصبح فشل
  // الاختبار مجرد «العنصر غير موجود» بلا سبب.
  server.stdout?.on('data', (b: Buffer) => process.stdout.write(`[next] ${b}`));
  server.stderr?.on('data', (b: Buffer) => process.stderr.write(`[next] ${b}`));

  await waitForReady();
}

export async function stopServer() {
  const child = server;
  server = null;
  if (!child?.pid) return;

  const killTree = (signal: NodeJS.Signals) => {
    try {
      process.kill(-child.pid!, signal);
    } catch {
      // المجموعة انتهت بالفعل.
    }
  };

  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  killTree('SIGTERM');
  await Promise.race([exited, new Promise((r) => setTimeout(r, 5_000))]);
  killTree('SIGKILL');
}
